import { Response } from 'express'
import prisma, { IS_OFFLINE_BUILD } from '../config/prisma'
import bcrypt from 'bcryptjs'
import { AuthRequest } from '../middleware/auth'
import { demoLimitBlock } from '../config/demo'
import { generateRawToken, hashToken, INVITE_TOKEN_TTL_MS } from '../utils/resetToken'
import { sendPasswordSetupEmail } from '../utils/email'

// Trims, drops blanks, and dedupes — a stray empty string or repeated entry from the
// client shouldn't end up stored.
function sanitizeDepartments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((d) => String(d).trim()).filter(Boolean))]
}

export const getTeachers = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    // Optional ?term= for university semester scoping (filters to teachers who
    // have at least one course assignment in that semester via TeacherSubject).
    // A teacher with zero course assignments anywhere is included only in the
    // semester they were created under (createdForTerm) — not every tab, and not
    // hidden everywhere either (the dead end this replaced: a brand-new teacher
    // had no course yet, got filtered out of every term tab, and there was no UI
    // path left to ever assign them one). createdForTerm stops mattering the
    // moment they have ANY course — assigning one in a different semester IS how
    // an admin "transfers" a teacher there, no separate action needed. Rows from
    // before this field existed have createdForTerm: null, so they still show in
    // every tab until they're assigned a course, matching prior behavior.
    const term = req.query.term ? String(req.query.term) : undefined
    const teachers = await prisma.user.findMany({
      where: {
        schoolId,
        isActive: true,
        role: { in: ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL'] },
        ...(term
          ? {
              OR: [
                { teacherSubjects: { some: { subject: { term } } } },
                { teacherSubjects: { none: {} }, createdForTerm: null },
                { teacherSubjects: { none: {} }, createdForTerm: term },
              ],
            }
          : {}),
      },
      select: {
        id: true, name: true, email: true, role: true, masterClassLevel: true, createdAt: true, departments: true,
        passwordSetAt: true,
        teacherSubjects: { select: { subject: { select: { classLevel: true } } } },
      },
      orderBy: { name: 'asc' }
    })
    // classLevels: every class this teacher is attached to, whether by an assigned
    // subject or by being class master — the department picker (secondary/university)
    // groups teachers by department. A teacher's department membership is the union
    // of this (derived from what they actually teach) and their explicit
    // `departments` placement, so they show up under a department the moment
    // they're placed there, not only once a subject happens to be assigned.
    const shaped = teachers.map(({ teacherSubjects, passwordSetAt, ...t }) => ({
      ...t,
      // Online-invited teacher who hasn't clicked their setup link yet. Always
      // false for offline-created teachers (passwordSetAt is stamped immediately
      // there) and for anyone created before this feature existed (backfilled).
      pendingSetup: passwordSetAt === null,
      classLevels: [...new Set([
        ...teacherSubjects.map((ts) => ts.subject.classLevel),
        ...(t.masterClassLevel ? [t.masterClassLevel] : []),
      ])],
    }))
    res.json({ teachers: shaped, total: shaped.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, email, password, role, masterClassLevel, departments, term } = req.body

    if (role === 'CLASS_MASTER' && !masterClassLevel) {
      res.status(400).json({ message: 'masterClassLevel is required for Class Master' })
      return
    }

    const limit = await demoLimitBlock(schoolId, 'teachers')
    if (limit) { res.status(403).json({ message: limit }); return }

    const existing = await prisma.user.findUnique({ where: { email } })

    // Only an ACTIVE user with this email is a real conflict. A soft-deleted
    // user (isActive: false) still holds the unique email, so re-creating a
    // previously deleted teacher would otherwise fail — reactivate it instead.
    if (existing && existing.isActive) {
      res.status(400).json({ message: 'Email already exists' })
      return
    }

    let hashedPassword: string
    let inviteToken: string | null = null
    let passwordSetAt: Date | null = null

    if (IS_OFFLINE_BUILD) {
      hashedPassword = await bcrypt.hash(password, 12)
      // The admin hands them a real, working password directly — nothing pending.
      passwordSetAt = new Date()
    } else {
      // Online: the admin never sets or knows a teacher's password — a random
      // unusable placeholder is stored and the teacher picks their own via the
      // emailed setup link (see sendPasswordSetupEmail below). passwordSetAt stays
      // null until they actually complete that flow (passwordReset.controller.ts).
      hashedPassword = await bcrypt.hash(generateRawToken(), 12)
      inviteToken = generateRawToken()
    }

    const data = {
      name, email, password: hashedPassword, role, schoolId,
      masterClassLevel: masterClassLevel ?? null,
      departments: sanitizeDepartments(departments),
      passwordSetAt,
      // Only meaningful for a teacher with zero course assignments yet (see
      // getTeachers) — harmless to store for non-university schools too.
      createdForTerm: term ? String(term) : null,
      ...(inviteToken
        ? { resetTokenHash: hashToken(inviteToken), resetTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) }
        : {}),
    }
    const select = { id: true, name: true, email: true, role: true, masterClassLevel: true, createdAt: true, departments: true }

    const teacher = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { ...data, isActive: true }, select })
      : await prisma.user.create({ data, select })

    if (inviteToken) {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { language: true } })
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')
      const setupUrl = `${frontendUrl}/reset-password?token=${inviteToken}`
      await sendPasswordSetupEmail({ to: teacher.email, resetUrl: setupUrl, lang: school?.language === 'FR' ? 'FR' : 'EN' })
    }

    res.status(201).json({ message: 'Teacher created', teacher })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { role, masterClassLevel, departments } = req.body

    const teacher = await prisma.user.findFirst({ where: { id, schoolId } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    let displacedName: string | null = null

    // If promoting to CLASS_MASTER, demote the current master of that class
    if (role === 'CLASS_MASTER' && masterClassLevel) {
      const currentMaster = await prisma.user.findFirst({
        where: { schoolId, role: 'CLASS_MASTER', masterClassLevel, id: { not: id } }
      })
      if (currentMaster) {
        await prisma.user.update({
          where: { id: currentMaster.id },
          data: { role: 'CLASS_TEACHER', masterClassLevel: null }
        })
        displacedName = currentMaster.name
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role,
        masterClassLevel: role === 'CLASS_MASTER' ? (masterClassLevel ?? null) : null,
        // Only touched when the client actually sent it, same as birth details on
        // Student — a caller that knows nothing about departments shouldn't wipe them.
        ...(departments !== undefined ? { departments: sanitizeDepartments(departments) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, masterClassLevel: true, createdAt: true, departments: true }
    })

    res.json({
      message: 'Teacher updated',
      teacher: updated,
      displaced: displacedName
        ? `${displacedName} was removed as Class Master and is now a Class Teacher`
        : undefined
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteTeacher = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const teacher = await prisma.user.findFirst({ where: { id, schoolId } })
    if (!teacher) {
      res.status(404).json({ message: 'Teacher not found' })
      return
    }

    await prisma.user.update({ where: { id }, data: { isActive: false } })
    res.json({ message: 'Teacher removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getTeacherSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const assigned = await prisma.teacherSubject.findMany({
      where: { userId: id },
      include: { subject: true },
    })
    res.json({ subjects: assigned.map((a) => a.subject) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const assignTeacherSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const { subjectIds }: { subjectIds: string[] } = req.body
    const reassigned: string[] = []

    // For each subject, if another teacher already has it → take it from them
    for (const subjectId of subjectIds) {
      const existing = await prisma.teacherSubject.findFirst({
        where: { subjectId, userId: { not: id } },
        include: { user: true, subject: true },
      })
      if (existing) {
        await prisma.teacherSubject.delete({ where: { id: existing.id } })
        reassigned.push(
          `"${existing.subject.name} (${existing.subject.classLevel})" was reassigned from ${existing.user.name}`
        )
      }
    }

    // Replace all assignments for this teacher
    await prisma.teacherSubject.deleteMany({ where: { userId: id } })
    if (subjectIds.length > 0) {
      await prisma.teacherSubject.createMany({
        data: subjectIds.map((sid) => ({ userId: id, subjectId: sid })),
        skipDuplicates: true,
      })
    }

    res.json({
      message: 'Subjects assigned successfully',
      reassigned: reassigned.length > 0 ? reassigned : undefined,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

import { Response } from 'express'
import prisma, { IS_OFFLINE_BUILD } from '../config/prisma'
import bcrypt from 'bcryptjs'
import { AuthRequest } from '../middleware/auth'
import { demoLimitBlock } from '../config/demo'
import { generateRawToken, hashToken, INVITE_TOKEN_TTL_MS } from '../utils/resetToken'
import { sendPasswordSetupEmail } from '../utils/email'
import { takeCoursesFromOtherTeachers } from '../utils/courseAssignment'
import { applyClassTeachingTeam, classTeamRoster } from './classlevel.controller'
import { validateNewPassword, validateUsername } from '../utils/passwordValidation'

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
                { teacherSubjects: { some: { endedAt: null, subject: { term } } } },
                { teacherSubjects: { none: { endedAt: null } }, createdForTerm: null },
                { teacherSubjects: { none: { endedAt: null } }, createdForTerm: term },
              ],
            }
          : {}),
      },
      select: {
        id: true, name: true, email: true, username: true, role: true, masterClassLevel: true, createdAt: true, departments: true,
        passwordSetAt: true,
        // Active only: a course handed over should stop appearing against this teacher.
        teacherSubjects: { where: { endedAt: null }, select: { subject: { select: { classLevel: true } } } },
      },
      orderBy: { name: 'asc' }
    })
    // classLevels: every class this teacher is attached to, whether by an assigned
    // subject or by being class master — the department picker (secondary/university)
    // groups teachers by department. A teacher's department membership is the union
    // of this (derived from what they actually teach) and their explicit
    // `departments` placement, so they show up under a department the moment
    // they're placed there, not only once a subject happens to be assigned.
    // Which sitting(s) a lecturer actually teaches, derived from the classes their live
    // courses belong to. University only in practice: every other school type has DAY
    // classes exclusively, so this always comes back as ['DAY'] and the UI hides it.
    const programmeByClassLevel = new Map(
      (await prisma.classLevel.findMany({ where: { schoolId }, select: { name: true, programme: true } }))
        .map((c) => [c.name, c.programme as string]),
    )

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
      // Derived from ASSIGNED courses, not timetable slots: an assignment is what generates
      // the hours, and it survives a timetable being rebuilt. Empty when they hold nothing
      // yet, which the UI shows as no badge rather than guessing.
      programmes: [...new Set(
        teacherSubjects
          .map((ts) => programmeByClassLevel.get(ts.subject.classLevel))
          .filter((p): p is string => !!p),
      )].sort(),
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
    const { name, email, username, password, role, masterClassLevel, departments, term, classLevel } = req.body

    // Exactly one identifier — a username is for someone with no email at all, not an
    // extra field alongside one.
    const hasEmail = typeof email === 'string' && email.trim().length > 0
    const hasUsername = typeof username === 'string' && username.trim().length > 0
    if (hasEmail === hasUsername) {
      res.status(400).json({ message: hasEmail ? 'Provide either an email or a username, not both' : 'An email or a username is required' })
      return
    }
    if (hasUsername) {
      const usernameError = validateUsername(username.trim())
      if (usernameError) { res.status(400).json({ message: usernameError }); return }
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true, language: true } })

    // Primary: no role picker — a teacher joins a class's shared team (see
    // classlevel.controller.ts applyClassTeachingTeam) instead of being handed
    // Class Teacher/Class Master/Subject Teacher directly. Vice Principal is the one
    // exception: an admin-tier role with no class of its own, created exactly like
    // every other school type already does below.
    let primaryTeam: { level: { id: string; name: string }; ids: string[]; masterId: string } | null = null
    if (school?.type === 'PRIMARY' && role !== 'VICE_PRINCIPAL') {
      if (!classLevel || typeof classLevel !== 'string') {
        res.status(400).json({ message: 'Select which class this teacher teaches' })
        return
      }
      const level = await prisma.classLevel.findFirst({ where: { schoolId, name: classLevel }, select: { id: true, name: true } })
      if (!level) { res.status(400).json({ message: 'Select a valid class' }); return }

      // Current team — see classTeamRoster's own comment for why this can't just be
      // derived from TeacherSubject rows (a class with no subjects yet would undercount).
      const roster = await classTeamRoster(schoolId, level.name)
      const currentTeamIds = roster.map((t) => t.id)
      if (currentTeamIds.length >= 3) {
        res.status(400).json({ message: `${level.name} already has 3 teachers, the maximum for a class. Remove one from the Classes page first.` })
        return
      }
      const currentMaster = await prisma.user.findFirst({ where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: level.name }, select: { id: true } })
      // A new hire joins as a non-master unless the class had nobody on it yet — the
      // existing master (if any) keeps the role rather than being re-decided on every hire.
      primaryTeam = { level, ids: currentTeamIds, masterId: currentMaster?.id ?? '' }
    } else if (role === 'CLASS_MASTER') {
      if (!masterClassLevel) {
        res.status(400).json({ message: 'masterClassLevel is required for Class Master' })
        return
      }
      // Class Master is a primary/secondary concept (one teacher overseeing a single class
      // of students all day) — a university has no equivalent, courses are taken across
      // departments/levels with no single "class" a teacher masters.
      if (school?.type === 'UNIVERSITY') {
        res.status(400).json({ message: 'Class Master does not apply to universities' })
        return
      }
    }

    const limit = await demoLimitBlock(schoolId, 'teachers')
    if (limit) { res.status(403).json({ message: limit }); return }

    const existing = hasEmail
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findUnique({ where: { username } })

    // Only an ACTIVE user with this identifier is a real conflict. A soft-deleted
    // user (isActive: false) still holds the unique value, so re-creating a
    // previously deleted teacher would otherwise fail — reactivate it instead.
    if (existing && existing.isActive) {
      res.status(400).json({ message: hasEmail ? 'Email already exists' : 'Username already exists' })
      return
    }

    let hashedPassword: string
    let inviteToken: string | null = null
    let passwordSetAt: Date | null = null

    // A username-based account has nowhere to receive an emailed setup link either way —
    // same direct-set branch offline builds already use, gated by build type there.
    if (IS_OFFLINE_BUILD || hasUsername) {
      const passwordError = validateNewPassword(String(password ?? ''))
      if (passwordError) { res.status(400).json({ message: passwordError }); return }
      hashedPassword = await bcrypt.hash(password, 12)
      // The admin hands them a real, working password directly — nothing pending.
      passwordSetAt = new Date()
    } else {
      // Online, with an email on file: the admin never sets or knows a teacher's password —
      // a random unusable placeholder is stored and the teacher picks their own via the
      // emailed setup link (see sendPasswordSetupEmail below). passwordSetAt stays null
      // until they actually complete that flow (passwordReset.controller.ts).
      hashedPassword = await bcrypt.hash(generateRawToken(), 12)
      inviteToken = generateRawToken()
    }

    const data = {
      name, email: hasEmail ? email : null, username: hasUsername ? username.trim() : null,
      password: hashedPassword, role: primaryTeam ? 'CLASS_TEACHER' : role, schoolId,
      masterClassLevel: primaryTeam ? null : (masterClassLevel ?? null),
      departments: sanitizeDepartments(departments),
      passwordSetAt,
      // Only meaningful for a teacher with zero course assignments yet (see
      // getTeachers) — harmless to store for non-university schools too.
      createdForTerm: term ? String(term) : null,
      ...(inviteToken
        ? { resetTokenHash: hashToken(inviteToken), resetTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) }
        : {}),
    }
    const select = { id: true, name: true, email: true, username: true, role: true, masterClassLevel: true, createdAt: true, departments: true }

    let teacher = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { ...data, isActive: true }, select })
      : await prisma.user.create({ data, select })

    // Fold the new hire into the class's team — sets their (and, if they're now solo,
    // their own) role/masterClassLevel correctly, and fans TeacherSubject rows out to
    // every subject in the class, same as the Classes page's "Set Teachers" modal.
    // Re-read afterward: applyClassTeachingTeam updates role/masterClassLevel/departments
    // in the database, and the response must reflect that, not the pre-team snapshot above.
    if (primaryTeam) {
      const ids = [...primaryTeam.ids, teacher.id]
      const masterId = primaryTeam.masterId || teacher.id
      await applyClassTeachingTeam(schoolId, primaryTeam.level, ids, masterId)
      teacher = await prisma.user.findUniqueOrThrow({ where: { id: teacher.id }, select })
    }

    // inviteToken is only ever set in the email branch above, so teacher.email is
    // guaranteed non-null here — the check still narrows the type for TypeScript.
    if (inviteToken && teacher.email) {
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

    // Same reasoning as createTeacher — no Class Master concept at a university.
    if (role === 'CLASS_MASTER') {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
      if (school?.type === 'UNIVERSITY') {
        res.status(400).json({ message: 'Class Master does not apply to universities' })
        return
      }
    }

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

    // Deactivating is how a teacher leaves, so their course windows close with them. Without
    // this they would keep accruing hours forever and every course they held would still look
    // staffed — which would hide exactly the unstaffed gap the coverage view is meant to
    // surface. Ended, never deleted: the hours they already taught remain on record.
    //
    // Reactivating deliberately does NOT reopen them. Coming back is not the same as being
    // given the same courses again, and silently restoring assignments would hand someone a
    // class the school may have already given to somebody else.
    const closedAt = new Date()
    const { count: closed } = await prisma.teacherSubject.updateMany({
      where: { userId: id, endedAt: null },
      data: { endedAt: closedAt },
    })

    await prisma.user.update({ where: { id }, data: { isActive: false } })
    res.json({
      message: 'Teacher removed',
      // Named so the admin learns their courses are now unstaffed rather than discovering it
      // from a coverage gap weeks later.
      closedAssignments: closed,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getTeacherSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const assigned = await prisma.teacherSubject.findMany({
      // Only current assignments: an ended one is history for the hours record, not a course
      // this teacher still teaches.
      where: { userId: id, endedAt: null },
      include: { subject: true },
    })
    res.json({ subjects: assigned.map((a) => a.subject) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** "YYYY-MM-DD" as a UTC calendar day, or now when omitted. 'invalid' is a rejection.
 *  Parsed as UTC deliberately: the school year has no timezone of its own, and local parsing
 *  would shift a handover a day either side of the boundary. */
function parseEffectiveAt(value: unknown): Date | 'invalid' {
  if (value == null || value === '') return new Date()
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'invalid'
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

export const assignTeacherSubjects = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { subjectIds }: { subjectIds: string[] } = req.body
    // Optional semester scope. Universities teach a different set of courses each
    // semester, so assigning courses while viewing Second Semester must leave the
    // teacher's First Semester courses alone — otherwise this replace-all would wipe
    // every course the current view happens not to show. Primary/secondary omit it:
    // their subjects run the whole year, so there is nothing to scope by.
    const term = req.body.term ? String(req.body.term) : null

    if (term && subjectIds.length > 0) {
      // Everything submitted must actually belong to the scope being replaced, or a
      // stray course would be created here and then be invisible (and undeletable) the
      // next time this same scope is saved.
      const mismatched = await prisma.subject.findMany({
        where: { id: { in: subjectIds }, schoolId, NOT: { term } },
        select: { name: true, term: true },
      })
      if (mismatched.length > 0) {
        res.status(400).json({
          message: `These courses are not in ${term}: ${mismatched.map((m) => `${m.name} (${m.term ?? 'no semester'})`).join(', ')}`,
        })
        return
      }
    }

    // A course belongs to one teacher: giving it to this one takes it from whoever held
    // it. That was already the behaviour here, but silently — only the admin saw a note,
    // while the teacher who lost the course was never told and just found it gone. The
    // shared helper now also removes their timetable periods for it and notifies them by
    // name (see utils/courseAssignment.ts).
    // The date the change takes effect, which is what splits hours between the outgoing and
    // incoming teacher. Defaults to now, so an admin who does not care never sees it.
    const effectiveAt = parseEffectiveAt(req.body?.effectiveAt)
    if (effectiveAt === 'invalid') {
      res.status(400).json({ message: 'A valid effective date (YYYY-MM-DD) is required' })
      return
    }

    const reassigned = await takeCoursesFromOtherTeachers({ schoolId, subjectIds, newTeacherId: id, effectiveAt })

    // A DIFF, not a replace. The old code deleted every assignment in scope and recreated
    // them, which under assignment history would reset startedAt on every save — re-saving an
    // unchanged list would silently erase months of accrued hours for every course.
    //
    // Scope is unchanged: with a `term`, other semesters are left alone; without one
    // (primary/secondary, whose subjects span the year) the whole set is in scope.
    const active = await prisma.teacherSubject.findMany({
      where: { userId: id, endedAt: null, ...(term ? { subject: { term } } : {}) },
      select: { id: true, subjectId: true },
    })
    const activeIds = new Set(active.map((a) => a.subjectId))
    const wanted = new Set(subjectIds)

    // Dropped: ended as of the effective date, never deleted — the hours already taught
    // against them still belong to this teacher.
    const toEnd = active.filter((a) => !wanted.has(a.subjectId)).map((a) => a.id)
    if (toEnd.length > 0) {
      await prisma.teacherSubject.updateMany({ where: { id: { in: toEnd } }, data: { endedAt: effectiveAt } })
    }
    // Added: a fresh window starting at the effective date. Courses already held are left
    // untouched, so their original startedAt survives.
    const toAdd = subjectIds.filter((sid) => !activeIds.has(sid))
    if (toAdd.length > 0) {
      await prisma.teacherSubject.createMany({
        data: toAdd.map((sid) => ({ userId: id, subjectId: sid, startedAt: effectiveAt })),
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

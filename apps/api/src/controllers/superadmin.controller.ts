import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma, { IS_OFFLINE_BUILD } from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { logMarksEntryModeChange, currentTermIdFor } from '../utils/marksEntryMode'
import { generateRawToken, hashToken, INVITE_TOKEN_TTL_MS } from '../utils/resetToken'
import { sendPasswordSetupEmail } from '../utils/email'
import { validateNewPassword, validateUsername } from '../utils/passwordValidation'

const schoolInclude = {
  _count: { select: { students: true, users: true, reportCards: true } },
}

// An admin with no email logs in with a username instead — same idea as a teacher created
// the same way (see createTeacher in teacher.controller.ts). Exactly one of the two is
// required; mirrors the request body's `adminEmail`/`adminUsername` fields at each call site.
type AdminIdentifier = { email: string | null; username: string | null }

function resolveAdminIdentifier(email: unknown, username: unknown): AdminIdentifier | { error: string } {
  const hasEmail = typeof email === 'string' && email.trim().length > 0
  const hasUsername = typeof username === 'string' && username.trim().length > 0
  if (hasEmail === hasUsername) {
    return { error: hasEmail ? 'Provide either an admin email or a username, not both' : 'An admin email or a username is required' }
  }
  if (hasUsername) {
    const usernameError = validateUsername((username as string).trim())
    if (usernameError) return { error: usernameError }
  }
  return { email: hasEmail ? (email as string) : null, username: hasUsername ? (username as string).trim() : null }
}

function isIdentifierError(x: AdminIdentifier | { error: string }): x is { error: string } {
  return 'error' in x
}

async function findExistingAdminUser(identifier: AdminIdentifier) {
  return identifier.email
    ? prisma.user.findUnique({ where: { email: identifier.email } })
    : prisma.user.findUnique({ where: { username: identifier.username! } })
}

// A newly created SCHOOL_ADMIN goes through the exact same invite pattern as a
// brand-new teacher (see createTeacher in teacher.controller.ts): offline installs (or
// anyone with no email, online or off) get a real, working password immediately; an online
// admin with an email instead gets an emailed setup link and stays "pending" (passwordSetAt
// null) until they use it. resetPassword (passwordReset.controller.ts) stamps passwordSetAt
// whichever flow — initial setup or a later forgot-password reset — redeems the token, so
// "pending" always clears itself once a real password is set.
async function buildAdminAccount(identifier: AdminIdentifier, adminPassword: string | undefined) {
  if (IS_OFFLINE_BUILD || !identifier.email) {
    return {
      password: await bcrypt.hash(adminPassword!, 12),
      passwordSetAt: new Date() as Date | null,
      inviteToken: null as string | null,
      resetTokenHash: null as string | null,
      resetTokenExpiresAt: null as Date | null,
    }
  }
  const inviteToken = generateRawToken()
  return {
    password: await bcrypt.hash(generateRawToken(), 12),
    passwordSetAt: null as Date | null,
    inviteToken,
    resetTokenHash: hashToken(inviteToken),
    resetTokenExpiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
  }
}

async function sendAdminSetupEmail(email: string, inviteToken: string, language?: string) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const setupUrl = `${frontendUrl}/reset-password?token=${inviteToken}`
  await sendPasswordSetupEmail({ to: email, resetUrl: setupUrl, lang: language === 'FR' ? 'FR' : 'EN' })
}

function directPasswordError(identifier: AdminIdentifier, adminPassword: string | undefined): string | null {
  if (!IS_OFFLINE_BUILD && identifier.email) return null // emailed setup link instead — no password taken here
  return validateNewPassword(String(adminPassword ?? ''))
}

// ─── Overview ────────────────────────────────────────────────────────────────

export const getOverview = async (_req: Request, res: Response) => {
  try {
    const [parentSchools, standaloneSchools] = await Promise.all([
      prisma.parentSchool.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          sections: { include: schoolInclude, orderBy: { type: 'asc' } },
        },
      }),
      prisma.school.findMany({
        where: { parentSchoolId: null },
        orderBy: { createdAt: 'desc' },
        include: schoolInclude,
      }),
    ])

    res.json({ parentSchools, standaloneSchools })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ─── Standalone school ────────────────────────────────────────────────────────

export const createStandaloneSchool = async (req: Request, res: Response) => {
  try {
    const { schoolName, schoolType, schoolEmail, subdomain, adminName, adminEmail, adminUsername, adminPassword, phone, city, language } = req.body

    const existing = await prisma.school.findFirst({ where: { OR: [{ email: schoolEmail }, { subdomain }] } })
    if (existing) { res.status(400).json({ message: 'Email or subdomain already taken' }); return }

    const identifier = resolveAdminIdentifier(adminEmail, adminUsername)
    if (isIdentifierError(identifier)) { res.status(400).json({ message: identifier.error }); return }

    const existingUser = await findExistingAdminUser(identifier)
    if (existingUser) { res.status(400).json({ message: identifier.email ? 'Admin email already exists' : 'Admin username already exists' }); return }

    const pwError = directPasswordError(identifier, adminPassword)
    if (pwError) { res.status(400).json({ message: pwError }); return }

    const lang = language === 'FR' ? 'FR' : 'EN'
    const account = await buildAdminAccount(identifier, adminPassword)
    const school = await prisma.school.create({
      data: {
        name: schoolName,
        type: schoolType,
        language: lang,
        email: schoolEmail,
        phone,
        address: city,
        subdomain: subdomain.toLowerCase(),
        coverImages: [],
        users: {
          create: {
            name: adminName, email: identifier.email, username: identifier.username, role: 'SCHOOL_ADMIN',
            password: account.password, passwordSetAt: account.passwordSetAt,
            resetTokenHash: account.resetTokenHash, resetTokenExpiresAt: account.resetTokenExpiresAt,
          },
        },
      },
      include: { ...schoolInclude, users: true },
    })

    if (account.inviteToken && identifier.email) await sendAdminSetupEmail(identifier.email, account.inviteToken, lang)

    res.status(201).json({ message: 'School created', school })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ─── Parent school + sections ─────────────────────────────────────────────────

export const createParentSchool = async (req: Request, res: Response) => {
  try {
    const { name, city, country, sections } = req.body as {
      name: string
      city?: string
      country?: string
      sections: {
        type: string
        language?: string
        subdomain: string
        schoolEmail: string
        adminName: string
        adminEmail?: string
        adminUsername?: string
        adminPassword: string
        phone?: string
      }[]
    }

    // Check for duplicate type+language combos within the submitted sections.
    // Two sections of the same type are allowed if their language differs
    // (e.g. an English Secondary and a French Secondary).
    const combos = sections.map((s) => `${s.type}:${s.language === 'FR' ? 'FR' : 'EN'}`)
    if (new Set(combos).size !== combos.length) {
      res.status(400).json({ message: 'Each section must be a unique type + language combination' }); return
    }

    // Check for duplicate subdomains / emails, and resolve each section's admin identifier.
    const identifiers: AdminIdentifier[] = []
    for (const s of sections) {
      const dup = await prisma.school.findFirst({ where: { OR: [{ email: s.schoolEmail }, { subdomain: s.subdomain }] } })
      if (dup) { res.status(400).json({ message: `Subdomain or email already taken for ${s.type} section` }); return }
      const identifier = resolveAdminIdentifier(s.adminEmail, s.adminUsername)
      if (isIdentifierError(identifier)) { res.status(400).json({ message: `${identifier.error} (${s.type} section)` }); return }
      const dupUser = await findExistingAdminUser(identifier)
      if (dupUser) { res.status(400).json({ message: `Admin ${identifier.email ? 'email' : 'username'} already exists (${s.type} section)` }); return }
      identifiers.push(identifier)
    }

    for (const [i, s] of sections.entries()) {
      const pwError = directPasswordError(identifiers[i], s.adminPassword)
      if (pwError) { res.status(400).json({ message: `${pwError} (${s.type} section)` }); return }
    }

    const accounts = await Promise.all(sections.map((s, i) => buildAdminAccount(identifiers[i], s.adminPassword)))

    const { parent, created } = await prisma.$transaction(async (tx) => {
      const parent = await tx.parentSchool.create({ data: { name, city, country } })
      const created = await Promise.all(
        sections.map((s, i) =>
          tx.school.create({
            data: {
              parentSchoolId: parent.id,
              name: `${name} — ${s.type}`,
              type: s.type as any,
              language: s.language === 'FR' ? 'FR' : 'EN',
              email: s.schoolEmail,
              phone: s.phone,
              subdomain: s.subdomain.toLowerCase(),
              coverImages: [],
              users: {
                create: {
                  name: s.adminName, email: identifiers[i].email, username: identifiers[i].username, role: 'SCHOOL_ADMIN',
                  password: accounts[i].password, passwordSetAt: accounts[i].passwordSetAt,
                  resetTokenHash: accounts[i].resetTokenHash, resetTokenExpiresAt: accounts[i].resetTokenExpiresAt,
                },
              },
            },
            include: { ...schoolInclude },
          })
        )
      )
      return { parent, created }
    })

    await Promise.all(sections.map((s, i) =>
      accounts[i].inviteToken && identifiers[i].email ? sendAdminSetupEmail(identifiers[i].email!, accounts[i].inviteToken!, s.language) : Promise.resolve()
    ))

    res.status(201).json({ message: 'Parent school and sections created', parent, sections: created })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const addSectionToParent = async (req: Request, res: Response) => {
  try {
    const parentId = String(req.params.id)
    const { type, subdomain, schoolEmail, adminName, adminEmail, adminUsername, adminPassword, phone, language } = req.body
    const lang = language === 'FR' ? 'FR' : 'EN'

    const parent = await prisma.parentSchool.findUnique({ where: { id: parentId } })
    if (!parent) { res.status(404).json({ message: 'Parent school not found' }); return }

    const typeExists = await prisma.school.findFirst({ where: { parentSchoolId: parentId, type, language: lang } })
    if (typeExists) { res.status(400).json({ message: `A ${lang} ${type} section already exists for this school` }); return }

    const dup = await prisma.school.findFirst({ where: { OR: [{ email: schoolEmail }, { subdomain }] } })
    if (dup) { res.status(400).json({ message: 'Email or subdomain already taken' }); return }

    const identifier = resolveAdminIdentifier(adminEmail, adminUsername)
    if (isIdentifierError(identifier)) { res.status(400).json({ message: identifier.error }); return }
    const dupUser = await findExistingAdminUser(identifier)
    if (dupUser) { res.status(400).json({ message: identifier.email ? 'Admin email already exists' : 'Admin username already exists' }); return }

    const pwError = directPasswordError(identifier, adminPassword)
    if (pwError) { res.status(400).json({ message: pwError }); return }

    const account = await buildAdminAccount(identifier, adminPassword)
    const section = await prisma.school.create({
      data: {
        parentSchoolId: parentId,
        name: `${parent.name} — ${type}`,
        type: type as any,
        language: lang,
        email: schoolEmail,
        phone,
        subdomain: subdomain.toLowerCase(),
        coverImages: [],
        users: {
          create: {
            name: adminName, email: identifier.email, username: identifier.username, role: 'SCHOOL_ADMIN',
            password: account.password, passwordSetAt: account.passwordSetAt,
            resetTokenHash: account.resetTokenHash, resetTokenExpiresAt: account.resetTokenExpiresAt,
          },
        },
      },
      include: schoolInclude,
    })

    if (account.inviteToken && identifier.email) await sendAdminSetupEmail(identifier.email, account.inviteToken, lang)

    res.status(201).json({ message: 'Section added', section })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const toggleSchoolActive = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    const school = await prisma.school.findUnique({ where: { id } })
    if (!school) { res.status(404).json({ message: 'School not found' }); return }
    const updated = await prisma.school.update({ where: { id }, data: { isActive: !school.isActive } })
    res.json({ message: `School ${updated.isActive ? 'activated' : 'deactivated'}`, school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const toggleParentSchoolActive = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    const parent = await prisma.parentSchool.findUnique({ where: { id } })
    if (!parent) { res.status(404).json({ message: 'Parent school not found' }); return }
    const updated = await prisma.parentSchool.update({ where: { id }, data: { isActive: !parent.isActive } })
    // Also toggle all sections
    await prisma.school.updateMany({ where: { parentSchoolId: id }, data: { isActive: updated.isActive } })
    res.json({ message: `School ${updated.isActive ? 'activated' : 'deactivated'}`, parent: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Add a section to any school — promotes standalone to multi-section if needed
export const addSectionToSchool = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id) // existing school id
    const { type, subdomain, schoolEmail, adminName, adminEmail, adminUsername, adminPassword, language } = req.body
    const lang = language === 'FR' ? 'FR' : 'EN'

    const existing = await prisma.school.findUnique({ where: { id } })
    if (!existing) { res.status(404).json({ message: 'School not found' }); return }

    // Prevent duplicate type+language in the same group (same type allowed if language differs)
    if (existing.parentSchoolId) {
      const siblingExists = await prisma.school.findFirst({ where: { parentSchoolId: existing.parentSchoolId, type, language: lang } })
      if (siblingExists) { res.status(400).json({ message: `A ${lang} ${type} section already exists for this school` }); return }
    } else if (existing.type === type && existing.language === lang) {
      res.status(400).json({ message: `This school is already a ${lang} ${type} section` }); return
    }

    const dup = await prisma.school.findFirst({ where: { OR: [{ email: schoolEmail }, { subdomain }] } })
    if (dup) { res.status(400).json({ message: 'Email or subdomain already taken' }); return }

    const identifier = resolveAdminIdentifier(adminEmail, adminUsername)
    if (isIdentifierError(identifier)) { res.status(400).json({ message: identifier.error }); return }
    const dupUser = await findExistingAdminUser(identifier)
    if (dupUser) { res.status(400).json({ message: identifier.email ? 'Admin email already exists' : 'Admin username already exists' }); return }

    const pwError = directPasswordError(identifier, adminPassword)
    if (pwError) { res.status(400).json({ message: pwError }); return }

    // If standalone, promote to multi-section by creating a parent
    let parentId = existing.parentSchoolId
    if (!parentId) {
      const parent = await prisma.parentSchool.create({
        data: { name: existing.name, city: existing.address ?? undefined },
      })
      await prisma.school.update({ where: { id }, data: { parentSchoolId: parent.id } })
      parentId = parent.id
    }

    const account = await buildAdminAccount(identifier, adminPassword)
    const parent = await prisma.parentSchool.findUnique({ where: { id: parentId! } })
    const section = await prisma.school.create({
      data: {
        parentSchoolId: parentId,
        name: `${parent!.name} — ${type}`,
        type: type as any,
        language: lang,
        email: schoolEmail,
        subdomain: subdomain.toLowerCase(),
        users: {
          create: {
            name: adminName, email: identifier.email, username: identifier.username, role: 'SCHOOL_ADMIN',
            password: account.password, passwordSetAt: account.passwordSetAt,
            resetTokenHash: account.resetTokenHash, resetTokenExpiresAt: account.resetTokenExpiresAt,
          },
        },
      },
      include: schoolInclude,
    })

    if (account.inviteToken && identifier.email) await sendAdminSetupEmail(identifier.email, account.inviteToken, lang)

    res.status(201).json({ message: 'Section added', section })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateSchool = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    const { name, email, phone, address, website, subdomain, type, language, marksEntryMode } = req.body
    const lang = language === undefined ? undefined : (language === 'FR' ? 'FR' : 'EN')

    const school = await prisma.school.findUnique({ where: { id } })
    if (!school) { res.status(404).json({ message: 'School not found' }); return }

    // Check subdomain/email uniqueness if changed
    if (subdomain && subdomain !== school.subdomain) {
      const dup = await prisma.school.findFirst({ where: { subdomain, id: { not: id } } })
      if (dup) { res.status(400).json({ message: 'Subdomain already taken' }); return }
    }
    if (email && email !== school.email) {
      const dup = await prisma.school.findFirst({ where: { email, id: { not: id } } })
      if (dup) { res.status(400).json({ message: 'Email already taken' }); return }
    }
    // Prevent duplicate type+language within the same parent (same type allowed if language differs)
    const nextType = type ?? school.type
    const nextLang = lang ?? school.language
    if ((type !== undefined || lang !== undefined) && school.parentSchoolId) {
      const typeExists = await prisma.school.findFirst({ where: { parentSchoolId: school.parentSchoolId, type: nextType, language: nextLang, id: { not: id } } })
      if (typeExists) { res.status(400).json({ message: `A ${nextLang} ${nextType} section already exists for this school` }); return }
    }

    // The provider setting who enters marks IS the permission that lifts the school's
    // two-per-semester cap, so it is deliberately uncapped here and logged as ours.
    // ADMIN_ONLY is a university-only arrangement — checked against nextType, not
    // school.type, in case type is also changing in this same request.
    if (marksEntryMode === 'ADMIN_ONLY' && nextType !== 'UNIVERSITY') {
      res.status(400).json({ message: 'Only universities can switch marks entry to the administration.' })
      return
    }
    const nextMode = marksEntryMode === 'TEACHERS' || marksEntryMode === 'ADMIN_ONLY' ? marksEntryMode : undefined
    const switching = nextMode !== undefined && nextMode !== school.marksEntryMode

    const updated = await prisma.school.update({
      where: { id },
      data: {
        name, email, phone, address, website, subdomain: subdomain?.toLowerCase(), type,
        ...(lang !== undefined ? { language: lang } : {}),
        ...(nextMode !== undefined ? { marksEntryMode: nextMode } : {}),
      },
      include: schoolInclude,
    })

    if (switching) {
      const actor = await prisma.user.findUnique({ where: { id: (req as AuthRequest).user!.id }, select: { name: true } })
      await logMarksEntryModeChange({
        schoolId: id,
        mode: updated.marksEntryMode,
        changedById: (req as AuthRequest).user!.id,
        changedByName: actor?.name ?? 'Provider',
        termId: await currentTermIdFor(id),
        // Excluded from the school's quota: this row IS the permission, not a use of it.
        byProvider: true,
      })
    }
    res.json({ message: 'School updated', school: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteSchool = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    const school = await prisma.school.findUnique({
      where: { id },
      include: { _count: { select: { students: true, reportCards: true } } },
    })
    if (!school) { res.status(404).json({ message: 'School not found' }); return }

    // Every model with a schoolId FK has to go before the school itself, or the delete
    // fails on a foreign-key violation — this used to only clear the tables a brand-new
    // school would have, so anything past initial setup (a grading scale saved, a
    // report-card template edited, a department created, an Excel template uploaded, a
    // marks-entry-mode switch logged) left an orphaned row blocking deletion outright.
    // The API swallowed that FK error into a generic 500 with no detail — see the fix
    // to the message below too. Order: children before parents.
    //
    // THIS LIST GOES STALE, and when it does the failure is much worse than "delete did
    // not work": without the transaction below, every delete that already ran stayed
    // committed and only the final school.delete rolled off, leaving a school still
    // listed in superadmin with zero students and zero report cards. That is not a
    // failed delete, it looks exactly like unexplained data loss. It happened for real
    // on production on 2026-08-11, blocked by timetable slots, timetable periods,
    // notifications and teacher absences, none of which existed when this list was
    // written. If you add a model with a schoolId, add it here.
    await prisma.$transaction(async (tx) => {
      const reportCardIds = (await tx.reportCard.findMany({ where: { schoolId: id }, select: { id: true } })).map((r) => r.id)
      await tx.reportEntry.deleteMany({ where: { reportCardId: { in: reportCardIds } } })
      // Parent-portal links. Taken FIRST, and their parent users handled at the end: a
      // PARENT user has schoolId = null, so the `user.deleteMany({ schoolId })` below cannot
      // see them and they would be left behind as orphans with a dead login.
      const parentUserIds = (await tx.guardian.findMany({ where: { schoolId: id }, select: { userId: true } })).map((g) => g.userId)
      await tx.guardianAccessRequest.deleteMany({ where: { schoolId: id } })
      await tx.guardianInvite.deleteMany({ where: { schoolId: id } })
      await tx.guardian.deleteMany({ where: { schoolId: id } })
      await tx.reportCard.deleteMany({ where: { schoolId: id } })
      await tx.teacherSubject.deleteMany({ where: { OR: [{ user: { schoolId: id } }, { subject: { schoolId: id } }] } })
      await tx.timetableSlot.deleteMany({ where: { schoolId: id } })
      await tx.timetablePeriod.deleteMany({ where: { schoolId: id } })
      await tx.teacherAbsence.deleteMany({ where: { schoolId: id } })
      await tx.notification.deleteMany({ where: { schoolId: id } })
      await tx.pastTermMarksGrant.deleteMany({ where: { schoolId: id } })
      await tx.subjectExclusion.deleteMany({ where: { schoolId: id } })
      await tx.schoolHoliday.deleteMany({ where: { schoolId: id } })
      await tx.feePayment.deleteMany({ where: { schoolId: id } })
      await tx.hndRegistrationPayment.deleteMany({ where: { schoolId: id } })
      await tx.excelTemplate.deleteMany({ where: { schoolId: id } })
      await tx.marksEntryModeChange.deleteMany({ where: { schoolId: id } })
      await tx.competencyScale.deleteMany({ where: { schoolId: id } })
      await tx.promotionScale.deleteMany({ where: { schoolId: id } })
      await tx.student.deleteMany({ where: { schoolId: id } })
      await tx.subject.deleteMany({ where: { schoolId: id } })
      await tx.term.deleteMany({ where: { schoolId: id } })
      await tx.classLevel.deleteMany({ where: { schoolId: id } })
      // After ClassLevel: ClassLevel.departmentId points here and restricts.
      await tx.department.deleteMany({ where: { schoolId: id } })
      await tx.gradingScale.deleteMany({ where: { schoolId: id } })
      await tx.reportCardTemplate.deleteMany({ where: { schoolId: id } })
      await tx.classListTemplate.deleteMany({ where: { schoolId: id } })
      await tx.user.deleteMany({ where: { schoolId: id } })
      // A parent whose ONLY children were at this school has nothing left to sign in for, so
      // the account goes. One whose other child is at a different school keeps theirs, which
      // is why this is a "no links remain" check rather than a blanket delete of the ids
      // collected above. Deliberately after the school's own users, and before school.delete.
      if (parentUserIds.length > 0) {
        const stillLinked = new Set(
          (await tx.guardian.findMany({ where: { userId: { in: parentUserIds } }, select: { userId: true } })).map((g) => g.userId),
        )
        const orphaned = parentUserIds.filter((uid) => !stillLinked.has(uid))
        if (orphaned.length > 0) await tx.user.deleteMany({ where: { id: { in: orphaned }, role: 'PARENT' } })
      }
      await tx.school.delete({ where: { id } })
    }, {
      // A real school is far bigger than the demo one (hundreds of students, thousands
      // of report entries), and Prisma's 5s default would abort part way through a
      // perfectly good delete. A rollback here is free; a half-delete is not.
      maxWait: 15_000,
      timeout: 120_000,
    })

    res.json({ message: 'School deleted' })
  } catch (error: any) {
    console.error(error)
    // A foreign-key violation here means some relation still isn't cleared above —
    // surfaced specifically rather than a bare "Server error" so a future gap like this
    // one is diagnosable from the toast alone, not just from server logs.
    if (error?.code === 'P2003') {
      res.status(409).json({ message: 'Could not delete: this school still has related data blocking deletion. Contact support.' })
      return
    }
    // The row was already gone by the time `school.delete` ran — a second concurrent
    // delete of the same section, or a stale click after the first request already
    // finished. Report it the same as the not-found check above rather than a bare
    // "Server error": everything up to this point already succeeded, so the school
    // IS deleted, just not by this particular request.
    if (error?.code === 'P2025') {
      res.status(404).json({ message: 'School not found' })
      return
    }
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteParentSchool = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id)
    const parent = await prisma.parentSchool.findUnique({
      where: { id },
      include: { sections: { select: { id: true } } },
    })
    if (!parent) { res.status(404).json({ message: 'Parent school not found' }); return }
    if (parent.sections.length > 0) {
      res.status(400).json({ message: 'Delete all sections before deleting the parent school' }); return
    }
    await prisma.parentSchool.delete({ where: { id } })
    res.json({ message: 'Parent school deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Get admin users for a specific school (for password reset UI)
export const getSchoolAdmins = async (req: Request, res: Response) => {
  try {
    const schoolId = String(req.params.schoolId)
    const admins = await prisma.user.findMany({
      where: { schoolId, role: { in: ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'] } },
      select: { id: true, name: true, email: true, username: true, role: true, isActive: true, passwordSetAt: true },
      orderBy: { name: 'asc' },
    })
    res.json({
      admins: admins.map(({ passwordSetAt, ...a }) => ({ ...a, pendingSetup: passwordSetAt === null })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// A superadmin fixing a wrong/inaccessible admin email — the actual account-recovery
// step is the existing "Reset Password" action right next to this one in the same
// School Admins list, which emails a fresh setup link to whatever email is on file.
// Changing it here just makes sure that link goes somewhere the admin can actually read.
export const updateAdminEmail = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId)
    const trimmed = String(req.body.email ?? '').trim().toLowerCase()
    if (!trimmed) { res.status(400).json({ message: 'Email is required' }); return }

    const admin = await prisma.user.findFirst({ where: { id: userId, role: { in: ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'] } } })
    if (!admin) { res.status(404).json({ message: 'Admin not found' }); return }

    const updated = await prisma.user.update({ where: { id: userId }, data: { email: trimmed } })
    res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role })
  } catch (error: any) {
    if (error?.code === 'P2002') { res.status(409).json({ message: 'That email is already in use by another account' }); return }
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Keep old endpoint for backward compat
export const getAllSchools = async (_req: Request, res: Response) => {
  try {
    const schools = await prisma.school.findMany({ orderBy: { createdAt: 'desc' }, include: schoolInclude })
    res.json({ schools })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getSchoolDetail = async (req: Request, res: Response) => {
  const schoolId = String(req.params.schoolId)
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        parentSchool: { select: { id: true, name: true } },
        _count: { select: { students: true, users: true, reportCards: true } },
      },
    })

    if (!school) { res.status(404).json({ message: 'School not found' }); return }

    const [classCounts, usersByRole, subjectCount, rcByStatus, terms, classLevels] = await Promise.all([
      prisma.student.groupBy({
        by: ['classLevel'],
        where: { schoolId, isActive: true },
        _count: true,
        orderBy: { classLevel: 'asc' },
      }),
      prisma.user.groupBy({
        by: ['role'],
        where: { schoolId, isActive: true },
        _count: true,
      }),
      prisma.subject.count({ where: { schoolId } }),
      prisma.reportCard.groupBy({
        by: ['status'],
        where: { schoolId },
        _count: true,
      }),
      prisma.term.findMany({
        where: { schoolId },
        select: { id: true, name: true, session: true, isCurrent: true, printingEnabled: true },
        orderBy: [{ session: 'desc' }, { startDate: 'asc' }],
      }),
      // The real class rows (not the student groupBy above, which only has names): the
      // superadmin needs their ids to unlock a frozen mark ceiling, and their ceilings to
      // see what is actually being unlocked.
      prisma.classLevel.findMany({
        where: { schoolId },
        select: { id: true, name: true, maxScore: true, testMaxScore: true, scaleUnlockedAt: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
    ])

    res.json({
      school: {
        id: school.id,
        name: school.name,
        type: school.type,
        language: school.language,
        email: school.email,
        phone: school.phone,
        address: school.address,
        subdomain: school.subdomain,
        isActive: school.isActive,
        createdAt: school.createdAt,
        // Hand-listed response: a field omitted here simply never reaches the page,
        // however correct everything upstream is (the stamp taught this lesson).
        marksEntryMode: school.marksEntryMode,
        parentSchool: school.parentSchool,
        totalStudents: school._count.students,
        totalUsers: school._count.users,
        totalReportCards: school._count.reportCards,
      },
      classes: classCounts.map(c => ({ classLevel: c.classLevel, students: c._count })),
      staff: usersByRole.map(u => ({ role: u.role, count: u._count })),
      subjects: subjectCount,
      reportCards: rcByStatus.map(r => ({ status: r.status, count: r._count })),
      terms,
      classLevels,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** PATCH /api/superadmin/terms/:termId/printing — enable or disable report card printing for a term. */
/**
 * The only way past a class's frozen assessment settings.
 *
 * A class's mark totals (`maxScore`, and primary's `testMaxScore`) AND its marks-vs-ratings
 * `gradingMode` are settled for the academic year once that class has published cards in a
 * term of the year that has closed — see frozenScaleClasses in classlevel.controller. A
 * school that has to correct one genuinely wrong setting asks the superadmin, who unlocks
 * the class here; the school then makes the change itself, and doing so SPENDS the grant.
 * Deliberately not a "superadmin edits the value" endpoint: the school knows what the
 * setting should be, the superadmin is only deciding that changing it is warranted.
 *
 * Turning it off again is the same call with `unlocked: false`, for a grant given by mistake.
 */
export const toggleClassScaleUnlock = async (req: Request, res: Response) => {
  const id = String(req.params.classLevelId)
  const { unlocked } = req.body
  if (typeof unlocked !== 'boolean') {
    res.status(400).json({ message: 'unlocked must be a boolean' })
    return
  }
  try {
    const level = await prisma.classLevel.findUnique({ where: { id } })
    if (!level) { res.status(404).json({ message: 'Class not found' }); return }
    const updated = await prisma.classLevel.update({
      where: { id },
      data: { scaleUnlockedAt: unlocked ? new Date() : null },
    })
    res.json({
      message: unlocked
        ? 'Assessment settings unlocked for this class. The school can now change them once.'
        : 'Assessment settings locked again.',
      classLevel: { id: updated.id, name: updated.name, scaleUnlockedAt: updated.scaleUnlockedAt },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const toggleTermPrinting = async (req: Request, res: Response) => {
  const termId = String(req.params.termId)
  const { printingEnabled } = req.body
  if (typeof printingEnabled !== 'boolean') {
    res.status(400).json({ message: 'printingEnabled must be a boolean' })
    return
  }
  try {
    const term = await prisma.term.findUnique({ where: { id: termId } })
    if (!term) { res.status(404).json({ message: 'Term not found' }); return }
    const updated = await prisma.term.update({ where: { id: termId }, data: { printingEnabled } })
    res.json({ message: 'Printing setting updated', term: { id: updated.id, name: updated.name, session: updated.session, printingEnabled: updated.printingEnabled } })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

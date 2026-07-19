import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { logMarksEntryModeChange, currentTermIdFor } from '../utils/marksEntryMode'

const schoolInclude = {
  _count: { select: { students: true, users: true, reportCards: true } },
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
    const { schoolName, schoolType, schoolEmail, subdomain, adminName, adminEmail, adminPassword, phone, city, language } = req.body

    const existing = await prisma.school.findFirst({ where: { OR: [{ email: schoolEmail }, { subdomain }] } })
    if (existing) { res.status(400).json({ message: 'Email or subdomain already taken' }); return }

    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (existingUser) { res.status(400).json({ message: 'Admin email already exists' }); return }

    const hashed = await bcrypt.hash(adminPassword, 12)
    const school = await prisma.school.create({
      data: {
        name: schoolName,
        type: schoolType,
        language: language === 'FR' ? 'FR' : 'EN',
        email: schoolEmail,
        phone,
        address: city,
        subdomain: subdomain.toLowerCase(),
        coverImages: [],
        users: {
          create: { name: adminName, email: adminEmail, password: hashed, role: 'SCHOOL_ADMIN' },
        },
      },
      include: { ...schoolInclude, users: true },
    })

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
        adminEmail: string
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

    // Check for duplicate subdomains / emails
    for (const s of sections) {
      const dup = await prisma.school.findFirst({ where: { OR: [{ email: s.schoolEmail }, { subdomain: s.subdomain }] } })
      if (dup) { res.status(400).json({ message: `Subdomain or email already taken for ${s.type} section` }); return }
      const dupUser = await prisma.user.findUnique({ where: { email: s.adminEmail } })
      if (dupUser) { res.status(400).json({ message: `Admin email ${s.adminEmail} already exists` }); return }
    }

    const hashed = await Promise.all(sections.map((s) => bcrypt.hash(s.adminPassword, 12)))

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
                create: { name: s.adminName, email: s.adminEmail, password: hashed[i], role: 'SCHOOL_ADMIN' },
              },
            },
            include: { ...schoolInclude },
          })
        )
      )
      return { parent, created }
    })

    res.status(201).json({ message: 'Parent school and sections created', parent, sections: created })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const addSectionToParent = async (req: Request, res: Response) => {
  try {
    const parentId = String(req.params.id)
    const { type, subdomain, schoolEmail, adminName, adminEmail, adminPassword, phone, language } = req.body
    const lang = language === 'FR' ? 'FR' : 'EN'

    const parent = await prisma.parentSchool.findUnique({ where: { id: parentId } })
    if (!parent) { res.status(404).json({ message: 'Parent school not found' }); return }

    const typeExists = await prisma.school.findFirst({ where: { parentSchoolId: parentId, type, language: lang } })
    if (typeExists) { res.status(400).json({ message: `A ${lang} ${type} section already exists for this school` }); return }

    const dup = await prisma.school.findFirst({ where: { OR: [{ email: schoolEmail }, { subdomain }] } })
    if (dup) { res.status(400).json({ message: 'Email or subdomain already taken' }); return }
    const dupUser = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (dupUser) { res.status(400).json({ message: 'Admin email already exists' }); return }

    const hashed = await bcrypt.hash(adminPassword, 12)
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
          create: { name: adminName, email: adminEmail, password: hashed, role: 'SCHOOL_ADMIN' },
        },
      },
      include: schoolInclude,
    })

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
    const { type, subdomain, schoolEmail, adminName, adminEmail, adminPassword, language } = req.body
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
    const dupUser = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (dupUser) { res.status(400).json({ message: 'Admin email already exists' }); return }

    // If standalone, promote to multi-section by creating a parent
    let parentId = existing.parentSchoolId
    if (!parentId) {
      const parent = await prisma.parentSchool.create({
        data: { name: existing.name, city: existing.address ?? undefined },
      })
      await prisma.school.update({ where: { id }, data: { parentSchoolId: parent.id } })
      parentId = parent.id
    }

    const hashed = await bcrypt.hash(adminPassword, 12)
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
          create: { name: adminName, email: adminEmail, password: hashed, role: 'SCHOOL_ADMIN' },
        },
      },
      include: schoolInclude,
    })

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
    const reportCardIds = (await prisma.reportCard.findMany({ where: { schoolId: id }, select: { id: true } })).map((r) => r.id)
    await prisma.reportEntry.deleteMany({ where: { reportCardId: { in: reportCardIds } } })
    await prisma.reportCard.deleteMany({ where: { schoolId: id } })
    await prisma.teacherSubject.deleteMany({ where: { user: { schoolId: id } } })
    await prisma.feePayment.deleteMany({ where: { schoolId: id } })
    await prisma.hndRegistrationPayment.deleteMany({ where: { schoolId: id } })
    await prisma.excelTemplate.deleteMany({ where: { schoolId: id } })
    await prisma.marksEntryModeChange.deleteMany({ where: { schoolId: id } })
    await prisma.student.deleteMany({ where: { schoolId: id } })
    await prisma.subject.deleteMany({ where: { schoolId: id } })
    await prisma.term.deleteMany({ where: { schoolId: id } })
    await prisma.classLevel.deleteMany({ where: { schoolId: id } })
    await prisma.department.deleteMany({ where: { schoolId: id } })
    await prisma.gradingScale.deleteMany({ where: { schoolId: id } })
    await prisma.reportCardTemplate.deleteMany({ where: { schoolId: id } })
    await prisma.classListTemplate.deleteMany({ where: { schoolId: id } })
    await prisma.user.deleteMany({ where: { schoolId: id } })
    await prisma.school.delete({ where: { id } })

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
      select: { id: true, name: true, email: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
    })
    res.json({ admins })
  } catch (error) {
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

    const [classCounts, usersByRole, subjectCount, rcByStatus, terms] = await Promise.all([
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
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** PATCH /api/superadmin/terms/:termId/printing — enable or disable report card printing for a term. */
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

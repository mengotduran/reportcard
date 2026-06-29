import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../config/prisma'

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

    const parent = await prisma.parentSchool.create({ data: { name, city, country } })

    const created = await Promise.all(
      sections.map(async (s) => {
        const hashed = await bcrypt.hash(s.adminPassword, 12)
        return prisma.school.create({
          data: {
            parentSchoolId: parent.id,
            name: `${name} — ${s.type}`,
            type: s.type as any,
            language: s.language === 'FR' ? 'FR' : 'EN',
            email: s.schoolEmail,
            phone: s.phone,
            subdomain: s.subdomain.toLowerCase(),
            users: {
              create: { name: s.adminName, email: s.adminEmail, password: hashed, role: 'SCHOOL_ADMIN' },
            },
          },
          include: { ...schoolInclude },
        })
      })
    )

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
    const { name, email, phone, address, subdomain, type, language } = req.body
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

    const updated = await prisma.school.update({
      where: { id },
      data: { name, email, phone, address, subdomain: subdomain?.toLowerCase(), type, ...(lang !== undefined ? { language: lang } : {}) },
      include: schoolInclude,
    })
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

    // Delete in order: entries → report cards → teacher subjects → users → school
    const reportCardIds = (await prisma.reportCard.findMany({ where: { schoolId: id }, select: { id: true } })).map((r) => r.id)
    await prisma.reportEntry.deleteMany({ where: { reportCardId: { in: reportCardIds } } })
    await prisma.reportCard.deleteMany({ where: { schoolId: id } })
    await prisma.teacherSubject.deleteMany({ where: { user: { schoolId: id } } })
    await prisma.student.deleteMany({ where: { schoolId: id } })
    await prisma.subject.deleteMany({ where: { schoolId: id } })
    await prisma.term.deleteMany({ where: { schoolId: id } })
    await prisma.user.deleteMany({ where: { schoolId: id } })
    await prisma.school.delete({ where: { id } })

    res.json({ message: 'School deleted' })
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

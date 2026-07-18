import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { demoLimitBlock } from '../config/demo'

/** '' / whitespace from an untouched optional form field means "not provided", i.e. NULL,
 *  never an empty string: one representation of missing keeps the print side simple. */
const blankToNull = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? null : t
}

/**
 * Birth dates are stored as "YYYY-MM-DD" text (see schema.prisma) — no time, no zone.
 * Anything that is not a plain date is rejected to NULL rather than stored: a half-parsed
 * birth date on a transcript sent to WES is worse than a blank one.
 */
const normalizeBirthDate = (v: unknown): string | null => {
  const t = blankToNull(v)
  if (!t) return null
  // Accept the browser date input's native "YYYY-MM-DD", and an ISO timestamp (some
  // clients send a full Date), keeping only the calendar part.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (!m) return null
  const [, y, mo, d] = m
  const month = Number(mo), day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${mo}-${d}`
}
import { previewStudentRows, buildImportTemplate, ParsedStudentRow } from '../utils/studentImport'
import { currentSession } from './fees.controller'

// Every active student should have a report card for the current term as soon
// as they exist — even with zero marks — so they're never silently missing
// from class rosters, exports, marks-entry grids, or past-year views (which
// key off report-card existence, see the "year-aware roster" comment below).
// Disabled/Dismissed students are excluded by the caller (only invoked when a
// student becomes/is created ACTIVE). A no-op between academic years, when no
// term is marked current yet.
async function ensureReportCardForCurrentTerm(schoolId: string, studentId: string, createdById: string, currentTermId?: string | null) {
  const termId = currentTermId !== undefined
    ? currentTermId
    : (await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } }))?.id ?? null
  if (!termId) return
  await prisma.reportCard.upsert({
    where: { studentId_termId: { studentId, termId } },
    update: {},
    create: { studentId, termId, schoolId, createdById },
  })
}

export const getClassLevels = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const levels = await prisma.student.findMany({
      where: { schoolId, isActive: true },
      select: { classLevel: true },
      distinct: ['classLevel'],
      orderBy: { classLevel: 'asc' },
    })
    res.json({ classLevels: levels.map((l) => l.classLevel) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getStudents = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { classLevel, search } = req.query
    const session = req.query.session ? String(req.query.session) : null

    // Explicit status filter (e.g. "show me who's Disabled/Dismissed") bypasses
    // the year-aware roster entirely — it's "who currently has this status",
    // not a historical view, so isActive/report-card scoping doesn't apply.
    const statusParam = req.query.status ? String(req.query.status) : null
    let yearOrStatusScope: Record<string, unknown>
    if (statusParam) {
      yearOrStatusScope = { status: { in: statusParam.split(',').map((s) => s.trim()) } }
    } else {
      // Year-aware roster: for the live academic year (or no session) show the
      // active roster; for a past year show the students who have report cards that session.
      let liveSession: string | null = null
      if (session) {
        const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
        liveSession = cur?.session ?? null
      }
      yearOrStatusScope = !session || session === liveSession
        ? { isActive: true }
        : { reportCards: { some: { term: { session } } } }
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        ...yearOrStatusScope,
        ...(classLevel ? { classLevel: String(classLevel) } : {}),
        ...(search ? { name: { contains: String(search), mode: 'insensitive' } } : {})
      },
      orderBy: { name: 'asc' }
    })

    res.json({ students, total: students.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getStudent = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const student = await prisma.student.findFirst({
      where: { id, schoolId },
      include: {
        reportCards: {
          include: { term: true, entries: { include: { subject: true } } }
        }
      }
    })

    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    res.json(student)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

const DEPT_STOP = new Set(['and', 'of', 'the', 'in', 'for', 'to'])
function deptAbbr(dept: string): string {
  const words = dept.trim().split(/\s+/).filter(w => !DEPT_STOP.has(w.toLowerCase()))
  if (!words.length) return 'X'
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.map(w => (w.length > 5 ? w.slice(0, 2) : w[0]).toUpperCase()).join('')
}
function parseProgramAndDept(classLevel: string): { prog: string; dept: string; levelSuffix: string } {
  if (classLevel.startsWith('HND ')) {
    const m = classLevel.match(/ - Level (\d+)$/)
    return { prog: 'HND', dept: classLevel.replace(/^HND /, '').replace(/ - Level \d+$/, ''), levelSuffix: m ? m[1] : '' }
  }
  if (classLevel.startsWith('Degree ')) return { prog: 'DEGREE', dept: classLevel.replace(/^Degree /, ''), levelSuffix: '' }
  return { prog: '', dept: classLevel, levelSuffix: '' }
}

async function generateStudentId(schoolId: string, classLevel?: string): Promise<string> {
  const [school, classLevelRecord] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { type: true, acronym: true, batch: true, terms: { orderBy: { createdAt: 'desc' }, take: 1, select: { session: true } } } }),
    classLevel ? prisma.classLevel.findFirst({ where: { schoolId, name: classLevel }, select: { abbreviation: true } }) : null,
  ])

  // University with acronym + batch → structured matricule
  if (school?.type === 'UNIVERSITY' && school.acronym && school.batch != null && classLevel) {
    const session = school.terms[0]?.session ?? String(new Date().getFullYear())
    const year = session.slice(0, 4)
    const { prog, dept, levelSuffix } = parseProgramAndDept(classLevel)
    const abbr = (classLevelRecord?.abbreviation?.trim() || deptAbbr(dept)) + levelSuffix
    const parts = [school.acronym, year, ...(prog ? [prog] : []), String(school.batch), abbr]
    const prefix = parts.join('/') + '/'
    const last = await prisma.student.findFirst({
      where: { schoolId, studentId: { startsWith: prefix } },
      orderBy: { studentId: 'desc' },
      select: { studentId: true },
    })
    let seq = 1
    if (last) {
      const tail = last.studentId.slice(prefix.length)
      const n = parseInt(tail, 10)
      if (!isNaN(n)) seq = n + 1
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `${prefix}${seq}`
      const collision = await prisma.student.findUnique({ where: { schoolId_studentId: { schoolId, studentId: candidate } } })
      if (!collision) return candidate
      seq++
    }
    return `${prefix}${Date.now().toString(36).toUpperCase()}`
  }

  // Default sequential format for non-university or schools without acronym/batch
  const year = new Date().getFullYear()
  const prefix = `${year}-`
  const last = await prisma.student.findFirst({
    where: { schoolId, studentId: { startsWith: prefix } },
    orderBy: { studentId: 'desc' },
    select: { studentId: true },
  })
  let nextNum = 1
  if (last) {
    const parts = last.studentId.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${prefix}${String(nextNum).padStart(4, '0')}`
    const collision = await prisma.student.findUnique({ where: { schoolId_studentId: { schoolId, studentId: candidate } } })
    if (!collision) return candidate
    nextNum++
  }
  return `${prefix}${Date.now().toString(36).toUpperCase()}`
}

export const createStudent = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, classLevel, gender, guardianName, guardianPhone, guardianEmail, directLevel2Entry, dateOfBirth, placeOfBirth } = req.body

    if (gender !== 'Male' && gender !== 'Female') {
      res.status(400).json({ message: 'Gender (Male or Female) is required' })
      return
    }

    const limit = await demoLimitBlock(schoolId, 'students')
    if (limit) { res.status(403).json({ message: limit }); return }

    const studentId = await generateStudentId(schoolId, classLevel)

    const student = await prisma.student.create({
      // Birth details are optional: an empty form field becomes NULL rather than "", so
      // "not provided" stays a single thing and the row simply prints blank.
      data: { schoolId, name, studentId, classLevel, gender, guardianName, guardianPhone, guardianEmail, directLevel2Entry: !!directLevel2Entry,
        dateOfBirth: normalizeBirthDate(dateOfBirth), placeOfBirth: blankToNull(placeOfBirth) }
    })
    await ensureReportCardForCurrentTerm(schoolId, student.id, req.user!.id)

    res.status(201).json({ message: 'Student created', student })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateStudent = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, classLevel, gender, guardianName, guardianPhone, guardianEmail, directLevel2Entry, isRepeatingLevel, dateOfBirth, placeOfBirth } = req.body

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const updated = await prisma.student.update({
      where: { id },
      data: {
        name, classLevel,
        ...(gender !== undefined ? { gender } : {}),
        guardianName, guardianPhone, guardianEmail,
        ...(directLevel2Entry !== undefined ? { directLevel2Entry: !!directLevel2Entry } : {}),
        ...(isRepeatingLevel !== undefined ? { isRepeatingLevel: !!isRepeatingLevel } : {}),
        // Only touched when the client actually sends them, so a caller that knows
        // nothing about birth details cannot wipe them.
        ...(dateOfBirth !== undefined ? { dateOfBirth: normalizeBirthDate(dateOfBirth) } : {}),
        ...(placeOfBirth !== undefined ? { placeOfBirth: blankToNull(placeOfBirth) } : {}),
      }
    })

    res.json({ message: 'Student updated', student: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Replaces the old silent "delete" (which never deleted anything, just set
// isActive: false with no visible status or way back). status is the
// explicit, reversible reason; isActive is kept in sync since every existing
// "active students only" query elsewhere in the API already filters on it —
// see the comment on Student.status in schema.prisma.
const VALID_STATUSES = ['ACTIVE', 'DISABLED', 'DISMISSED']

export const setStudentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const status = String(req.body.status || '')

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ message: 'status must be ACTIVE, DISABLED, or DISMISSED' })
      return
    }

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const updated = await prisma.student.update({
      where: { id },
      data: { status: status as any, isActive: status === 'ACTIVE' },
    })
    // Reactivated (e.g. un-dismissed) — make sure they're not missing a
    // current-term report card, same as any newly created active student.
    if (status === 'ACTIVE' && student.status !== 'ACTIVE') {
      await ensureReportCardForCurrentTerm(schoolId, id, req.user!.id)
    }
    res.json({ message: 'Student status updated', student: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/students/bulk-promote
 * Moves a list of Level 1 HND students up to Level 2.
 * directLevel2Entry stays false (carry-over fee behaviour).
 */
export const bulkPromoteStudents = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentIds: string[] = Array.isArray(req.body.studentIds) ? req.body.studentIds : []
    if (studentIds.length === 0) {
      res.status(400).json({ message: 'No students selected.' })
      return
    }

    // Verify all students belong to this school and are in a Level 1 class
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId, isActive: true },
      select: { id: true, classLevel: true },
    })

    const toUpdate: { id: string; newLevel: string }[] = []
    for (const s of students) {
      if (!/ - Level 1$/i.test(s.classLevel)) continue
      const newLevel = s.classLevel.replace(/ - Level 1$/i, ' - Level 2')
      toUpdate.push({ id: s.id, newLevel })
    }

    if (toUpdate.length === 0) {
      res.status(400).json({ message: 'None of the selected students are in a Level 1 class.' })
      return
    }

    await prisma.$transaction(
      toUpdate.map(({ id, newLevel }) =>
        prisma.student.update({ where: { id }, data: { classLevel: newLevel, directLevel2Entry: false, isRepeatingLevel: false } }),
      ),
    )

    res.json({ message: `${toUpdate.length} student${toUpdate.length !== 1 ? 's' : ''} promoted to Level 2.`, promoted: toUpdate.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Bulk import — transfers a school's existing Excel/CSV roster in one go
// instead of one-at-a-time creation. Same Student model/fields for every
// school type (primary/secondary/university) — no type-specific branching.

export const downloadStudentImportTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const [school, classes] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } }),
      prisma.classLevel.findMany({ where: { schoolId }, orderBy: { order: 'asc' }, select: { name: true } }),
    ])
    const buffer = await buildImportTemplate(classes.map((c) => c.name), school?.type === 'UNIVERSITY')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.xlsx"')
    res.send(buffer)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Parses + validates only — writes nothing. The admin reviews the result
// (and fixes the file if needed) before anything is actually created, so a
// re-upload of a corrected file can never produce duplicate students.
// For university schools, existing students are passed so Level 2 carry-overs
// can be detected by matricule or name match before anything is created.
export const previewStudentImport = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }

    const [school, classes] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } }),
      prisma.classLevel.findMany({ where: { schoolId }, select: { name: true } }),
    ])

    let existingStudents: { name: string; studentId: string }[] | undefined
    if (school?.type === 'UNIVERSITY') {
      existingStudents = await prisma.student.findMany({
        where: { schoolId, isActive: true },
        select: { name: true, studentId: true },
      })
    }

    const result = await previewStudentRows(file.buffer, file.originalname, classes.map((c) => c.name), existingStudents)
    res.json(result)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Failed to read that file. Make sure it is a valid .xlsx or .csv file.' })
  }
}

// Takes the rows the admin already reviewed in the preview step (not the raw
// file again) and actually creates them. Sequential, one DB round-trip per
// row, so generateStudentId's collision-safe lookup sees every prior insert
// in this same batch — simplest way to reuse it correctly without
// reimplementing the sequential-numbering logic for a batch.
export const commitStudentImport = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const rows = req.body.rows as ParsedStudentRow[] | undefined
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ message: 'No rows to import' })
      return
    }

    // Recording a fee payment is normally Admin/VP-only (fees.routes.ts) — a
    // CLASS_TEACHER can still bulk-import students through this same endpoint
    // (matches createStudent's roles), just without the fee side-effect.
    const canRecordFees = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'].includes(req.user!.role)
    const hasFeeRows = rows.some((r) => r.feePaid != null && r.feePaid > 0)
    const session = canRecordFees && hasFeeRows ? await currentSession(schoolId) : null
    // Looked up once for the whole batch (not per row) — same current term for every import.
    const currentTerm = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } })

    let created = 0
    let feesRecorded = 0
    const failed: { row: number; name: string; reason: string }[] = []
    for (const r of rows) {
      // Re-checked per row (not once upfront) — matches createStudent's own
      // enforcement, so a demo school's cap can't be blown past mid-batch.
      const limitMessage = await demoLimitBlock(schoolId, 'students')
      if (limitMessage) { failed.push({ row: r.row, name: r.name, reason: limitMessage }); continue }
      try {
        const studentId = await generateStudentId(schoolId)
        const student = await prisma.student.create({
          data: {
            schoolId, studentId, name: r.name, classLevel: r.classLevel, gender: r.gender,
            guardianName: r.guardianName, guardianPhone: r.guardianPhone, guardianEmail: r.guardianEmail,
            directLevel2Entry: !!r.directLevel2Entry,
          },
        })
        created++
        await ensureReportCardForCurrentTerm(schoolId, student.id, req.user!.id, currentTerm?.id ?? null)

        // Most transferring students have already paid part of the class fee —
        // record it as one installment, same shape as the manual "Add Payment"
        // flow. A failure here doesn't undo the student that was just created.
        if (canRecordFees && session && r.feePaid != null && r.feePaid > 0) {
          try {
            await prisma.feePayment.create({
              data: {
                schoolId, studentId: student.id, session, amount: r.feePaid,
                paidOn: r.paymentDate ? new Date(r.paymentDate) : new Date(),
                note: 'Recorded during student import', recordedBy: req.user!.id,
              },
            })
            feesRecorded++
          } catch { /* student is already created; fee can be added manually after */ }
        }
      } catch (err) {
        failed.push({ row: r.row, name: r.name, reason: 'Could not create this student' })
      }
    }

    res.json({
      created, failed, feesRecorded,
      feeWarning: hasFeeRows && !canRecordFees ? 'Fee payments were not recorded — only an admin or vice-principal can record fees.'
        : hasFeeRows && !session ? 'Fee payments were not recorded — no current academic term is set.'
        : undefined,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

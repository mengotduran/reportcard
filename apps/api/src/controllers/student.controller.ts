import { Response } from 'express'
import path from 'path'
import fs from 'fs'
import prisma, { IS_OFFLINE_BUILD } from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { stripProgramme, withProgrammeOf } from '../utils/programme'
import { normalizeGuardianPhone } from '../utils/phone'
import { buildGuardianPhoneSheet, readGuardianPhoneSheet, phoneProblemOf } from '../utils/guardianPhoneSheet'
import { linkGuardianByContact } from '../utils/guardianLink'
import { demoLimitBlock } from '../config/demo'
import { UPLOAD_DIR } from '../config/uploads'

function deleteFile(urlPath: string) {
  try {
    const filePath = path.join(UPLOAD_DIR, path.basename(urlPath))
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch { /* ignore */ }
}

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
import { ensureDepartments } from '../utils/departments'
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
    // Day/Evening. Resolved server-side and NOT on the client, because the roster is
    // paginated: filtering a page would report "no evening students" whenever none happen
    // to fall on the page being looked at, which is exactly what it did.
    const programme = req.query.programme ? String(req.query.programme).toUpperCase() : null
    const programmeNames = programme === 'DAY' || programme === 'EVENING'
      ? (await prisma.classLevel.findMany({ where: { schoolId, programme }, select: { name: true } })).map((c) => c.name)
      : null
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

    const where = {
      schoolId,
      ...yearOrStatusScope,
      // An explicit class already implies its section, so it wins over the programme filter.
      ...(classLevel
        ? { classLevel: String(classLevel) }
        : programmeNames
          ? { classLevel: { in: programmeNames } }
          : {}),
      // Matches name, matricule OR class — the same three fields the clients were
      // filtering on locally, so moving search server-side (needed once the list is
      // paginated) doesn't quietly narrow what's searchable.
      //
      // `mode: 'insensitive'` is Postgres-only — passing it to SQLite throws "Unknown
      // argument mode", which took out student search entirely on offline installs.
      // SQLite's LIKE is already case-insensitive for ASCII, so it just omits the flag.
      ...(search
        ? (() => {
            const value = String(search)
            const like = IS_OFFLINE_BUILD ? { contains: value } : { contains: value, mode: 'insensitive' as const }
            return { OR: [{ name: like }, { studentId: like }, { classLevel: like }] }
          })()
        : {}),
    }

    // Optional pagination — omitting page/pageSize keeps the whole-roster behavior, so
    // existing callers (web, imports, exports) are untouched. `id` breaks ties on name
    // so paging can't drop or repeat a student between pages.
    const pageNum = Number(req.query.page)
    const pageSizeNum = Number(req.query.pageSize)
    const paginated = Number.isInteger(pageNum) && pageNum > 0 && Number.isInteger(pageSizeNum) && pageSizeNum > 0
    const pageSize = paginated ? Math.min(pageSizeNum, 200) : 0

    const [students, totalCount] = await Promise.all([
      prisma.student.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...(paginated ? { skip: (pageNum - 1) * pageSize, take: pageSize } : {}),
      }),
      paginated ? prisma.student.count({ where }) : Promise.resolve(null),
    ])

    res.json({
      students,
      total: totalCount ?? students.length,
      ...(paginated ? { page: pageNum, pageSize, hasMore: pageNum * pageSize < (totalCount ?? 0) } : {}),
    })
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
  // Normalised first, so an evening student's matricule is built exactly like a day
  // student's — otherwise the level digit is dropped from their abbreviation.
  classLevel = stripProgramme(classLevel)
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

    // Required, and stored in one canonical international shape. This is the number a
    // guardian is reached on, so it has to be dialable rather than merely present — see
    // utils/phone.ts for why the column itself stays nullable (existing rows predate the
    // rule and a NOT NULL migration would need a backfill nobody can supply).
    const phone = normalizeGuardianPhone(guardianPhone)
    if ('error' in phone) {
      res.status(400).json({ message: phone.error })
      return
    }

    // Every downstream thing a student touches (report cards, fees) is scoped to the
    // current term/session — fee recording already refused to work without one
    // (currentSession, used by fees.controller.ts). Creating a student before one exists
    // used to be silently allowed: ensureReportCardForCurrentTerm below just no-ops with
    // no current term, leaving the student with no report card and nothing to surface
    // that gap later. Blocked at the source instead.
    if (!(await currentSession(schoolId))) {
      res.status(400).json({ message: 'Set a current academic year/term before adding students.' })
      return
    }

    // classLevel used to be taken on faith — a stale or typo'd value silently created a
    // student belonging to no real class, which for a secondary school also means no
    // real department (department is derived from ClassLevel, not stored on Student).
    const targetClass = await prisma.classLevel.findUnique({ where: { schoolId_name: { schoolId, name: classLevel } } })
    if (!targetClass) {
      res.status(400).json({ message: 'Select a valid class.' })
      return
    }

    const limit = await demoLimitBlock(schoolId, 'students')
    if (limit) { res.status(403).json({ message: limit }); return }

    const studentId = await generateStudentId(schoolId, classLevel)

    const student = await prisma.student.create({
      // Birth details are optional: an empty form field becomes NULL rather than "", so
      // "not provided" stays a single thing and the row simply prints blank.
      data: { schoolId, name, studentId, classLevel, gender, guardianName, guardianPhone: phone.e164, guardianEmail, directLevel2Entry: !!directLevel2Entry,
        dateOfBirth: normalizeBirthDate(dateOfBirth), placeOfBirth: blankToNull(placeOfBirth) }
    })
    await ensureReportCardForCurrentTerm(schoolId, student.id, req.user!.id)

    // A parent who already has an account for this contact sees the new child straight away,
    // with no second invite and no second password.
    const link = await linkGuardianByContact({
      schoolId, studentId: student.id, guardianPhone: phone.e164, guardianEmail,
    })

    res.status(201).json({ message: 'Student created', student, guardianLinked: link })
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

    // Same rule as create: only touch classLevel when the caller actually sent one, but
    // when they did, it must be a real class — otherwise a "change department" edit could
    // silently detach the student from every department.
    if (classLevel !== undefined) {
      const targetClass = await prisma.classLevel.findUnique({ where: { schoolId_name: { schoolId, name: classLevel } } })
      if (!targetClass) {
        res.status(400).json({ message: 'Select a valid class.' })
        return
      }
    }

    // Only validated when the caller actually sends a value, so a client that knows nothing
    // about guardian details cannot be forced to supply one. When something IS typed it must
    // be valid — including on a student created before the rule existed, which is how those
    // older rows get cleaned up.
    //
    // An EMPTY string means "still unknown" and leaves the column alone. It is not an error:
    // guardian phone only became required for newly created students, so the roster of a
    // school that has been running for years is full of blanks, and refusing the update
    // would mean no such student could be edited at all until a number was invented for
    // them. Clearing a number that is already on file is deliberately not offered here.
    let normalizedPhone: string | undefined
    if (guardianPhone !== undefined && String(guardianPhone).trim() !== '') {
      const phone = normalizeGuardianPhone(guardianPhone)
      if ('error' in phone) {
        res.status(400).json({ message: phone.error })
        return
      }
      normalizedPhone = phone.e164
    }

    const updated = await prisma.student.update({
      where: { id },
      data: {
        name, classLevel,
        ...(gender !== undefined ? { gender } : {}),
        guardianName, guardianEmail,
        ...(normalizedPhone !== undefined ? { guardianPhone: normalizedPhone } : {}),
        ...(directLevel2Entry !== undefined ? { directLevel2Entry: !!directLevel2Entry } : {}),
        ...(isRepeatingLevel !== undefined ? { isRepeatingLevel: !!isRepeatingLevel } : {}),
        // Only touched when the client actually sends them, so a caller that knows
        // nothing about birth details cannot wipe them.
        ...(dateOfBirth !== undefined ? { dateOfBirth: normalizeBirthDate(dateOfBirth) } : {}),
        ...(placeOfBirth !== undefined ? { placeOfBirth: blankToNull(placeOfBirth) } : {}),
      }
    })

    // Same on an edit: pointing a student at a guardian who is already registered attaches
    // them, rather than leaving that parent to be invited all over again.
    const link = await linkGuardianByContact({
      schoolId,
      studentId: updated.id,
      guardianPhone: updated.guardianPhone,
      guardianEmail: updated.guardianEmail,
    })

    res.json({ message: 'Student updated', student: updated, guardianLinked: link })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Same flow as School.logo/stamp (see school.controller.ts uploadLogo/uploadStamp):
// disk upload via multer, the old file removed once the new one is on record.
export const uploadStudentPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    if (!req.file) { res.status(400).json({ message: 'No file uploaded' }); return }

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) { res.status(404).json({ message: 'Student not found' }); return }
    if (student.photo) deleteFile(student.photo)

    const url = `/uploads/${req.file.filename}`
    const updated = await prisma.student.update({ where: { id }, data: { photo: url } })
    res.json({ message: 'Photo uploaded', student: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const removeStudentPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) { res.status(404).json({ message: 'Student not found' }); return }
    if (student.photo) deleteFile(student.photo)
    const updated = await prisma.student.update({ where: { id }, data: { photo: null } })
    res.json({ message: 'Photo removed', student: updated })
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
      // Evening Level 1 students were skipped entirely here: the test anchors at the end
      // of the name, where their section marker sits, so a promotion either dropped them
      // silently or reported "none are in a Level 1 class". They promote into the EVENING
      // Level 2, never the day one.
      const bare = stripProgramme(s.classLevel)
      if (!/ - Level 1$/i.test(bare)) continue
      const newLevel = withProgrammeOf(s.classLevel, bare.replace(/ - Level 1$/i, ' - Level 2'))
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
      prisma.classLevel.findMany({ where: { schoolId }, orderBy: { order: 'asc' }, select: { name: true, departmentId: true } }),
    ])
    const departments = await ensureDepartments(schoolId, school?.type)
    const buffer = await buildImportTemplate(school?.type ?? 'PRIMARY', classes, departments)
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
      prisma.classLevel.findMany({ where: { schoolId }, select: { name: true, departmentId: true, programme: true } }),
    ])
    const departments = await ensureDepartments(schoolId, school?.type)

    // Day/Evening comes from the filter the admin is on, sent alongside the file. The sheet
    // has no column for it, and a department running both sittings cannot be resolved without
    // it. Anything unrecognised means "not chosen", which only blocks the ambiguous rows.
    const rawProgramme = String((req.body?.programme ?? 'ALL')).toUpperCase()
    const programme = rawProgramme === 'DAY' || rawProgramme === 'EVENING' ? rawProgramme : 'ALL'

    let existingStudents: { name: string; studentId: string }[] | undefined
    if (school?.type === 'UNIVERSITY') {
      existingStudents = await prisma.student.findMany({
        where: { schoolId, isActive: true },
        select: { name: true, studentId: true },
      })
    }

    const result = await previewStudentRows(file.buffer, file.originalname, school?.type ?? 'PRIMARY', classes, departments, existingStudents, programme)
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
    // Same rule as createStudent: no current term, no new students — this used to only
    // affect whether a report card got auto-created (ensureReportCardForCurrentTerm below
    // silently no-ops without one), letting a whole import silently produce students with
    // no report card and nothing to surface that later.
    if (!currentTerm) {
      res.status(400).json({ message: 'Set a current academic year/term before importing students.' })
      return
    }

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

/**
 * DELETE /api/students/:id
 *
 * Deletes a student outright. This exists for ONE case: a data-entry mistake — a
 * duplicate row, a name typed into the wrong class, a registration that was never a
 * real child. It is not the way a student leaves the school.
 *
 * A student who has been graded is an academic record, not a row. Schools are expected
 * to produce a transcript years after a student has gone, so once anything has been
 * recorded against them the delete path closes for good and the only exits are DISABLED
 * or DISMISSED, which keep the record and take them out of rosters, class lists and
 * report runs. That is the same line every school information system draws, and it is
 * why the checks below are on the server rather than in the confirmation dialog: the
 * typed-name prompt in the UI guards against clicking the wrong row, this guards the
 * record itself.
 *
 * Applies to all three school types. "Has a report card" is the check that carries the
 * rule for every one of them: a card is created for each active student when a term
 * opens, so a student who has sat so much as one term or semester has one, whether or
 * not any mark was ever entered into it.
 */
/**
 * Everything that makes a student a record rather than a typo.
 *
 * Deliberately shared by `GET /students/:id/deletable` and `DELETE /students/:id`, so the
 * greyed-out button and the refusal can never disagree. A pre-flight check that says one
 * thing while the enforcement says another is worse than having no pre-flight at all: it
 * teaches the admin to trust a button that is sometimes lying.
 *
 * All three are counted every time and reported together, so the answer is never "fix one
 * thing, try again, discover the next one".
 */
const getStudentDeleteBlockers = async (studentId: string, studentName: string) => {
  const [reportCards, feePayments, hndPayments] = await Promise.all([
    prisma.reportCard.count({ where: { studentId } }),
    prisma.feePayment.count({ where: { studentId } }),
    prisma.hndRegistrationPayment.count({ where: { studentId } }),
  ])

  const counts = { reportCards, feePayments, hndRegistrationPayments: hndPayments }
  if (reportCards === 0 && feePayments === 0 && hndPayments === 0) {
    return { deletable: true as const, counts, message: '' }
  }

  const reasons: string[] = []
  if (reportCards > 0) reasons.push(reportCards === 1 ? 'a report card' : `${reportCards} report cards`)
  if (feePayments > 0) reasons.push(feePayments === 1 ? 'a fee payment' : `${feePayments} fee payments`)
  if (hndPayments > 0) reasons.push(hndPayments === 1 ? 'a registration payment' : `${hndPayments} registration payments`)
  const list = reasons.length === 1 ? reasons[0]
    : `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`

  return {
    deletable: false as const,
    counts,
    message: `${studentName} has ${list} on record and cannot be deleted. Mark them Disabled or Dismissed instead, which removes them from class lists and report cards while keeping their record.`,
  }
}

/**
 * GET /api/students/:id/deletable
 *
 * Asked before the delete dialog opens, so an admin is told up front that this student
 * cannot be deleted and why, rather than typing out a name in full and only then being
 * refused. Read-only, and the real enforcement still lives in deleteStudent below: this
 * exists to make the UI honest, not to be trusted by it.
 */
export const getStudentDeletable = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const blockers = await getStudentDeleteBlockers(id, student.name)
    res.json({ ...blockers, reason: blockers.deletable ? undefined : 'HAS_ACADEMIC_RECORD' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteStudent = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const student = await prisma.student.findFirst({ where: { id, schoolId } })
    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const blockers = await getStudentDeleteBlockers(id, student.name)
    if (!blockers.deletable) {
      res.status(409).json({
        message: blockers.message,
        reason: 'HAS_ACADEMIC_RECORD',
        counts: blockers.counts,
      })
      return
    }

    // SubjectExclusion is the only remaining child row, and it cascades at the database
    // level. It is still deleted explicitly, inside the same transaction as the student,
    // so that adding a future table hanging off Student fails loudly here rather than
    // half-completing the delete and leaving a student listed with nothing behind them —
    // the failure mode that emptied a school through seedDemo and deleteSchool.
    await prisma.$transaction(async (tx) => {
      await tx.subjectExclusion.deleteMany({ where: { studentId: id } })
      await tx.student.delete({ where: { id } })
    })

    // Only once the row is definitely gone: a file deleted before a failed transaction
    // would strand the student with a broken photo path.
    if (student.photo) deleteFile(student.photo)

    res.json({ message: `${student.name} was deleted`, id })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// ── Guardian phone backfill ─────────────────────────────────────────────────
//
// Guardian phone became required in createStudent, but only for students created after
// that. A school that has been running for years has a full roster and an empty column,
// and no parent can be given portal access until it is filled: the invite is delivered to
// that number. These two endpoints are the bulk way to fill it — download who is missing
// one, fill one column, upload it back. See utils/guardianPhoneSheet.ts.

/** GET /api/students/guardian-phones/sheet?classLevel=&missingOnly=1 */
export const downloadGuardianPhoneSheet = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const classLevel = String(req.query.classLevel ?? '').trim()
    // Default: only the students who actually need attention. A whole-roster sheet is
    // available (missingOnly=0) for a school that would rather review every number.
    const missingOnly = String(req.query.missingOnly ?? '1') !== '0'

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        isActive: true,
        status: 'ACTIVE',
        ...(classLevel && classLevel !== 'all' ? { classLevel } : {}),
      },
      select: { studentId: true, name: true, classLevel: true, guardianName: true, guardianPhone: true },
      orderBy: [{ classLevel: 'asc' }, { name: 'asc' }],
    })

    // Filtered here rather than in the query: "usable" is normalizeGuardianPhone's verdict,
    // which no `where` can express — a stored "+237 670 000 00" is present and still useless.
    const rows = missingOnly ? students.filter((s) => phoneProblemOf(s.guardianPhone) !== null) : students

    const buffer = await buildGuardianPhoneSheet(rows)
    const scope = classLevel && classLevel !== 'all' ? classLevel.replace(/[^a-z0-9]+/gi, '-') : 'all-classes'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="guardian-phones-${scope}.xlsx"`)
    res.send(buffer)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/students/guardian-phones/import — dry run by default.
 *
 * The same file is uploaded twice: once to see what would change, once with `apply=1` to
 * write it. Re-reading the file on apply (rather than trusting a client-supplied row list,
 * as the student importer does) is deliberate here, because the payload would otherwise be
 * a list of "set student X's phone to Y" that the browser could hold while the admin walks
 * away and the roster moves underneath it.
 */
export const importGuardianPhones = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
    const apply = String(req.body?.apply ?? '') === '1'

    const students = await prisma.student.findMany({
      where: { schoolId },
      select: { id: true, studentId: true, name: true, guardianPhone: true },
    })

    const result = await readGuardianPhoneSheet(file.buffer, file.originalname, students)
    if (result.headerError) {
      res.status(400).json({ message: result.headerError })
      return
    }

    if (!apply) {
      res.json({ ...result, applied: 0 })
      return
    }

    // Chunked rather than one transaction over a thousand updates: Postgres holds every row
    // lock until the commit, and this runs against a live school where somebody else is
    // editing students at the same time. A chunk that fails leaves the earlier ones written,
    // which is the right outcome here — re-uploading the same file is safe and idempotent.
    const CHUNK = 100
    let applied = 0
    for (let i = 0; i < result.changes.length; i += CHUNK) {
      const chunk = result.changes.slice(i, i + CHUNK)
      await prisma.$transaction(
        chunk.map((c) => prisma.student.update({ where: { id: c.studentId }, data: { guardianPhone: c.e164 } })),
        { timeout: 60_000 },
      )
      applied += chunk.length
    }

    res.json({ ...result, applied })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Failed to read that file. Make sure it is a valid .xlsx or .csv file.' })
  }
}

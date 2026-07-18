import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { generateRemark, classifyRemarkSource } from '../utils/aiRemarks'
import { parseStoredScale } from '../utils/gradingScale'

// Roles that teach. Everyone else who may save marks (SCHOOL_ADMIN, VICE_PRINCIPAL) is
// the administration, which is the distinction MarksEntryMode.ADMIN_ONLY turns on —
// but that distinction only exists for universities; a primary/secondary admin never
// enters marks themselves, full stop.
const TEACHER_ROLES: string[] = ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'CLASS_MASTER']
const ADMIN_ROLES: string[] = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']

/**
 * A school where the administration records marks appoints no class masters, so the
 * general remarks are the administration's to write too. Returns a refusal message when
 * this role must not touch remarks here, or null when it may.
 *
 * Enforced server-side rather than only hiding the field: the UI is a courtesy, the
 * endpoint is the rule.
 */
async function remarksBlockedForRole(schoolId: string, role: string): Promise<string | null> {
  if (role !== 'CLASS_MASTER') return null
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { marksEntryMode: true } })
  if (school?.marksEntryMode !== 'ADMIN_ONLY') return null
  return 'General remarks are written by the administration at this school.'
}

// University marking split: CA out of 30, exam out of 70, course out of 100. The same
// split the marks grid and the report card print with.
const UNIVERSITY_EXAM_MAX = 70
const UNIVERSITY_COURSE_MAX = 100

// A subject scoped to one term (university courses) only counts for that term;
// a subject with no term (primary/secondary, and any non-term-scoped subject)
// always counts. Matched by term NAME, same reasoning as Subject.classLevel
// matching ClassLevel.name — see the comment on Subject.term in schema.prisma.
const subjectTermFilter = (termName: string) => ({ OR: [{ term: null }, { term: termName }] })

// Which ACTIVE students in a class + term are not yet ready to publish (no
// report card / missing sequence marks / missing remarks). Already-published
// cards count as ready. Disabled/Dismissed students (isActive: false) are
// excluded entirely — same convention used everywhere else in this file.
// Positions are class-relative, so publishing one card while classmates are
// still incomplete would show a rank that later changes — this list is what
// blocks BOTH single-card publish and bulk publish until it's empty.
async function findPublishBlockers(
  schoolId: string, classLevel: string, termId: string, termName: string,
): Promise<{ studentId: string; student: string; reason: string }[]> {
  const [students, subjects, reportCards] = await Promise.all([
    prisma.student.findMany({ where: { schoolId, classLevel, isActive: true }, select: { id: true, name: true } }),
    prisma.subject.findMany({ where: { schoolId, classLevel, ...subjectTermFilter(termName) }, select: { id: true, name: true, compulsory: true } }),
    prisma.reportCard.findMany({
      where: { schoolId, termId, student: { classLevel, isActive: true } },
      include: { entries: true, student: { select: { id: true, name: true } } },
    }),
  ])
  if (subjects.length === 0) return []

  const issues: { studentId: string; student: string; reason: string }[] = []
  for (const student of students) {
    const rc = reportCards.find((r) => r.student.id === student.id)
    if (!rc) { issues.push({ studentId: student.id, student: student.name, reason: 'No report card found for this term' }); continue }
    if (rc.status === 'PUBLISHED') continue

    // An optional subject the student never opted into (no entry at all) isn't
    // "missing" — it just doesn't apply to them. Only flag it if compulsory, or
    // if they started it but left it incomplete (has an entry, missing a seq).
    const missingSubjects = subjects.filter((s) => {
      const e = rc.entries.find((en) => en.subjectId === s.id)
      if (!e) return s.compulsory !== false
      return e.seq1Score == null || e.seq2Score == null
    })
    if (missingSubjects.length > 0) {
      issues.push({ studentId: student.id, student: student.name, reason: `Missing sequences for: ${missingSubjects.slice(0, 3).map((s) => s.name).join(', ')}${missingSubjects.length > 3 ? '…' : ''}` })
      continue
    }

    if (!rc.remarks?.trim() && !rc.remarksFr?.trim()) {
      issues.push({ studentId: student.id, student: student.name, reason: 'No general remarks yet' })
    }
  }
  return issues
}

// Get all report cards for the school
export const getReportCards = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { termId, classLevel, session } = req.query

    const [reportCards, school] = await Promise.all([
      prisma.reportCard.findMany({
        where: {
          schoolId,
          ...(termId ? { termId: String(termId) } : {}),
          ...(session ? { term: { session: String(session) } } : {}),
          ...(classLevel ? { student: { classLevel: String(classLevel) } } : {})
        },
        include: {
          student: true,
          term: true,
          entries: { include: { subject: true } },
          createdBy: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } }),
    ])

    // For university schools, compute CGPA per student in one batch query.
    let cgpaByStudent: Record<string, number> = {}
    if (school?.type === 'UNIVERSITY' && reportCards.length > 0) {
      const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId } })
      const rawRanges: any[] = gradingScale?.ranges
        ? (Array.isArray((gradingScale.ranges as any).ranges)
            ? (gradingScale.ranges as any).ranges
            : gradingScale.ranges as any)
        : []
      const uniRanges = rawRanges.filter((r: any) => r.gradePoint != null)

      const studentIds = [...new Set(reportCards.map(rc => rc.studentId))]
      const allEntries = await prisma.reportEntry.findMany({
        where: {
          reportCard: { studentId: { in: studentIds }, schoolId, status: 'PUBLISHED' },
          score: { not: null },
        },
        include: { subject: { select: { credit: true } }, reportCard: { select: { studentId: true } } },
      })

      const wpMap: Record<string, { wp: number; cr: number }> = {}
      for (const e of allEntries) {
        if (e.score == null) continue
        const studentId = (e.reportCard as any).studentId
        const credit = (e.subject as any).credit ?? 0
        const sorted = [...uniRanges].sort((a: any, b: any) => b.minScore - a.minScore)
        const match = sorted.find((r: any) => e.score! >= r.minScore && e.score! <= r.maxScore)
        if (match == null) continue
        if (!wpMap[studentId]) wpMap[studentId] = { wp: 0, cr: 0 }
        wpMap[studentId].wp += match.gradePoint * credit
        wpMap[studentId].cr += credit
      }
      for (const [sid, { wp, cr }] of Object.entries(wpMap)) {
        if (cr > 0) cgpaByStudent[sid] = wp / cr
      }
    }

    // Whether each card's student can print an ANNUAL transcript yet — ready once a
    // PUBLISHED report card exists for EVERY period of that card's session. Keyed
    // studentId::session because the list can span sessions when filtered that way.
    // Counted from the session's actual terms, so it covers a university's two
    // semesters and a primary/secondary school's three terms alike.
    const transcriptReadyByKey: Record<string, boolean> = {}
    // Which term CLOSES each session (last by startDate) — the annual transcript action
    // only shows on that term's rows (it's a year-end document, not a per-period one).
    // That's the second semester at a university and the third term everywhere else.
    const finalTermIdBySession = new Map<string, string>()
    if (reportCards.length > 0) {
      const sessions = [...new Set(reportCards.map(rc => rc.term.session))]
      const sIds = [...new Set(reportCards.map(rc => rc.studentId))]
      const [sessionTerms, publishedCards] = await Promise.all([
        prisma.term.findMany({ where: { schoolId, session: { in: sessions } }, select: { id: true, session: true }, orderBy: { startDate: 'asc' } }),
        prisma.reportCard.findMany({
          where: { schoolId, studentId: { in: sIds }, status: 'PUBLISHED', term: { session: { in: sessions } } },
          select: { studentId: true, termId: true, term: { select: { session: true } } },
        }),
      ])
      const termCountBySession = new Map<string, number>()
      for (const t of sessionTerms) termCountBySession.set(t.session, (termCountBySession.get(t.session) ?? 0) + 1)
      for (const t of sessionTerms) finalTermIdBySession.set(t.session, t.id) // asc — last write = latest startDate
      const publishedTermsByKey = new Map<string, Set<string>>()
      for (const c of publishedCards) {
        const key = `${c.studentId}::${c.term.session}`
        if (!publishedTermsByKey.has(key)) publishedTermsByKey.set(key, new Set())
        publishedTermsByKey.get(key)!.add(c.termId)
      }
      for (const rc of reportCards) {
        const key = `${rc.studentId}::${rc.term.session}`
        const total = termCountBySession.get(rc.term.session) ?? 0
        transcriptReadyByKey[key] = total > 0 && (publishedTermsByKey.get(key)?.size ?? 0) >= total
      }
    }

    // Class size per term: how many students in this class + term actually got
    // ranked (non-null average) — the denominator next to "Position". Computed
    // in-memory from the already-fetched set (it always includes every card
    // matching the term/class filters, same population saveEntries ranks).
    // Class average uses the same population — mean of their `average` field.
    const classSizeByKey = new Map<string, number>()
    const classAverageSumByKey = new Map<string, number>()
    for (const rc of reportCards) {
      if (rc.average == null) continue
      const key = `${rc.termId}::${rc.student.classLevel}`
      classSizeByKey.set(key, (classSizeByKey.get(key) ?? 0) + 1)
      classAverageSumByKey.set(key, (classAverageSumByKey.get(key) ?? 0) + rc.average)
    }

    // For non-university schools, compute annual average + class rank for any
    // card that is the final term of its session (mirrors the getReportCard
    // single-fetch logic and the End-Year PASS/REPEAT formula).
    const annualByCardId: Record<string, { average: number | null; position: number | null; classSize: number }> = {}
    if (school?.type !== 'UNIVERSITY' && reportCards.length > 0) {
      const sessionsInvolved = [...new Set(reportCards.map((rc) => rc.term.session))]
      const allSessionTerms = await prisma.term.findMany({
        where: { schoolId, session: { in: sessionsInvolved } },
        orderBy: { startDate: 'asc' },
        select: { id: true, session: true },
      })
      const finalTermIdBySession = new Map<string, string>()
      for (const t of allSessionTerms) finalTermIdBySession.set(t.session, t.id) // ordered asc — last write = latest startDate

      const finalCards = reportCards.filter((rc) => finalTermIdBySession.get(rc.term.session) === rc.termId)
      const groups = new Map<string, { classLevel: string; termIds: string[] }>()
      for (const rc of finalCards) {
        const key = `${rc.student.classLevel}::${rc.term.session}`
        if (!groups.has(key)) {
          const termIds = allSessionTerms.filter((t) => t.session === rc.term.session).map((t) => t.id)
          groups.set(key, { classLevel: rc.student.classLevel, termIds })
        }
      }
      for (const { classLevel: gClassLevel, termIds } of groups.values()) {
        const sessionCards = await prisma.reportCard.findMany({
          where: { schoolId, termId: { in: termIds }, average: { not: null }, student: { classLevel: gClassLevel } },
          select: { studentId: true, average: true },
        })
        const byStudent = new Map<string, { sum: number; count: number }>()
        for (const c of sessionCards) {
          const e = byStudent.get(c.studentId) ?? { sum: 0, count: 0 }
          e.sum += c.average!
          e.count += 1
          byStudent.set(c.studentId, e)
        }
        const ranked = [...byStudent.entries()]
          .map(([studentId, { sum, count }]) => ({ studentId, annualAvg: sum / count }))
          .sort((a, b) => b.annualAvg - a.annualAvg)
        const posByStudent = new Map<string, number>()
        let pos = 1
        for (let i = 0; i < ranked.length; i++) {
          if (i > 0 && ranked[i].annualAvg !== ranked[i - 1].annualAvg) pos = i + 1
          posByStudent.set(ranked[i].studentId, pos)
        }
        for (const rc of finalCards) {
          if (rc.student.classLevel !== gClassLevel) continue
          const agg = byStudent.get(rc.studentId)
          annualByCardId[rc.id] = {
            average: agg ? agg.sum / agg.count : null,
            position: posByStudent.get(rc.studentId) ?? null,
            classSize: byStudent.size,
          }
        }
      }
    }

    const result = reportCards.map(rc => {
      const key = `${rc.termId}::${rc.student.classLevel}`
      const classSize = classSizeByKey.get(key) ?? null
      const classAverageSum = classAverageSumByKey.get(key)
      return {
        ...rc,
        cgpa: cgpaByStudent[rc.studentId] ?? null,
        transcriptReady: transcriptReadyByKey[`${rc.studentId}::${rc.term.session}`] ?? false,
        isFinalTerm: finalTermIdBySession.get(rc.term.session) === rc.termId,
        classSize,
        classAverage: classSize && classAverageSum != null ? classAverageSum / classSize : null,
        annualAverage: annualByCardId[rc.id]?.average ?? null,
        annualPosition: annualByCardId[rc.id]?.position ?? null,
        annualClassSize: annualByCardId[rc.id]?.classSize ?? null,
      }
    })

    res.json({ reportCards: result, total: result.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Marks export — per-student subject scores for a term (drives the CSV broadsheet).
// classLevel optional: omit for the whole school, provide for one class.
export const getMarksExport = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const termId = String(req.query.termId || '')
    const classLevel = req.query.classLevel ? String(req.query.classLevel) : undefined

    if (!termId) {
      res.status(400).json({ message: 'A term is required' })
      return
    }

    const term = await prisma.term.findFirst({ where: { id: termId, schoolId } })
    if (!term) {
      res.status(404).json({ message: 'Term not found' })
      return
    }

    // Column set: subjects configured for the school (or the one class), ordered.
    const subjectRows = await prisma.subject.findMany({
      where: { schoolId, ...(classLevel ? { classLevel } : {}), ...subjectTermFilter(term.name) },
      orderBy: [{ classLevel: 'asc' }, { name: 'asc' }],
      select: { name: true },
    })
    const subjects = Array.from(new Set(subjectRows.map((s) => s.name)))

    // Base on the report cards OF THIS TERM — so the export matches exactly the
    // students shown when the table is filtered to that term (a student only
    // "belongs" to a term once they have a report card in it). Disabled/Dismissed
    // students are excluded — this drives bulk CSV exports, same rule as bulk
    // report-card printing (see Student.status in schema.prisma).
    const cards = await prisma.reportCard.findMany({
      where: { schoolId, termId, student: { isActive: true, ...(classLevel ? { classLevel } : {}) } },
      include: { student: true, entries: { include: { subject: true } } },
      orderBy: [{ student: { classLevel: 'asc' } }, { position: 'asc' }, { student: { name: 'asc' } }],
    })

    const students = cards.map((rc) => {
      const scores: Record<string, number | null> = {}
      for (const e of rc.entries) scores[e.subject.name] = e.score
      return {
        studentId: rc.studentId,
        name: rc.student.name,
        studentIdCode: rc.student.studentId,
        classLevel: rc.student.classLevel,
        average: rc.average,
        position: rc.position,
        scores,
      }
    })

    res.json({
      term: { id: term.id, name: term.name, session: term.session },
      classLevel: classLevel ?? null,
      subjects,
      students,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Get single report card
export const getReportCard = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const reportCard = await prisma.reportCard.findFirst({
      where: { id, schoolId },
      include: {
        student: true,
        term: true,
        school: true,
        entries: { include: { subject: true } },
        createdBy: { select: { id: true, name: true } }
      }
    })

    if (!reportCard) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    // Compute class-wide min / avg / max per subject for the same class + term.
    // One extra query; results are keyed by subjectId so the print renderer can
    // look them up without looping over all entries.
    const classEntries = await prisma.reportEntry.findMany({
      where: {
        reportCard: { termId: reportCard.termId, student: { classLevel: reportCard.student.classLevel } },
        score: { not: null },
      },
      select: { subjectId: true, score: true },
    })
    const bySubject: Record<string, number[]> = {}
    for (const ce of classEntries) {
      if (ce.score == null) continue
      if (!bySubject[ce.subjectId]) bySubject[ce.subjectId] = []
      bySubject[ce.subjectId].push(ce.score)
    }
    const subjectStats: Record<string, { min: number; avg: number; max: number }> = {}
    for (const [sid, scores] of Object.entries(bySubject)) {
      const sum = scores.reduce((a, b) => a + b, 0)
      subjectStats[sid] = {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: sum / scores.length,
      }
    }

    // Compute CGPA for university schools: Σ(GP×credit) / Σ(credit) across ALL
    // published terms for this student (current term included).
    let cgpa: number | null = null
    if (reportCard.school.type === 'UNIVERSITY') {
      const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId } })
      const rawRanges: any[] = gradingScale?.ranges
        ? (Array.isArray((gradingScale.ranges as any).ranges)
            ? (gradingScale.ranges as any).ranges
            : gradingScale.ranges as any)
        : []
      const uniRanges = rawRanges.filter((r: any) => r.gradePoint != null)

      const allEntries = await prisma.reportEntry.findMany({
        where: {
          reportCard: { studentId: reportCard.studentId, schoolId, status: 'PUBLISHED' },
          score: { not: null },
        },
        include: { subject: { select: { credit: true } } },
      })

      let totalWP = 0, totalCredits = 0
      for (const e of allEntries) {
        if (e.score == null) continue
        const credit = (e.subject as any).credit ?? 0
        const sorted = [...uniRanges].sort((a: any, b: any) => b.minScore - a.minScore)
        const match = sorted.find((r: any) => e.score! >= r.minScore && e.score! <= r.maxScore)
        if (match == null) continue
        totalWP += match.gradePoint * credit
        totalCredits += credit
      }
      if (totalCredits > 0) cgpa = totalWP / totalCredits
    }

    // Class size for this term: how many students actually received a position
    // (non-null average) in this class + term — the denominator shown next to
    // "Position" on the report card (e.g. "3rd / 45"). Meaningful for any school
    // type — university report cards also carry a within-term average rank.
    // Class average is the mean of `average` over that same population.
    const classCards = await prisma.reportCard.findMany({
      where: { schoolId, termId: reportCard.termId, average: { not: null }, student: { classLevel: reportCard.student.classLevel } },
      select: { average: true },
    })
    const classSize = classCards.length
    const classAverage = classSize > 0 ? classCards.reduce((s, c) => s + c.average!, 0) / classSize : null

    // Annual average + class rank: only on the final term of the session (by
    // date, not by name — schools name terms freely) for non-university
    // schools. Mirrors the End-Year PASS/REPEAT formula (mean of whichever
    // term averages exist for the student this session — tolerant of gaps).
    let annualAverage: number | null = null
    let annualPosition: number | null = null
    let annualClassSize: number | null = null
    if (reportCard.school.type !== 'UNIVERSITY') {
      const sessionTerms = await prisma.term.findMany({
        where: { schoolId, session: reportCard.term.session },
        orderBy: { startDate: 'asc' },
        select: { id: true },
      })
      const isFinalTermOfSession = sessionTerms.length > 0 && sessionTerms[sessionTerms.length - 1].id === reportCard.termId

      if (isFinalTermOfSession) {
        const sessionTermIds = sessionTerms.map((t) => t.id)
        const sessionCards = await prisma.reportCard.findMany({
          where: { schoolId, termId: { in: sessionTermIds }, average: { not: null }, student: { classLevel: reportCard.student.classLevel } },
          select: { studentId: true, average: true },
        })
        const byStudent = new Map<string, { sum: number; count: number }>()
        for (const c of sessionCards) {
          const e = byStudent.get(c.studentId) ?? { sum: 0, count: 0 }
          e.sum += c.average!
          e.count += 1
          byStudent.set(c.studentId, e)
        }
        const ranked = [...byStudent.entries()]
          .map(([studentId, { sum, count }]) => ({ studentId, annualAvg: sum / count }))
          .sort((a, b) => b.annualAvg - a.annualAvg)

        annualAverage = byStudent.has(reportCard.studentId) ? (byStudent.get(reportCard.studentId)!.sum / byStudent.get(reportCard.studentId)!.count) : null
        annualClassSize = byStudent.size

        let pos = 1
        for (let i = 0; i < ranked.length; i++) {
          if (i > 0 && ranked[i].annualAvg !== ranked[i - 1].annualAvg) pos = i + 1
          if (ranked[i].studentId === reportCard.studentId) { annualPosition = pos; break }
        }
      }
    }

    res.json({ ...reportCard, subjectStats, cgpa, classSize, classAverage, annualAverage, annualPosition, annualClassSize })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Create report card
export const createReportCard = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const createdById = req.user!.id
    const { studentId, termId } = req.body

    const existing = await prisma.reportCard.findUnique({
      where: { studentId_termId: { studentId, termId } },
      include: { student: true, term: true }
    })
    if (existing) {
      // Return the existing report card so the client can navigate to it
      res.status(200).json({ message: 'Report card already exists', reportCard: existing, alreadyExists: true })
      return
    }

    const reportCard = await prisma.reportCard.create({
      data: { studentId, termId, schoolId, createdById },
      include: { student: true, term: true }
    })

    res.status(201).json({ message: 'Report card created', reportCard })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Save report card entries (scores)
export const saveEntries = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { entries, remarks } = req.body

    const reportCard = await prisma.reportCard.findFirst({ where: { id, schoolId } })
    if (!reportCard) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true, marksEntryMode: true } })
    const isUniversity = school?.type === 'UNIVERSITY'

    const role = req.user!.role
    const userId = req.user!.id

    // School policy: some universities record marks centrally so that the person who
    // teaches a course is never the person who enters its marks. Enforced here rather
    // than only in the UI, because a locked grid is a suggestion: the endpoint is what
    // actually decides. Teachers keep READ access; only saving is refused.
    //
    // `marksEditGrantedTo` stays the escape hatch: an admin can hand one class to one
    // teacher without changing the school's policy (same grant used for published cards).
    if (school?.marksEntryMode === 'ADMIN_ONLY' && TEACHER_ROLES.includes(role) && reportCard.marksEditGrantedTo !== userId) {
      res.status(403).json({ message: 'Marks are entered by the administration at this school. Ask an admin to record them, or to grant you access to this class.' })
      return
    }

    // Admin-entered marks are a university-only arrangement, and only once the school has
    // switched it on. A primary/secondary admin, or a university admin who hasn't enabled
    // ADMIN_ONLY, has the same standing as any other non-teacher here: none, unless
    // explicitly granted this one card.
    if (ADMIN_ROLES.includes(role) && !(isUniversity && school?.marksEntryMode === 'ADMIN_ONLY') && reportCard.marksEditGrantedTo !== userId) {
      res.status(403).json({ message: 'Marks are entered by teachers at this school. Ask the subject teacher to record them, or grant yourself access to this class.' })
      return
    }

    // A published card is frozen for EVERYONE, the administration included: to change a
    // mark you unpublish first. Publishing is what fixes a class's averages and positions,
    // so a mark moving underneath a published card silently invalidates the cards already
    // handed out. Making the admin unpublish makes that consequence a deliberate act.
    //
    // This also closes a hole: the rule used to name CLASS_TEACHER and CLASS_MASTER only,
    // so a SUBJECT_TEACHER could edit a published card outright.
    //
    // The one exception stays the explicit grant, which an admin hands to one teacher for
    // one card; it is consumed on use, below.
    if (reportCard.status === 'PUBLISHED' && reportCard.marksEditGrantedTo !== userId) {
      res.status(403).json({
        message: TEACHER_ROLES.includes(role)
          ? 'This report card has been published. Ask your admin to unpublish it, or to grant you access.'
          : 'This report card is published. Unpublish it before changing its marks.',
      })
      return
    }
    if (reportCard.status === 'PUBLISHED' && reportCard.marksEditGrantedTo === userId) {
      // Permission granted — revoke after this save
      await prisma.reportCard.update({ where: { id }, data: { marksEditGrantedTo: null } })
    }

    // The resit marks already on file, read BEFORE anything is deleted. Saving any tab
    // re-sends every subject's existing resitScore untouched, so eligibility is enforced
    // only against marks that are actually being added or changed (see below).
    const priorEntries = await prisma.reportEntry.findMany({
      where: { reportCardId: id },
      select: { subjectId: true, resitScore: true },
    })
    const priorResit = new Map(priorEntries.map(e => [e.subjectId, e.resitScore]))

    // Fetch subjects for maxScore and coefficient
    const subjectIds = entries.map((e: { subjectId: string }) => e.subjectId)
    const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds } } })
    const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]))

    // Fetch grading scale — drives BOTH the letter grade and the auto-remark
    // so report cards reflect the school's grading design.
    const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId } })
    // Parsed, never read straight off the column: the scale is stored either as a bare
    // array (legacy) or as { ranges, … } (what saveGradingScale writes today). Reading it
    // directly meant `.length` was undefined for the object shape, so this silently used
    // the DEFAULT scale instead of the school's own, and `.some()` below would have thrown
    // outright for a non-university school. juryDecision, which only the school's real
    // scale carries, is exactly what resit eligibility turns on.
    let gradeRanges = parseStoredScale(gradingScale?.ranges).ranges
    // For secondary schools, discard any stale 0–100 percent-scale ranges (boundary > 20).
    // University ranges are intentionally 0–100 and must NOT be stripped.
    if (!isUniversity && gradeRanges.some(r => Number(r?.maxScore) > 20 || Number(r?.minScore) > 20)) gradeRanges = []

    // Secondary fallback (0–20 scale); university defaults are 0–100.
    const DEFAULT_API_RANGES = isUniversity
      ? [
          { minScore: 80, maxScore: 100, grade: 'A',  remark: 'Excellent' },
          { minScore: 70, maxScore: 79,  grade: 'B+', remark: 'Very Good' },
          { minScore: 60, maxScore: 69,  grade: 'B',  remark: 'Good' },
          { minScore: 55, maxScore: 59,  grade: 'C+', remark: 'Fairly Good' },
          { minScore: 50, maxScore: 54,  grade: 'C',  remark: 'Average' },
          { minScore: 45, maxScore: 49,  grade: 'D',  remark: 'Poor' },
          { minScore: 0,  maxScore: 44,  grade: 'F',  remark: 'Fail' },
        ]
      : [
          { minScore: 18, maxScore: 20, grade: 'A+', remark: 'Excellent' },
          { minScore: 16, maxScore: 18, grade: 'A',  remark: 'Very Good' },
          { minScore: 14, maxScore: 16, grade: 'B',  remark: 'Good' },
          { minScore: 12, maxScore: 14, grade: 'C',  remark: 'Fairly Good' },
          { minScore: 10, maxScore: 12, grade: 'D',  remark: 'Average' },
          { minScore: 0,  maxScore: 10, grade: 'F',  remark: 'Fail' },
        ]
    const effectiveRanges = gradeRanges.length > 0 ? gradeRanges : DEFAULT_API_RANGES
    // A boundary mark goes to the higher grade (sorted by min desc).
    const matchRange = (score: number) => {
      const sorted = [...effectiveRanges].sort((a, b) => b.minScore - a.minScore)
      return sorted.find(r => score >= r.minScore && score <= r.maxScore)
    }
    const getAutoRemark = (score: number): string => matchRange(score)?.remark ?? ''
    const getGradeLetter = (score: number): string => matchRange(score)?.grade ?? calculateGrade(isUniversity ? score : (score / 20) * 100)

    // ── Resit eligibility (university) ───────────────────────────────────────────
    // A resit may be recorded for any student who FAILED THE COURSE, whatever their exam
    // mark was. Re-sitting only replaces the exam (the CA carries over), so a student who
    // passed the exam but failed the course on a weak CA is exactly who it helps: lifting
    // the exam is their only route to a pass. A student who PASSED the course is refused:
    // there is nothing to fix. The marks grid already locks ineligible rows; this is the
    // rule actually being enforced, rather than trusting whatever the client sends.
    //
    // Judged on the school's own scale, so no pass mark is hardcoded. Bands are matched
    // on their lower bound: real scales use integer bounds (0-44, 45-49) and an exam
    // normalised out of 100 is fractional (31/70 = 44.29), which falls straight through
    // the gap between bands under min..max containment and reads a fail as a pass.
    const isFailingApi = (score: number): boolean => {
      const sorted = [...effectiveRanges].sort((a, b) => b.minScore - a.minScore)
      const band = sorted.find(r => score >= r.minScore)
      if (!band) return false
      const jury = (band as { juryDecision?: string }).juryDecision
      if (jury?.trim()) return jury.trim().toUpperCase() === 'FAIL'
      return band.grade?.trim().toUpperCase() === 'F' || band.remark?.trim().toUpperCase() === 'FAIL'
    }
    if (isUniversity) {
      const ineligible: string[] = []
      for (const entry of entries as { subjectId: string; seq1Score?: number; seq2Score?: number; resitScore?: number }[]) {
        const incoming = entry.resitScore ?? null
        if (incoming == null) continue
        // Untouched marks pass through: rows predating this rule must not block a teacher
        // from saving CA or Exam marks for that student (they are re-sent on every save).
        const prior = priorResit.get(entry.subjectId) ?? null
        if (prior != null && prior === incoming) continue
        const ca = entry.seq1Score ?? null
        const exam = entry.seq2Score ?? null
        const eligible = ca != null && exam != null && isFailingApi(ca + exam)
        if (!eligible) ineligible.push(subjectMap[entry.subjectId]?.name ?? entry.subjectId)
      }
      if (ineligible.length > 0) {
        res.status(400).json({
          message: `A resit mark can only be recorded for a student who failed the course. Not eligible: ${ineligible.join(', ')}.`,
        })
        return
      }
    }

    // Delete existing entries and recreate. Deliberately after every validation above:
    // bailing out once these are gone would wipe the card's marks.
    await prisma.reportEntry.deleteMany({ where: { reportCardId: id } })

    const createdEntries = await Promise.all(
      entries.map((entry: { subjectId: string; score?: number; seq1Score?: number; seq2Score?: number; resitScore?: number; grade?: string; remarks?: string }) => {
        const seq1 = entry.seq1Score ?? null
        const seq2 = entry.seq2Score ?? null
        // University only: a resit re-does the Exam component; CA (seq1) carries over unchanged.
        // The original seq2Score is preserved for the record — resitScore, when present, is what
        // actually counts toward the total/grade/GPA.
        const resit = isUniversity ? (entry.resitScore ?? null) : null
        const effectiveSeq2 = resit ?? seq2
        // University: TOTAL = CA + EXAM (direct sum, both components on their own scale).
        // Secondary: TOTAL = average of the two sequences.
        const finalScore: number | null = entry.score !== undefined
          ? entry.score
          : seq1 !== null && effectiveSeq2 !== null
            ? isUniversity ? seq1 + effectiveSeq2 : (seq1 + effectiveSeq2) / 2
            : null
        const sub = subjectMap[entry.subjectId]
        // University: match raw 0-100 score against 0-100 ranges.
        // Secondary: normalise to /20 then match against 0-20 ranges.
        const scoreForGrade = isUniversity
          ? finalScore
          : (finalScore !== null && sub && sub.maxScore > 0 ? (finalScore / sub.maxScore) * 20 : null)
        const autoRemark = scoreForGrade !== null ? getAutoRemark(scoreForGrade) : ''
        return prisma.reportEntry.create({
          data: {
            reportCardId: id,
            subjectId: entry.subjectId,
            seq1Score: seq1,
            seq2Score: seq2,
            resitScore: resit,
            score: finalScore,
            grade: scoreForGrade !== null ? getGradeLetter(scoreForGrade) : null,
            remarks: autoRemark
          }
        })
      })
    )

    // Weighted average out of maxScore (e.g. 14.4/20)
    // average = Σ(score × coeff) / Σ(coeff)
    let totalWeighted = 0
    let totalCoeff = 0
    for (const e of createdEntries) {
      if (e.score == null) continue // skip unfilled subjects
      const sub = subjectMap[e.subjectId]
      const coeff = sub?.coefficient ?? 1
      totalWeighted += e.score * coeff
      totalCoeff += coeff
    }
    const average = totalCoeff > 0 ? totalWeighted / totalCoeff : null
    const totalScore = totalWeighted // Σ(score × coeff) for filled subjects only

    await prisma.reportCard.update({
      where: { id },
      data: { totalScore, average, ...(remarks !== undefined ? { remarks } : {}) }
    })

    // Recalculate class positions for this term
    const savedCard = await prisma.reportCard.findFirst({
      where: { id },
      include: { student: true }
    })
    if (savedCard) {
      const allCards = await prisma.reportCard.findMany({
        where: { schoolId, termId: savedCard.termId, student: { classLevel: savedCard.student.classLevel } },
        orderBy: [{ average: 'desc' }, { id: 'asc' }]
      })
      let pos = 1
      for (let i = 0; i < allCards.length; i++) {
        if (i > 0 && allCards[i].average !== allCards[i - 1].average) pos = i + 1
        await prisma.reportCard.update({
          where: { id: allCards[i].id },
          data: { position: allCards[i].average != null ? pos : null }
        })
      }
    }

    res.json({ message: 'Entries saved', entries: createdEntries })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Publish report card
export const publishReportCard = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const reportCard = await prisma.reportCard.findFirst({
      where: { id, schoolId },
      include: {
        entries: { select: { subjectId: true, seq1Score: true, seq2Score: true } },
        student: { select: { classLevel: true } },
        term: { select: { name: true } },
      },
    })
    if (!reportCard) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    const classLevel = reportCard.student.classLevel
    const [subjects, classMaster] = await Promise.all([
      prisma.subject.findMany({ where: { schoolId, classLevel, ...subjectTermFilter(reportCard.term.name) }, select: { id: true, name: true, compulsory: true } }),
      prisma.user.findFirst({ where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: classLevel, isActive: true } }),
    ])

    // Rule 1 — a class with no subjects cannot be published
    if (subjects.length === 0) {
      res.status(400).json({ message: 'This class has no subjects. Add subjects before publishing.' })
      return
    }

    // Rule 2 — every subject must have both sequences filled. An optional
    // subject the student never opted into (no entry at all) isn't "missing" —
    // only flag it if compulsory, or if they started it but left it incomplete.
    const missing = subjects.filter(s => {
      const e = reportCard.entries.find(en => en.subjectId === s.id)
      if (!e) return s.compulsory !== false
      return e.seq1Score == null || e.seq2Score == null
    })
    if (missing.length > 0) {
      res.status(400).json({ message: `Cannot publish — missing marks for: ${missing.map(s => s.name).slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}` })
      return
    }

    // Rule 3 — general remarks are required for every report card
    if (!reportCard.remarks?.trim() && !reportCard.remarksFr?.trim()) {
      const who = classMaster ? 'the class master' : 'an admin / vice-principal'
      res.status(400).json({ message: `Cannot publish — general remarks have not been added yet (${who} must write them).` })
      return
    }

    // Rule 4 — every other active student in this class + term must also be
    // fully marked (or already published) before ANY single card in the class
    // can be published. Class positions are relative to the whole class, so
    // publishing early would show a rank that changes once everyone else is
    // graded. Disabled/Dismissed students are excluded from this check.
    const blockers = await findPublishBlockers(schoolId, classLevel, reportCard.termId, reportCard.term.name)
    if (blockers.length > 0) {
      const names = blockers.slice(0, 3).map((b) => b.student).join(', ')
      res.status(400).json({
        message: `Cannot publish yet — ${blockers.length} other student${blockers.length > 1 ? 's' : ''} in this class ${blockers.length > 1 ? 'are' : 'is'} still incomplete (${names}${blockers.length > 3 ? '…' : ''}). All active students must be graded before any report card in the class is published, since positions are class-relative.`,
      })
      return
    }

    const updated = await prisma.reportCard.update({
      where: { id },
      data: { status: 'PUBLISHED' }
    })

    res.json({ message: 'Report card published', reportCard: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Delete report card
export const deleteReportCard = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const reportCard = await prisma.reportCard.findFirst({ where: { id, schoolId } })
    if (!reportCard) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    await prisma.reportEntry.deleteMany({ where: { reportCardId: id } })
    await prisma.reportCard.delete({ where: { id } })

    res.json({ message: 'Report card deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Returns all students in a class with their report card status for a given term
export const getClassOverview = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { termId, classLevel } = req.query

    if (!termId || !classLevel) {
      res.status(400).json({ message: 'termId and classLevel are required' })
      return
    }

    const term = await prisma.term.findFirst({ where: { id: String(termId), schoolId }, select: { name: true } })
    if (!term) { res.status(404).json({ message: 'Term not found' }); return }

    // Fetch students + their entries, subject count, and the teacher's assigned subjects for this class
    const [students, subjectCount, teacherSubjects] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId, classLevel: String(classLevel), isActive: true },
        include: {
          reportCards: {
            where: { termId: String(termId) },
            select: {
              id: true, status: true, average: true,
              marksEditGrantedTo: true, remarksEditGrantedTo: true,
              entries: { select: { subjectId: true, seq1Score: true, seq2Score: true, resitScore: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.subject.count({ where: { schoolId, classLevel: String(classLevel), ...subjectTermFilter(term.name) } }),
      prisma.teacherSubject.findMany({
        where: { userId: req.user!.id, subject: { classLevel: String(classLevel), ...subjectTermFilter(term.name) } },
        select: { subjectId: true },
      }),
    ])

    // IDs of subjects this teacher is responsible for in this class
    const teacherSubjectIds = teacherSubjects.map(ts => ts.subjectId)

    const result = students.map((s) => {
      const rc = s.reportCards[0] ?? null
      // marksFilled: teacher has entries for ALL of their assigned subjects AND every entry has both seqs.
      // This prevents a student from appearing "filled" just because another teacher's subjects are complete.
      let marksFilled: boolean
      if (rc !== null && teacherSubjectIds.length > 0) {
        const myEntries = rc.entries.filter(e => teacherSubjectIds.includes(e.subjectId))
        marksFilled = myEntries.length === teacherSubjectIds.length &&
          myEntries.every(e => e.seq1Score != null && e.seq2Score != null)
      } else {
        marksFilled = false
      }
      return {
        id: s.id,
        name: s.name,
        studentId: s.studentId,
        classLevel: s.classLevel,
        reportCard: rc ? {
          id: rc.id,
          status: rc.status,
          average: rc.average,
          marksEditGrantedTo: rc.marksEditGrantedTo,
          remarksEditGrantedTo: rc.remarksEditGrantedTo,
          marksFilled,
          // Included so the mobile marks sheet can build its rows from THIS one response.
          // It used to fetch every student's report card individually — one request per
          // student — which on a phone's wifi is a timeout waiting to happen.
          entries: rc.entries,
        } : null,
      }
    })

    // teacherSubjectCount = how many of this class's subjects the caller teaches
    // (0 for admins/VPs, who don't have TeacherSubject rows). Lets the teacher
    // classes view hide classes where the teacher teaches nothing.
    res.json({ students: result, subjectCount, teacherSubjectCount: teacherSubjectIds.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Update the general remarks (English + French) for Class Master / Admin.
// Recomputes provenance (AI / AI_EDITED / MANUAL) by comparing the saved text
// to the stored AI draft.
/**
 * General remarks may only be written once every subject the student offers is
 * marked: all compulsory subjects + any optional subject they have an entry for.
 * Mirrors the report-card screen's "all sequences filled" gate.
 */
async function offeredSubjectsAllMarked(schoolId: string, reportCardId: string): Promise<boolean> {
  const rc = await prisma.reportCard.findFirst({
    where: { id: reportCardId }, select: { student: { select: { classLevel: true } }, term: { select: { name: true } } },
  })
  if (!rc) return false
  const [classSubjects, entries] = await Promise.all([
    prisma.subject.findMany({ where: { schoolId, classLevel: rc.student.classLevel, ...subjectTermFilter(rc.term.name) }, select: { id: true, compulsory: true } }),
    prisma.reportEntry.findMany({ where: { reportCardId }, select: { subjectId: true, score: true } }),
  ])
  const scoreBy = new Map(entries.map((e) => [e.subjectId, e.score]))
  const offered = classSubjects.filter((s) => s.compulsory !== false || scoreBy.has(s.id))
  return offered.length > 0 && offered.every((s) => scoreBy.get(s.id) != null)
}

export const updateRemarks = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { remarks, remarksFr } = req.body

    const reportCard = await prisma.reportCard.findFirst({ where: { id, schoolId } })
    if (!reportCard) { res.status(404).json({ message: 'Report card not found' }); return }

    const role = req.user!.role
    const userId = req.user!.id

    // Authorisation first: "enter all the marks before writing the remark" is misleading
    // advice for someone who may not write this remark at all.
    const remarksBlocked = await remarksBlockedForRole(schoolId, role)
    if (remarksBlocked) { res.status(403).json({ message: remarksBlocked }); return }

    if (!(await offeredSubjectsAllMarked(schoolId, id))) {
      res.status(400).json({ message: "Enter marks for all of the student's subjects before writing the general remark." })
      return
    }

    if (reportCard.status === 'PUBLISHED' && role === 'CLASS_MASTER') {
      if (reportCard.remarksEditGrantedTo !== userId) {
        res.status(403).json({ message: 'This report card has been published. Request permission from your admin to edit remarks.' })
        return
      }
      // Permission granted — revoke after this save
      await prisma.reportCard.update({ where: { id }, data: { remarksEditGrantedTo: null } })
    }

    // Keep existing FR if the caller only sends EN (backward compatible).
    const nextFr = remarksFr !== undefined ? remarksFr : reportCard.remarksFr
    const source = classifyRemarkSource(remarks, nextFr, reportCard.remarksAiEn, reportCard.remarksAiFr)

    const updated = await prisma.reportCard.update({
      where: { id },
      data: { remarks, remarksFr: nextFr, remarksSource: source },
    })
    res.json({ message: 'Remarks updated', reportCard: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Generate an AI bilingual remark DRAFT from the student's term average.
// Stores the draft as the frozen AI reference + pre-fills the editable remark,
// but does NOT publish. The class master reviews/edits, then saves via
// updateRemarks. Never blocks: degrades to a band default if the AI is down.
export const generateRemarks = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const reportCard = await prisma.reportCard.findFirst({
      where: { id, schoolId },
      include: { student: { select: { name: true } }, school: { select: { language: true } } },
    })
    if (!reportCard) { res.status(404).json({ message: 'Report card not found' }); return }

    const role = req.user!.role
    const userId = req.user!.id

    // Same rule as writing a remark by hand: generating one is still writing it.
    const remarksBlocked = await remarksBlockedForRole(schoolId, role)
    if (remarksBlocked) { res.status(403).json({ message: remarksBlocked }); return }

    if (reportCard.status === 'PUBLISHED' && role === 'CLASS_MASTER' && reportCard.remarksEditGrantedTo !== userId) {
      res.status(403).json({ message: 'This report card has been published. Request permission from your admin to edit remarks.' })
      return
    }

    if (!(await offeredSubjectsAllMarked(schoolId, id)) || reportCard.average == null) {
      res.status(400).json({ message: "Enter marks for all of the student's subjects before generating the general remark." })
      return
    }

    // Generate in the school section's language only (EN or FR), not both.
    const lang = reportCard.school.language === 'FR' ? 'FR' : 'EN'
    const result = await generateRemark(reportCard.student.name, reportCard.average, lang)

    // Freeze the AI draft (in the matching language field) for later provenance
    // comparison and pre-fill the editable remark. Source starts as AI until edited.
    const data = lang === 'FR'
      ? { remarksAiFr: result.text, remarksFr: result.text, remarksAiEn: null, remarks: null, remarksSource: 'AI' }
      : { remarksAiEn: result.text, remarks: result.text, remarksAiFr: null, remarksFr: null, remarksSource: 'AI' }
    const updated = await prisma.reportCard.update({ where: { id }, data })

    res.json({
      message: result.source === 'ai' ? 'AI remark generated' : 'AI unavailable — used a default remark you can edit',
      aiAvailable: result.source === 'ai',
      language: lang,
      remarks: updated.remarks,
      remarksFr: updated.remarksFr,
      reportCard: updated,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Grant edit permission (admin/VP only)
export const grantEditPermission = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { type, userId } = req.body // type: 'marks' | 'remarks', userId: string

    if (!userId) { res.status(400).json({ message: 'userId is required' }); return }

    const reportCard = await prisma.reportCard.findFirst({ where: { id, schoolId } })
    if (!reportCard) { res.status(404).json({ message: 'Report card not found' }); return }

    const data: any = {}
    if (type === 'marks')   data.marksEditGrantedTo = userId
    if (type === 'remarks') data.remarksEditGrantedTo = userId

    const updated = await prisma.reportCard.update({ where: { id }, data })
    res.json({ message: 'Edit permission granted', reportCard: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Revoke edit permission (admin/VP only)
export const revokeEditPermission = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { type } = req.body // 'marks' | 'remarks'

    const reportCard = await prisma.reportCard.findFirst({ where: { id, schoolId } })
    if (!reportCard) { res.status(404).json({ message: 'Report card not found' }); return }

    const data: any = {}
    if (type === 'marks')   data.marksEditGrantedTo = null
    if (type === 'remarks') data.remarksEditGrantedTo = null

    const updated = await prisma.reportCard.update({ where: { id }, data })
    res.json({ message: 'Edit permission revoked', reportCard: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Unpublish report card (admin/VP only)
export const unpublishReportCard = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const reportCard = await prisma.reportCard.findFirst({ where: { id, schoolId } })
    if (!reportCard) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    const updated = await prisma.reportCard.update({
      where: { id },
      data: { status: 'DRAFT' }
    })

    res.json({ message: 'Report card unpublished', reportCard: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Bulk publish all eligible report cards for a class (admin/VP only)
export const bulkPublish = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { classLevel, termId } = req.body

    if (!classLevel || !termId) {
      res.status(400).json({ message: 'classLevel and termId are required' })
      return
    }

    const term = await prisma.term.findFirst({ where: { id: termId, schoolId }, select: { name: true } })
    if (!term) {
      res.status(404).json({ message: 'Term not found' })
      return
    }

    // A class with no subjects cannot be published
    const subjectCount = await prisma.subject.count({ where: { schoolId, classLevel, ...subjectTermFilter(term.name) } })
    if (subjectCount === 0) {
      const total = await prisma.student.count({ where: { schoolId, classLevel, isActive: true } })
      res.json({ published: 0, skipped: total, issues: [{ student: '—', reason: 'This class has no subjects — add subjects before publishing' }] })
      return
    }

    // All-or-nothing: every active student in the class + term must be fully
    // marked (or already published) before ANY of them get published. Class
    // positions are relative to the whole class, so publishing some while
    // others are incomplete would show a rank that later changes.
    const issues = await findPublishBlockers(schoolId, classLevel, termId, term.name)
    if (issues.length > 0) {
      res.json({ published: 0, skipped: issues.length, issues })
      return
    }

    const result = await prisma.reportCard.updateMany({
      where: { schoolId, termId, student: { classLevel, isActive: true }, status: { not: 'PUBLISHED' } },
      data: { status: 'PUBLISHED' }
    })

    res.json({ published: result.count, skipped: 0, issues: [] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Check publish readiness per class (same rules as bulkPublish, no writes)
export const getClassReadiness = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { termId } = req.query as { termId?: string }

    if (!termId) { res.status(400).json({ message: 'termId required' }); return }

    const term = await prisma.term.findFirst({ where: { id: termId, schoolId }, select: { name: true } })
    if (!term) { res.status(404).json({ message: 'Term not found' }); return }

    const [students, subjects, reportCards] = await Promise.all([
      prisma.student.findMany({ where: { schoolId, isActive: true }, select: { id: true, name: true, classLevel: true } }),
      prisma.subject.findMany({ where: { schoolId, ...subjectTermFilter(term.name) }, select: { id: true, classLevel: true, compulsory: true } }),
      prisma.reportCard.findMany({
        where: { schoolId, termId },
        select: { id: true, status: true, remarks: true, remarksFr: true, student: { select: { id: true, classLevel: true } }, entries: { select: { subjectId: true, seq1Score: true, seq2Score: true } }
        }
      }),
    ])

    // Class levels present in this term
    const classLevels = [...new Set(students.map(s => s.classLevel))]

    const result: Record<string, { ready: boolean; missingSeqs: number; missingRemarks: number; total: number; noSubjects: boolean }> = {}

    for (const classLevel of classLevels) {
      const classStudents = students.filter(s => s.classLevel === classLevel)
      const classSubjects = subjects.filter(s => s.classLevel === classLevel)

      // General remarks are required for every class (admin/VP can write them
      // when there is no class master).
      const requiresRemarks = true

      let missingSeqs = 0
      let missingRemarks = 0

      for (const student of classStudents) {
        const rc = reportCards.find(r => r.student.id === student.id)
        if (!rc || rc.status === 'PUBLISHED') continue

        // Check both sequences for every subject. An optional subject the
        // student never opted into (no entry) isn't missing — only compulsory
        // subjects, or optional ones they started but left incomplete, count.
        for (const subject of classSubjects) {
          const entry = rc.entries.find(e => e.subjectId === subject.id)
          const isMissing = entry ? (entry.seq1Score == null || entry.seq2Score == null) : subject.compulsory !== false
          if (isMissing) {
            missingSeqs++
            break // count once per student
          }
        }

        if (requiresRemarks && !rc.remarks?.trim() && !rc.remarksFr?.trim()) missingRemarks++
      }

      const unpublished = classStudents.filter(s => {
        const rc = reportCards.find(r => r.student.id === s.id)
        return rc && rc.status !== 'PUBLISHED'
      }).length

      const noSubjects = classSubjects.length === 0
      result[classLevel] = {
        ready: !noSubjects && missingSeqs === 0 && missingRemarks === 0 && unpublished > 0,
        missingSeqs,
        missingRemarks,
        total: unpublished,
        noSubjects,
      }
    }

    res.json({ readiness: result })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Detailed readiness — which teacher is missing marks, which class master is missing remarks
export const getReadinessDetail = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const rc = await prisma.reportCard.findFirst({
      where: { id, schoolId },
      include: {
        entries: { select: { subjectId: true, seq1Score: true, seq2Score: true } },
        student: { select: { classLevel: true } },
        term: { select: { name: true } },
      },
    })
    if (!rc) { res.status(404).json({ message: 'Not found' }); return }

    const classLevel = rc.student.classLevel

    const [subjects, teacherSubjects, classMaster] = await Promise.all([
      prisma.subject.findMany({ where: { schoolId, classLevel, ...subjectTermFilter(rc.term.name) }, select: { id: true, name: true, compulsory: true } }),
      prisma.teacherSubject.findMany({
        where: { subject: { schoolId, classLevel, ...subjectTermFilter(rc.term.name) } },
        include: { user: { select: { id: true, name: true } }, subject: { select: { id: true } } },
      }),
      prisma.user.findFirst({
        where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: classLevel, isActive: true },
        select: { id: true, name: true },
      }),
    ])

    // An optional subject the student never opted into (no entry) isn't
    // missing — only compulsory subjects, or optional ones started but left
    // incomplete, count.
    const missingSubjects = subjects
      .filter(s => {
        const entry = rc.entries.find(e => e.subjectId === s.id)
        if (!entry) return s.compulsory !== false
        return entry.seq1Score == null || entry.seq2Score == null
      })
      .map(s => {
        const assignment = teacherSubjects.find(ts => ts.subject.id === s.id)
        return {
          subjectId: s.id,
          subjectName: s.name,
          teacher: assignment ? { id: assignment.user.id, name: assignment.user.name } : null,
        }
      })

    const remarksOk = !!(rc.remarks?.trim() || rc.remarksFr?.trim())

    // Other active students in this class + term who are blocking publish
    // (excluding this student — their own gaps are already covered above).
    const otherBlockers = (await findPublishBlockers(schoolId, classLevel, rc.termId, rc.term.name))
      .filter((b) => b.studentId !== rc.studentId)

    res.json({
      missingSubjects,
      classMaster,
      // Remarks required for every class — attribute to the master if there is
      // one, otherwise to admin / vice-principal.
      missingRemarks: !remarksOk ? (classMaster ?? { id: '', name: 'Admin / Vice-Principal' }) : null,
      allSeqsFilled: missingSubjects.length === 0,
      otherStudentsBlocking: otherBlockers.length,
      otherStudentsBlockingNames: otherBlockers.slice(0, 3).map((b) => b.student),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

function calculateGrade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 50) return 'D'
  return 'F'
}

// ── Annual University Transcript ─────────────────────────────────────────────
// Fetches BOTH semesters' report cards for a student in one academic year,
// returns everything the PrintableTranscript component needs in one round-trip.
export const getStudentTranscript = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const studentId = String(req.params.studentId)
    const session   = req.query.session ? String(req.query.session) : null

    // Resolve session: use provided or fall back to current term's session.
    let resolvedSession = session
    if (!resolvedSession) {
      const cur = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
      resolvedSession = cur?.session ?? null
    }
    if (!resolvedSession) {
      res.status(400).json({ message: 'No active academic year found' })
      return
    }

    const [student, reportCards, gradingScale, school, classLevel, termCount] = await Promise.all([
      prisma.student.findFirst({ where: { id: studentId, schoolId } }),
      prisma.reportCard.findMany({
        // Published only — an official annual transcript must never reflect
        // draft marks that can still change (same rule as bulk printing).
        where: { studentId, schoolId, term: { session: resolvedSession }, status: 'PUBLISHED' },
        include: {
          term: true,
          entries: {
            // coefficient drives the term tables + annual average on primary/secondary
            // transcripts (credit is the university's equivalent).
            include: { subject: { select: { id: true, name: true, code: true, credit: true, coefficient: true, term: true, classLevel: true } } },
            orderBy: [{ subject: { name: 'asc' } }],
          },
        },
        // Chronological — the transcript stacks its tables in year order. Ordering by
        // term NAME only happened to work while terms sorted alphabetically by
        // coincidence ("First…" < "Second…" < "Third…"); startDate is the real order.
        orderBy: { term: { startDate: 'asc' } },
      }),
      prisma.gradingScale.findUnique({ where: { schoolId } }),
      // `stamp` prints on official copies via the designer's stamp section.
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, logo: true, stamp: true, language: true, type: true, email: true, phone: true, address: true, website: true, authorizationNumber: true, officialLeftTextEn: true, officialLeftTextFr: true, officialRightTextEn: true, officialRightTextFr: true } }),
      prisma.student.findFirst({
        where: { id: studentId, schoolId },
        select: { classLevel: true },
      }).then(async (s) => s ? prisma.classLevel.findFirst({ where: { schoolId, name: s.classLevel }, select: { maxScore: true } }) : null),
      // How many periods this year actually has (2 semesters / 3 terms) — the page
      // needs it to tell a complete transcript from a partially published one.
      prisma.term.count({ where: { schoolId, session: resolvedSession } }),
    ])

    if (!student) {
      res.status(404).json({ message: 'Student not found' })
      return
    }

    const rawScale = gradingScale?.ranges as any
    let gradingRanges: any[] = []
    let classificationBands: any[] = []
    if (Array.isArray(rawScale)) {
      gradingRanges = rawScale
    } else if (rawScale && Array.isArray(rawScale.ranges)) {
      gradingRanges = rawScale.ranges
      classificationBands = rawScale.classificationBands ?? []
    }

    res.json({
      student,
      school,
      session: resolvedSession,
      reportCards,
      termCount,
      maxScore: (classLevel as { maxScore: number } | null)?.maxScore ?? 20,
      gradingScale: gradingRanges,
      classificationBands,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

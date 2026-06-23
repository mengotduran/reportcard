import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { generateRemark, classifyRemarkSource } from '../utils/aiRemarks'

// Get all report cards for the school
export const getReportCards = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { termId, classLevel, session } = req.query

    const reportCards = await prisma.reportCard.findMany({
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
    })

    res.json({ reportCards, total: reportCards.length })
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
      where: { schoolId, ...(classLevel ? { classLevel } : {}) },
      orderBy: [{ classLevel: 'asc' }, { name: 'asc' }],
      select: { name: true },
    })
    const subjects = Array.from(new Set(subjectRows.map((s) => s.name)))

    // Base on the report cards OF THIS TERM — so the export matches exactly the
    // students shown when the table is filtered to that term (a student only
    // "belongs" to a term once they have a report card in it).
    const cards = await prisma.reportCard.findMany({
      where: { schoolId, termId, ...(classLevel ? { student: { classLevel } } : {}) },
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

    res.json(reportCard)
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

    const role = req.user!.role
    const userId = req.user!.id
    if (reportCard.status === 'PUBLISHED' && (role === 'CLASS_TEACHER' || role === 'CLASS_MASTER')) {
      if (reportCard.marksEditGrantedTo !== userId) {
        res.status(403).json({ message: 'This report card has been published. Request permission from your admin to make changes.' })
        return
      }
      // Permission granted — revoke after this save
      await prisma.reportCard.update({ where: { id }, data: { marksEditGrantedTo: null } })
    }

    // Delete existing entries and recreate
    await prisma.reportEntry.deleteMany({ where: { reportCardId: id } })

    // Fetch subjects for maxScore and coefficient
    const subjectIds = entries.map((e: { subjectId: string }) => e.subjectId)
    const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds } } })
    const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]))

    // Fetch grading scale — drives BOTH the letter grade and the auto-remark
    // so report cards reflect the school's grading design.
    const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId } })
    const gradeRanges: { minScore: number; maxScore: number; grade?: string; remark: string }[] =
      gradingScale?.ranges ? (gradingScale.ranges as any) : []

    const DEFAULT_API_RANGES = [
      { minScore: 90, maxScore: 100, grade: 'A+', remark: 'Excellent' },
      { minScore: 75, maxScore: 89,  grade: 'A',  remark: 'Very Good' },
      { minScore: 60, maxScore: 74,  grade: 'B',  remark: 'Good' },
      { minScore: 50, maxScore: 59,  grade: 'C',  remark: 'Average' },
      { minScore: 40, maxScore: 49,  grade: 'D',  remark: 'Below Average' },
      { minScore: 0,  maxScore: 39,  grade: 'F',  remark: 'Fail' },
    ]
    const effectiveRanges = gradeRanges.length > 0 ? gradeRanges : DEFAULT_API_RANGES
    const matchRange = (pct: number) => {
      const sorted = [...effectiveRanges].sort((a, b) => b.minScore - a.minScore)
      return sorted.find(r => pct >= r.minScore && pct <= r.maxScore)
    }
    const getAutoRemark = (pct: number): string => matchRange(pct)?.remark ?? ''
    const getGradeLetter = (pct: number): string => matchRange(pct)?.grade ?? calculateGrade(pct)

    const createdEntries = await Promise.all(
      entries.map((entry: { subjectId: string; score?: number; seq1Score?: number; seq2Score?: number; grade?: string; remarks?: string }) => {
        const seq1 = entry.seq1Score ?? null
        const seq2 = entry.seq2Score ?? null
        // Only compute score when BOTH sequences are filled — null means "not entered yet"
        const finalScore: number | null = entry.score !== undefined
          ? entry.score
          : seq1 !== null && seq2 !== null
            ? (seq1 + seq2) / 2
            : null
        const sub = subjectMap[entry.subjectId]
        const pct = finalScore !== null && sub && sub.maxScore > 0
          ? (finalScore / sub.maxScore) * 100
          : null
        const autoRemark = pct !== null ? getAutoRemark(pct) : ''
        return prisma.reportEntry.create({
          data: {
            reportCardId: id,
            subjectId: entry.subjectId,
            seq1Score: seq1,
            seq2Score: seq2,
            score: finalScore,
            grade: finalScore !== null ? (entry.grade || getGradeLetter(pct!)) : null,
            remarks: entry.remarks || autoRemark
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
      },
    })
    if (!reportCard) {
      res.status(404).json({ message: 'Report card not found' })
      return
    }

    const classLevel = reportCard.student.classLevel
    const [subjects, classMaster] = await Promise.all([
      prisma.subject.findMany({ where: { schoolId, classLevel }, select: { id: true, name: true } }),
      prisma.user.findFirst({ where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: classLevel, isActive: true } }),
    ])

    // Rule 1 — a class with no subjects cannot be published
    if (subjects.length === 0) {
      res.status(400).json({ message: 'This class has no subjects. Add subjects before publishing.' })
      return
    }

    // Rule 2 — every subject must have both sequences filled
    const missing = subjects.filter(s => {
      const e = reportCard.entries.find(en => en.subjectId === s.id)
      return !e || e.seq1Score == null || e.seq2Score == null
    })
    if (missing.length > 0) {
      res.status(400).json({ message: `Cannot publish — missing marks for: ${missing.map(s => s.name).slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}` })
      return
    }

    // Rule 3 — general remarks are required for every report card
    if (!reportCard.remarks?.trim()) {
      const who = classMaster ? 'the class master' : 'an admin / vice-principal'
      res.status(400).json({ message: `Cannot publish — general remarks have not been added yet (${who} must write them).` })
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
              entries: { select: { subjectId: true, seq1Score: true, seq2Score: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.subject.count({ where: { schoolId, classLevel: String(classLevel) } }),
      prisma.teacherSubject.findMany({
        where: { userId: req.user!.id, subject: { classLevel: String(classLevel) } },
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
        } : null,
      }
    })

    res.json({ students: result, subjectCount })
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
    where: { id: reportCardId }, select: { student: { select: { classLevel: true } } },
  })
  if (!rc) return false
  const [classSubjects, entries] = await Promise.all([
    prisma.subject.findMany({ where: { schoolId, classLevel: rc.student.classLevel }, select: { id: true, compulsory: true } }),
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

    if (!(await offeredSubjectsAllMarked(schoolId, id))) {
      res.status(400).json({ message: "Enter marks for all of the student's subjects before writing the general remark." })
      return
    }

    const role = req.user!.role
    const userId = req.user!.id
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

    // Check if class has a master (for attribution only — remarks are now
    // required for every class regardless)
    const classMaster = await prisma.user.findFirst({
      where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: classLevel, isActive: true }
    })
    const requiresRemarks = true

    // Get all students in this class
    const students = await prisma.student.findMany({
      where: { schoolId, classLevel, isActive: true },
      select: { id: true, name: true }
    })

    // Get all subjects for this class
    const subjects = await prisma.subject.findMany({
      where: { schoolId, classLevel },
      select: { id: true, name: true }
    })

    // A class with no subjects cannot be published
    if (subjects.length === 0) {
      res.json({ published: 0, skipped: students.length, issues: [{ student: '—', reason: 'This class has no subjects — add subjects before publishing' }] })
      return
    }

    // Get all report cards for this class + term
    const reportCards = await prisma.reportCard.findMany({
      where: { schoolId, termId, student: { classLevel }, status: { not: 'PUBLISHED' } },
      include: { entries: true, student: { select: { id: true, name: true } } }
    })

    const issues: { student: string; reason: string }[] = []
    const eligibleIds: string[] = []

    for (const student of students) {
      const rc = reportCards.find(r => r.student.id === student.id)

      if (!rc) {
        issues.push({ student: student.name, reason: 'No report card found for this term' })
        continue
      }

      // Check both sequences filled for every subject
      const missingSubjects: string[] = []
      for (const subject of subjects) {
        const entry = rc.entries.find(e => e.subjectId === subject.id)
        if (!entry || entry.seq1Score == null || entry.seq2Score == null) {
          missingSubjects.push(subject.name)
        }
      }
      if (missingSubjects.length > 0) {
        issues.push({ student: student.name, reason: `Missing sequences for: ${missingSubjects.slice(0, 3).join(', ')}${missingSubjects.length > 3 ? '…' : ''}` })
        continue
      }

      // Check general remarks (required for every class)
      if (requiresRemarks && !rc.remarks?.trim()) {
        issues.push({ student: student.name, reason: 'No general remarks yet' })
        continue
      }

      eligibleIds.push(rc.id)
    }

    if (eligibleIds.length === 0) {
      res.json({ published: 0, skipped: issues.length, issues })
      return
    }

    await prisma.reportCard.updateMany({
      where: { id: { in: eligibleIds } },
      data: { status: 'PUBLISHED' }
    })

    res.json({ published: eligibleIds.length, skipped: issues.length, issues })
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

    const [students, subjects, reportCards] = await Promise.all([
      prisma.student.findMany({ where: { schoolId, isActive: true }, select: { id: true, name: true, classLevel: true } }),
      prisma.subject.findMany({ where: { schoolId }, select: { id: true, classLevel: true } }),
      prisma.reportCard.findMany({
        where: { schoolId, termId },
        select: { id: true, status: true, remarks: true, student: { select: { id: true, classLevel: true } }, entries: { select: { subjectId: true, seq1Score: true, seq2Score: true } }
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

        // Check both sequences for every subject
        for (const subject of classSubjects) {
          const entry = rc.entries.find(e => e.subjectId === subject.id)
          if (!entry || entry.seq1Score == null || entry.seq2Score == null) {
            missingSeqs++
            break // count once per student
          }
        }

        if (requiresRemarks && !rc.remarks?.trim()) missingRemarks++
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
      },
    })
    if (!rc) { res.status(404).json({ message: 'Not found' }); return }

    const classLevel = rc.student.classLevel

    const [subjects, teacherSubjects, classMaster] = await Promise.all([
      prisma.subject.findMany({ where: { schoolId, classLevel }, select: { id: true, name: true } }),
      prisma.teacherSubject.findMany({
        where: { subject: { schoolId, classLevel } },
        include: { user: { select: { id: true, name: true } }, subject: { select: { id: true } } },
      }),
      prisma.user.findFirst({
        where: { schoolId, role: 'CLASS_MASTER', masterClassLevel: classLevel, isActive: true },
        select: { id: true, name: true },
      }),
    ])

    const missingSubjects = subjects
      .filter(s => {
        const entry = rc.entries.find(e => e.subjectId === s.id)
        return !entry || entry.seq1Score == null || entry.seq2Score == null
      })
      .map(s => {
        const assignment = teacherSubjects.find(ts => ts.subject.id === s.id)
        return {
          subjectId: s.id,
          subjectName: s.name,
          teacher: assignment ? { id: assignment.user.id, name: assignment.user.name } : null,
        }
      })

    const remarksOk = !!rc.remarks?.trim()
    res.json({
      missingSubjects,
      classMaster,
      // Remarks required for every class — attribute to the master if there is
      // one, otherwise to admin / vice-principal.
      missingRemarks: !remarksOk ? (classMaster ?? { id: '', name: 'Admin / Vice-Principal' }) : null,
      allSeqsFilled: missingSubjects.length === 0,
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

import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { currentSession } from './fees.controller'
import { computeCoverage, resolveScopeTerms, DayOfWeek } from '../utils/teachingHours'

// Falls back to the most recently created session when no term is currently active —
// same situation fees.controller's currentSession already leaves null; a school between
// academic years should still be able to look back at how the year that just ended went.
async function resolveSession(schoolId: string, requested?: string): Promise<string | null> {
  if (requested) return requested
  const current = await currentSession(schoolId)
  if (current) return current
  const latest = await prisma.term.findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' }, select: { session: true } })
  return latest?.session ?? null
}

interface CoverageRow {
  teacherId: string
  teacherName: string
  subjectId: string
  subjectName: string
  classLevel: string
  term: string | null
  requiredHours: number | null
  scheduledHours: number
  taughtHours: number
  projectedFinalHours: number
  status: string
  isFinal: boolean
}

// Shared by both the admin-wide report and a teacher's own view — one (teacher, subject)
// pair is one row, since the hours actually taught depend on THAT teacher's timetable.
async function buildCoverageRows(schoolId: string, session: string, teacherId?: string): Promise<CoverageRow[]> {
  const [terms, teacherSubjects] = await Promise.all([
    prisma.term.findMany({ where: { schoolId, session } }),
    prisma.teacherSubject.findMany({
      where: { subject: { schoolId, requiredHours: { not: null } }, ...(teacherId ? { userId: teacherId } : {}) },
      include: { subject: true, user: { select: { id: true, name: true } } },
    }),
  ])
  if (teacherSubjects.length === 0) return []

  const teacherIds = [...new Set(teacherSubjects.map((ts) => ts.userId))]
  const subjectIds = [...new Set(teacherSubjects.map((ts) => ts.subjectId))]

  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId, teacherId: { in: teacherIds }, subjectId: { in: subjectIds } },
  })
  const slotIds = slots.map((s) => s.id)
  const absences = await prisma.teacherAbsence.findMany({
    where: { schoolId, timetableSlotId: { in: slotIds } },
    select: { teacherId: true, timetableSlotId: true, date: true },
  })

  const asOfDate = new Date()
  return teacherSubjects.map((ts) => {
    const subject = ts.subject
    const teacherSlots = slots.filter((s) => s.teacherId === ts.userId && s.subjectId === subject.id)
    const scopeTerms = resolveScopeTerms(subject, terms)
    const teacherAbsences = absences.filter((a) => a.teacherId === ts.userId && teacherSlots.some((s) => s.id === a.timetableSlotId))

    const result = computeCoverage({
      requiredHours: subject.requiredHours,
      slots: teacherSlots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek as DayOfWeek, startTime: s.startTime, endTime: s.endTime })),
      terms: scopeTerms,
      absences: teacherAbsences,
      asOfDate,
    })

    return {
      teacherId: ts.userId,
      teacherName: ts.user.name,
      subjectId: subject.id,
      subjectName: subject.name,
      classLevel: subject.classLevel,
      term: subject.term,
      requiredHours: result.requiredHours,
      scheduledHours: result.scheduledHours,
      taughtHours: result.taughtHours,
      projectedFinalHours: result.projectedFinalHours,
      status: result.status,
      isFinal: result.isFinal,
    }
  })
}

export const getMyCoverage = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const session = await resolveSession(schoolId, req.query.session ? String(req.query.session) : undefined)
    if (!session) { res.json({ session: null, rows: [] }); return }
    res.json({ session, rows: await buildCoverageRows(schoolId, session, req.user!.id) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getCoverage = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const session = await resolveSession(schoolId, req.query.session ? String(req.query.session) : undefined)
    if (!session) { res.json({ session: null, rows: [] }); return }
    const teacherId = req.query.teacherId ? String(req.query.teacherId) : undefined
    res.json({ session, rows: await buildCoverageRows(schoolId, session, teacherId) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

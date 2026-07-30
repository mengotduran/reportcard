import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { currentSession } from './fees.controller'
import { computeCoverage, resolveScopeTerms, dateStringWithinRange, slotPeriods, DayOfWeek, ScopeTerm, DateRange } from '../utils/teachingHours'

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

// Far-future stand-in for "this is the latest period, no next one exists yet" — the
// current period stays open-ended upward so an absence recorded NOW still counts even
// when the term's configured endDate has already passed (schools routinely run a bit
// past the scheduled date, or set the endDate early). A fresh record only begins once
// the NEXT period's own start date arrives — that date becomes the new lower bound then,
// which is what actually separates one period's record from the next.
const FAR_FUTURE = new Date('9999-12-31')

type TermRow = { startDate: Date; endDate: Date; isCurrent: boolean; session: string }

// The cutoff date an absence stops counting toward `term`'s record: the day before the
// NEXT term (across ALL sessions) begins, or far-future if `term` is the latest one.
// Deliberately NOT `term.endDate` — see FAR_FUTURE above for why a possibly-stale
// endDate must not be the boundary.
function absenceCutoffForTerm(term: { startDate: Date }, allTerms: TermRow[]): Date {
  const laterStarts = allTerms
    .map((t) => t.startDate.getTime())
    .filter((ms) => ms > term.startDate.getTime())
  if (laterStarts.length === 0) return FAR_FUTURE
  return new Date(Math.min(...laterStarts) - 86400000) // day before the next term starts
}

// The boundary a teacher's absence RECORD resets at: a semester for a university, a whole
// academic year for primary/secondary. Once that period ends the record is kept (nothing
// is deleted), but it stops counting toward "current" — the next semester/year starts a
// fresh one, even for the same teacher. Used to scope both the admin's per-teacher
// absence counts and a teacher's own "how many periods have I missed" view.
/** Every school closure. Ranges may overlap; computeCoverage merges before subtracting. */
async function getSchoolHolidays(schoolId: string): Promise<DateRange[]> {
  return prisma.schoolHoliday.findMany({
    where: { schoolId },
    select: { startDate: true, endDate: true },
  })
}

export async function getCurrentPeriodRange(schoolId: string): Promise<{ start: Date; end: Date } | null> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
  const session = await resolveSession(schoolId)
  if (!session) return null
  const allTerms = await prisma.term.findMany({ where: { schoolId }, select: { startDate: true, endDate: true, isCurrent: true, session: true } })
  const sessionTerms = allTerms.filter((t) => t.session === session)
  if (sessionTerms.length === 0) return null

  if (school?.type === 'UNIVERSITY') {
    // A semester boundary — the currently active term, falling back to the latest one in
    // the session if none is explicitly marked current (e.g. between terms). Upper bound
    // runs open until the NEXT semester actually starts (see absenceCutoffForTerm).
    const current = sessionTerms.find((t) => t.isCurrent) ?? sessionTerms.reduce((latest, t) => t.endDate > latest.endDate ? t : latest, sessionTerms[0])
    return { start: current.startDate, end: absenceCutoffForTerm(current, allTerms) }
  }
  // Primary/secondary: the whole academic year — every term in the session, combined.
  // Upper bound runs open until the next academic year's first term starts.
  const start = sessionTerms.reduce((min, t) => t.startDate < min ? t.startDate : min, sessionTerms[0].startDate)
  const latestSessionTerm = sessionTerms.reduce((latest, t) => t.startDate > latest.startDate ? t : latest, sessionTerms[0])
  return { start, end: absenceCutoffForTerm(latestSessionTerm, allTerms) }
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
  // Periods missed for this course (a 2-period class counts as 2), falling back to a plain
  // event count when the school hasn't set a period length. See slotPeriods.
  periodsMissed: number
}

/** Each term narrowed to the part that falls inside the window, dropping those outside it. */
function clampTermsToWindow(terms: ScopeTerm[], window: { startDate: Date; endDate: Date }): ScopeTerm[] {
  return terms
    .map((t) => ({
      ...t,
      startDate: t.startDate > window.startDate ? t.startDate : window.startDate,
      endDate: t.endDate < window.endDate ? t.endDate : window.endDate,
    }))
    .filter((t) => t.startDate <= t.endDate)
}

// Shared by both the admin-wide report and a teacher's own view — one (teacher, subject)
// ASSIGNMENT is one row, since the hours actually taught depend on THAT teacher's timetable
// and on the window during which they held the course. A course handed over mid-term
// therefore produces two rows, one per teacher, splitting the hours at the handover date.
async function buildCoverageRows(schoolId: string, session: string, teacherId?: string): Promise<CoverageRow[]> {
  const [terms, allTerms, teacherSubjects, school] = await Promise.all([
    prisma.term.findMany({ where: { schoolId, session } }),
    // All terms (every session) — needed only to find each scope term's "next term start"
    // for the open-ended absence-count cutoff below.
    prisma.term.findMany({ where: { schoolId }, select: { startDate: true, endDate: true, isCurrent: true, session: true } }),
    prisma.teacherSubject.findMany({
      where: { subject: { schoolId, requiredHours: { not: null } }, ...(teacherId ? { userId: teacherId } : {}) },
      include: { subject: true, user: { select: { id: true, name: true } } },
    }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
  ])
  if (teacherSubjects.length === 0) return []
  const periodMinutes = school?.periodMinutes ?? null

  const teacherIds = [...new Set(teacherSubjects.map((ts) => ts.userId))]
  const subjectIds = [...new Set(teacherSubjects.map((ts) => ts.subjectId))]

  // Archived rows are INCLUDED here, deliberately. They used to be filtered out to stop
  // superseded timetable versions inflating the hours, but that also erased the hours of a
  // teacher whose slots were archived when their course changed hands — their row showed 0.
  // computeCoverage now bounds each slot by its own createdAt/archivedAt instead, so a
  // superseded version counts only up to the moment it was replaced and its successor only
  // from then on. The two halves add up to one timetable, and a departed teacher keeps what
  // they actually taught.
  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId, teacherId: { in: teacherIds }, subjectId: { in: subjectIds } },
  })
  const slotIds = slots.map((s) => s.id)
  const absences = await prisma.teacherAbsence.findMany({
    where: { schoolId, timetableSlotId: { in: slotIds } },
    // periodIndex matters to the hours math: a split double period is two rows that must
    // together subtract what the single row they replaced did.
    select: { teacherId: true, timetableSlotId: true, date: true, periodIndex: true },
  })

  const holidays = await getSchoolHolidays(schoolId)
  const asOfDate = new Date()
  return teacherSubjects.flatMap((ts) => {
    const subject = ts.subject
    // Which VERSION of the timetable counts for this assignment: the one that was live when
    // the window closed. For a teacher who still holds the course that is the current
    // timetable (archivedAt null); for one who handed it over it is the rows archived AT the
    // handover, which is exactly how takeCoursesFromOtherTeachers stamps them.
    //
    // Superseded versions — archived EARLIER, because the admin re-saved the timetable — are
    // excluded, which is what stops an old version being counted alongside its replacement.
    // Note this deliberately does NOT bound by the slot's createdAt: a timetable entered
    // halfway through a term still describes the whole term, and counting only from the day
    // it was typed in would rob teachers of hours they had already taught.
    const teacherSlots = slots.filter((s) =>
      s.teacherId === ts.userId && s.subjectId === subject.id &&
      (s.archivedAt == null || (ts.endedAt != null && s.archivedAt >= ts.endedAt))
    )
    // Clamped to the ASSIGNMENT WINDOW: hours only count while this teacher actually held the
    // course. A term that started before they took it contributes only from their start date,
    // and one still running after they gave it up contributes only up to the handover. A
    // teacher who left mid-term keeps exactly what they taught; their successor's own row
    // picks up from the same date, so nothing is double-counted and nothing is lost.
    const held = { startDate: ts.startedAt, endDate: ts.endedAt ?? FAR_FUTURE }
    const scopeTerms = clampTermsToWindow(resolveScopeTerms(subject, terms), held)
    // Entirely outside the window (a course ended before this term began) contributes nothing.
    if (scopeTerms.length === 0) return []
    const teacherCourseAbsences = absences.filter((a) => a.teacherId === ts.userId && teacherSlots.some((s) => s.id === a.timetableSlotId))

    // For the HOURS math: strictly within the scope term's real start/end. The date check
    // is itself the earlier fix — TimetableSlot rows persist unchanged across academic-year
    // rollover (nothing recreates them at "Start New Year"), so an absence from a PRIOR
    // session referencing a still-reused slot would otherwise subtract hours here too.
    // Kept term-bounded because scheduled-hours counting relies on a real bounded endDate.
    const teacherAbsences = teacherCourseAbsences.filter((a) =>
      scopeTerms.some((term) => dateStringWithinRange(a.date, term.startDate, term.endDate))
    )

    // For the COUNT badge: PERIODS missed (a 2-period class = 2), using the open-ended
    // cutoff (next-term-start) so it stays consistent with the "By Teacher" view when a
    // term's configured endDate is stale and the school is still recording absences past
    // it. Does NOT feed the hours math above.
    const periodsMissed = teacherCourseAbsences
      .filter((a) => scopeTerms.some((term) => dateStringWithinRange(a.date, term.startDate, absenceCutoffForTerm(term, allTerms))))
      .reduce((sum, a) => {
        // One period per per-period row; only a legacy whole-slot row expands.
        if (a.periodIndex != null) return sum + 1
        const slot = teacherSlots.find((s) => s.id === a.timetableSlotId)
        return sum + (slot ? (slotPeriods(slot.startTime, slot.endTime, periodMinutes) ?? 1) : 1)
      }, 0)

    const result = computeCoverage({
      requiredHours: subject.requiredHours,
      slots: teacherSlots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek as DayOfWeek, startTime: s.startTime, endTime: s.endTime })),
      terms: scopeTerms,
      absences: teacherAbsences,
      asOfDate,
      periodMinutes,
      holidays,
    })

    return [{
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
      periodsMissed,
    }]
  })
}

export const getMyCoverage = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const session = await resolveSession(schoolId, req.query.session ? String(req.query.session) : undefined)
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } })
    if (!session) { res.json({ session: null, rows: [], periodMinutes: school?.periodMinutes ?? null }); return }
    res.json({ session, rows: await buildCoverageRows(schoolId, session, req.user!.id), periodMinutes: school?.periodMinutes ?? null })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getCoverage = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const session = await resolveSession(schoolId, req.query.session ? String(req.query.session) : undefined)
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } })
    if (!session) { res.json({ session: null, rows: [], periodMinutes: school?.periodMinutes ?? null }); return }
    const teacherId = req.query.teacherId ? String(req.query.teacherId) : undefined
    const rows = await buildCoverageRows(schoolId, session, teacherId)
    // A coverage row is a (teacher, subject) pair, so a course with an hours target but no
    // lecturer assigned produces nothing at all. That is indistinguishable, from the
    // client's side, from having set no target anywhere — and the empty state used to
    // tell the admin to go and set a target they had already set. Name the real gap.
    const unassignedTargets = rows.length === 0
      ? await prisma.subject.findMany({
          where: { schoolId, requiredHours: { not: null }, teacherSubjects: { none: {} } },
          select: { name: true, classLevel: true },
          orderBy: [{ classLevel: 'asc' }, { name: 'asc' }],
        })
      : []
    res.json({ session, rows, periodMinutes: school?.periodMinutes ?? null, unassignedTargets })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export interface TeacherHoursTotal {
  teacherId: string
  teacherName: string
  scheduledHours: number
  taughtHours: number
  projectedFinalHours: number
  isFinal: boolean
}

// Every teacher's OWN total hours — every active timetable slot they have, school-subject
// periods AND private/extra classes alike, added together. Unlike buildCoverageRows this
// isn't gated on a subject having a requiredHours target (a private slot has no subject
// at all to hang a target off), so it's a plain hours-worked total, not a coverage
// status. Scoped to the current period (semester for university, academic year for
// primary/secondary) — same reset rule as the absence counts this sits alongside on the
// "By Teacher" view.
async function buildTeacherHoursTotals(schoolId: string): Promise<TeacherHoursTotal[]> {
  const range = await getCurrentPeriodRange(schoolId)
  if (!range) return []
  // The REAL term rows inside the current period, not one span from the first term's start
  // to the last term's end. Collapsing them counted the breaks BETWEEN terms as teaching
  // weeks — a primary/secondary school was credited with hours over the December and April
  // holidays. University is one term anyway, so only the multi-term types change.
  const session = await resolveSession(schoolId)
  const scopeTerms: ScopeTerm[] = (await prisma.term.findMany({
    where: { schoolId, ...(session ? { session } : {}) },
    select: { id: true, name: true, startDate: true, endDate: true },
  })).filter((t) => t.startDate <= range.end && t.endDate >= range.start)
  if (scopeTerms.length === 0) return []
  const holidays = await getSchoolHolidays(schoolId)

  const [slots, school] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { schoolId, archivedAt: null },
      include: { teacher: { select: { id: true, name: true } } },
    }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
  ])
  if (slots.length === 0) return []
  const periodMinutes = school?.periodMinutes ?? null

  const slotIds = slots.map((s) => s.id)
  const absences = await prisma.teacherAbsence.findMany({
    where: { schoolId, timetableSlotId: { in: slotIds } },
    // periodIndex matters to the hours math: a split double period is two rows that must
    // together subtract what the single row they replaced did.
    select: { teacherId: true, timetableSlotId: true, date: true, periodIndex: true },
  })

  const byTeacher = new Map<string, { teacherName: string; slots: typeof slots }>()
  for (const s of slots) {
    const cur = byTeacher.get(s.teacherId) ?? { teacherName: s.teacher.name, slots: [] }
    cur.slots.push(s)
    byTeacher.set(s.teacherId, cur)
  }

  const asOfDate = new Date()
  return [...byTeacher.entries()].map(([teacherId, { teacherName, slots: teacherSlots }]) => {
    const teacherAbsences = absences.filter((a) => a.teacherId === teacherId)
    const result = computeCoverage({
      requiredHours: null,
      slots: teacherSlots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek as DayOfWeek, startTime: s.startTime, endTime: s.endTime, specificDate: s.specificDate })),
      terms: scopeTerms,
      absences: teacherAbsences,
      asOfDate,
      periodMinutes,
      holidays,
    })
    return {
      teacherId, teacherName,
      scheduledHours: result.scheduledHours,
      taughtHours: result.taughtHours,
      projectedFinalHours: result.projectedFinalHours,
      isFinal: result.isFinal,
    }
  })
}

export const getTeacherHoursTotals = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    res.json({ totals: await buildTeacherHoursTotals(schoolId) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

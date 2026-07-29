import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import {
  dateStringToDayOfWeek, slotHasPassed, slotPeriods, periodWindows, absenceIsFinal, PeriodWindow,
} from '../utils/teachingHours'
import { getCurrentPeriodRange } from './coverage.controller'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The exact period an absence row refers to.
 *
 * A row with a `periodIndex` names one period inside the slot, so it reports that period's
 * own start and end rather than the whole block's. A legacy row (null index, written before
 * absences became per-period) still stands for the entire slot.
 */
function windowForAbsence(
  periodIndex: number | null,
  slot: { startTime: string; endTime: string },
  periodMinutes: number | null,
): { window: PeriodWindow; periods: number | null } {
  if (periodIndex == null) {
    return {
      window: { index: 0, startTime: slot.startTime, endTime: slot.endTime },
      periods: slotPeriods(slot.startTime, slot.endTime, periodMinutes),
    }
  }
  const windows = periodWindows(slot.startTime, slot.endTime, periodMinutes)
  const window = windows[periodIndex] ?? windows[windows.length - 1]
  // One row, one period — the block's total no longer applies once it's been split.
  return { window, periods: 1 }
}

function shapeAbsence<T extends { date: string; seenByAdmin: boolean; periodIndex: number | null; slot: { dayOfWeek: string; startTime: string; endTime: string; subject: { name: string; classLevel: string } | null } }>(
  { slot, ...a }: T,
  periodMinutes: number | null,
  graceMinutes: number | null,
) {
  const { window, periods } = windowForAbsence(a.periodIndex, slot, periodMinutes)
  return {
    ...a,
    dayOfWeek: slot.dayOfWeek,
    startTime: window.startTime,
    endTime: window.endTime,
    subjectName: slot.subject?.name ?? null,
    classLevel: slot.subject?.classLevel ?? null,
    // Past this point the record is final and nobody can mark the teacher present again:
    // start + the school's grace period, or the period's end when no grace is configured.
    // Both clients use it to decide whether to offer a delete button at all — the DELETE
    // endpoint is the real gate either way.
    isFinal: absenceIsFinal(a.date, window, graceMinutes),
    // How many periods this row is worth: 1 for a per-period row, the whole block for a
    // legacy one. null if the school hasn't set a period length yet, so clients fall back
    // to counting events.
    periods,
  }
}

// One day of a report: whole-day, or a specific set of that day's periods.
type DayRequest = { date: string; wholeDay: boolean; timetableSlotIds: string[] }

// Accepts either a single day (the original { date, wholeDay, timetableSlotIds } body,
// which the web forms still send) or a `days` array for a multi-day report. Reporting a
// fortnight off is one request, not fourteen — which also keeps it to ONE notification per
// admin instead of burying their inbox under a notification per day.
function parseDayRequests(body: any): DayRequest[] {
  const raw = Array.isArray(body?.days) ? body.days : [body]
  const byDate = new Map<string, DayRequest>()
  for (const d of raw) {
    const date = String(d?.date ?? '')
    const wholeDay = Boolean(d?.wholeDay)
    const timetableSlotIds: string[] = Array.isArray(d?.timetableSlotIds) ? d.timetableSlotIds.map(String) : []
    // Last one wins if a client somehow sends the same date twice, so the same day can
    // never be counted from two conflicting entries.
    byDate.set(date, { date, wholeDay, timetableSlotIds })
  }
  return [...byDate.values()]
}

// Whole-day vs specific-period(s) are the same underlying record — one row per missed
// slot — so this is the only creation path either UI needs. A teacher reports their own
// absence (teacherId is never taken from the body for them); an admin can log it on a
// teacher's behalf, e.g. after being told about it some other way.
export const createAbsence = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const isAdmin = ADMIN_ROLES.includes(req.user!.role)
    const teacherId = isAdmin && req.body.teacherId ? String(req.body.teacherId) : req.user!.id
    const days = parseDayRequests(req.body)

    if (days.length === 0) {
      res.status(400).json({ message: 'Select at least one day' })
      return
    }
    for (const d of days) {
      if (!DATE_RE.test(d.date)) {
        res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' })
        return
      }
      if (!d.wholeDay && d.timetableSlotIds.length === 0) {
        res.status(400).json({ message: 'Select the whole day or at least one period' })
        return
      }
    }

    const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    // Every weekday the report touches, fetched once rather than per day — a month-long
    // report hits the same handful of weekdays over and over.
    const daysOfWeek = [...new Set(days.map((d) => dateStringToDayOfWeek(d.date)))]
    const [allSlots, school] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { schoolId, teacherId, dayOfWeek: { in: daysOfWeek }, subjectId: { not: null } },
        include: { subject: { select: { name: true } } },
      }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
    ])
    const periodMinutes = school?.periodMinutes ?? null

    // Absences already on record for these dates. Two reasons: a legacy whole-slot row
    // (null periodIndex) must NOT gain per-period siblings, which would count the same
    // class twice; and re-reporting is otherwise silently swallowed by the unique index.
    const existing = await prisma.teacherAbsence.findMany({
      where: { schoolId, teacherId, date: { in: days.map((d) => d.date) } },
      select: { timetableSlotId: true, date: true, periodIndex: true },
    })
    const legacyWholeSlot = new Set(
      existing.filter((e) => e.periodIndex == null).map((e) => `${e.date}|${e.timetableSlotId}`),
    )

    type Marked = { date: string; slot: (typeof allSlots)[number]; window: PeriodWindow }
    const toMark: Marked[] = []

    for (const d of days) {
      const daySlots = allSlots.filter((s) => s.dayOfWeek === dateStringToDayOfWeek(d.date))
      const slotsToMark = d.wholeDay ? daySlots : daySlots.filter((s) => d.timetableSlotIds.includes(s.id))

      // Nobody — teacher OR admin — can report an absence for a period that has already
      // ENDED. An absence is a statement about a class that is still to happen; once it's
      // over there's nothing left to report, and backdating one silently rewrites hours
      // already counted as taught. Note this is the period's END, not the grace cutoff:
      // the grace period governs when a record becomes FINAL, deliberately not when one
      // can still be filed, so a teacher taken ill mid-morning can still report that class.
      //
      // "Whole day" quietly drops any already-elapsed period and reports the rest, so
      // reporting absent partway through a day still works. Explicitly-picked slots are
      // rejected outright if one has wholly passed, since those exact ones were chosen —
      // and the date is named, because in a multi-day report it is not obvious which day
      // is the problem. Reachable when a long report is filled in slowly and a period
      // ticked at the start has elapsed by the time it is submitted.
      if (!d.wholeDay && slotsToMark.some((s) => slotHasPassed(d.date, s.endTime))) {
        res.status(400).json({ message: `One or more of the periods selected for ${d.date} has already passed and can no longer be reported` })
        return
      }

      for (const slot of slotsToMark) {
        if (legacyWholeSlot.has(`${d.date}|${slot.id}`)) continue
        // One row per period, so a double period can later be half-cancelled: the teacher
        // who turns up twenty minutes late keeps the second period.
        for (const window of periodWindows(slot.startTime, slot.endTime, periodMinutes)) {
          if (slotHasPassed(d.date, window.endTime)) continue
          toMark.push({ date: d.date, slot, window })
        }
      }
    }

    // A single day that yields nothing is still an error, but in a multi-day report the
    // days that yield nothing (today's classes are over, a chosen day has no class) are
    // simply skipped — only a report that comes to nothing at all fails.
    if (toMark.length === 0) {
      res.status(400).json({
        message: days.length === 1 && days[0].wholeDay
          ? 'All periods for this day have already passed and can no longer be reported'
          : 'No reportable periods on the selected day(s) for this teacher',
      })
      return
    }

    // Already-reported periods are skipped by the unique index rather than erroring, so
    // this is the count of what was ACTUALLY newly recorded — re-submitting a day that was
    // already filed now correctly reports 0 rather than claiming to have recorded it twice.
    const { count: created } = await prisma.teacherAbsence.createMany({
      data: toMark.map(({ date, slot, window }) => ({
        schoolId, teacherId, timetableSlotId: slot.id, date, periodIndex: window.index,
        recordedById: req.user!.id,
      })),
      skipDuplicates: true,
    })

    if (created === 0) {
      res.status(200).json({ message: 'Those periods were already reported', count: 0, days: 0 })
      return
    }

    const markedDates = [...new Set(toMark.map((m) => m.date))].sort()
    const subjectNames = [...new Set(toMark.map((m) => m.slot.subject?.name).filter((n): n is string => !!n))]
    const periodWord = toMark.length === 1 ? 'period' : 'periods'
    // Multi-day reports describe the SPAN; a single day keeps the original wording so the
    // common case reads exactly as it did before.
    const multiDay = markedDates.length > 1
    const singleWholeDay = days.length === 1 && days[0].wholeDay
    // What the absence covers, as one phrase both notification bodies drop into. Subject
    // names are only useful while the list is short — across a fortnight it would be every
    // course the teacher owns, so the span replaces them.
    const scope = markedDates.length > 1
      ? `${toMark.length} ${periodWord} across ${markedDates.length} days (${markedDates[0]} to ${markedDates[markedDates.length - 1]})`
      : singleWholeDay
        ? `the whole day on ${markedDates[0]}`
        : `${toMark.length} ${periodWord} on ${markedDates[0]}${subjectNames.length ? ` (${subjectNames.join(', ')})` : ''}`

    if (!isAdmin) {
      // Admins get an in-app notification when a teacher reports their OWN absence.
      const admins = await prisma.user.findMany({
        where: { schoolId, isActive: true, role: { in: ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'] } },
        select: { id: true },
      })
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            schoolId, recipientId: a.id, type: 'TEACHER_ABSENCE',
            title: 'Teacher absence reported', body: `${teacher.name} reported absent for ${scope}.`,
          })),
        })
      }
    } else {
      // An admin logged it on the teacher's behalf (they didn't report it themselves) —
      // the teacher would otherwise have no way of knowing it's on record at all.
      await prisma.notification.create({
        data: {
          schoolId, recipientId: teacherId, type: 'TEACHER_ABSENCE_LOGGED_BY_ADMIN',
          title: 'Absence recorded', body: `An admin recorded you as absent for ${scope}.`,
        },
      })
    }

    res.status(201).json({ message: 'Absence recorded', count: created, days: markedDates.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteAbsence = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const isAdmin = ADMIN_ROLES.includes(req.user!.role)

    const absence = await prisma.teacherAbsence.findFirst({
      where: { id, schoolId },
      include: { teacher: { select: { name: true } }, slot: { include: { subject: { select: { name: true } } } } },
    })
    if (!absence) { res.status(404).json({ message: 'Absence not found' }); return }
    if (!isAdmin && absence.teacherId !== req.user!.id) {
      res.status(403).json({ message: 'You do not have permission to perform this action' })
      return
    }
    // Once an admin has reviewed it (a past visit to the per-teacher list — see
    // getTeacherAbsences), it's locked history for the TEACHER — they can no longer
    // retract their own report. Admins can still remove it any time up until the period
    // itself has actually happened (see the slotHasPassed check below) — e.g. the teacher
    // ends up actually showing up after all — and the teacher gets notified either way.
    if (!isAdmin && absence.seenByAdmin) {
      res.status(403).json({ message: 'This absence has already been reviewed by an admin and can no longer be removed' })
      return
    }
    // Nobody — teacher or admin — can remove an absence once THAT PERIOD is final. Final
    // means start + the school's grace period ("how late can a teacher turn up and still
    // count as having taught it"), or the period's end when no grace is configured. Up to
    // that moment there's still a real possibility the teacher shows up after all, which is
    // exactly the window an admin needs to mark them present again; past it the record
    // stands. Because each period is judged on its own window, cancelling one period of a
    // double period leaves the other alone.
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { periodMinutes: true, absenceGraceMinutes: true },
    })
    const { window } = windowForAbsence(absence.periodIndex, absence.slot, school?.periodMinutes ?? null)
    if (absenceIsFinal(absence.date, window, school?.absenceGraceMinutes ?? null)) {
      res.status(403).json({
        message: school?.absenceGraceMinutes != null
          ? `This period was missed more than ${school.absenceGraceMinutes} minutes ago and can no longer be changed`
          : 'This period has already passed and can no longer be removed',
      })
      return
    }

    await prisma.teacherAbsence.delete({ where: { id } })

    if (!isAdmin) {
      // Mirrors createAbsence's notification — the TEACHER retracted their own report,
      // so admins see the reversal, not just the original "reported absent" that's no
      // longer true.
      const admins = await prisma.user.findMany({
        where: { schoolId, isActive: true, role: { in: ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'] } },
        select: { id: true },
      })
      if (admins.length > 0) {
        const subjectName = absence.slot.subject?.name
        const body = `${absence.teacher.name} is no longer absent — retracted their report for ${absence.date}${subjectName ? ` (${subjectName})` : ''}.`
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            schoolId, recipientId: a.id, type: 'TEACHER_ABSENCE_RETRACTED',
            title: 'Absence report retracted', body,
          })),
        })
      }
    } else {
      // An ADMIN removed it instead — e.g. deciding to mark the teacher present after
      // all. The teacher would otherwise have no way of knowing their report vanished.
      const subjectName = absence.slot.subject?.name
      const body = `An admin removed your absence report for ${absence.date}${subjectName ? ` (${subjectName})` : ''} — you're now marked present for that period.`
      await prisma.notification.create({
        data: {
          schoolId, recipientId: absence.teacherId, type: 'TEACHER_ABSENCE_REMOVED_BY_ADMIN',
          title: 'Absence report removed', body,
        },
      })
    }

    res.json({ message: 'Absence removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Defaults to the CURRENT period (semester for university, academic year for
// primary/secondary) when no explicit from/to is given — matching the rule that a new
// semester/year is a fresh record even for the same teacher. Older absences are kept in
// the database, never deleted, they just age out of the default view once their period
// ends; an explicit from/to still overrides this for anyone that ever needs older records.
async function listAbsences(schoolId: string, teacherId: string, from?: string, to?: string) {
  // Always resolved, even when an explicit from/to overrides the default scoping, because
  // clients also need it as the far edge of how far AHEAD an absence may be booked: an
  // absence dated past this cutoff belongs to the next semester/year's record and would
  // vanish from this very list the moment it was created.
  const range = await getCurrentPeriodRange(schoolId)
  const periodEnd = range ? range.end.toISOString().slice(0, 10) : null
  let effectiveFrom = from
  let effectiveTo = to
  if (!from && !to && range) {
    effectiveFrom = range.start.toISOString().slice(0, 10)
    effectiveTo = periodEnd ?? undefined
  }
  const [absences, school] = await Promise.all([
    prisma.teacherAbsence.findMany({
      where: {
        schoolId, teacherId,
        ...(effectiveFrom ? { date: { gte: effectiveFrom } } : {}),
        ...(effectiveTo ? { date: { lte: effectiveTo } } : {}),
      },
      include: { slot: { include: { subject: { select: { name: true, classLevel: true } } } } },
      // Within a day, earliest period first, so a split double period reads in order.
      orderBy: [{ date: 'desc' }, { periodIndex: 'asc' }],
    }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true, absenceGraceMinutes: true } }),
  ])
  const periodMinutes = school?.periodMinutes ?? null
  const shaped = absences.map((a) => shapeAbsence(a, periodMinutes, school?.absenceGraceMinutes ?? null))
  // Total periods missed: 1 per per-period row, the whole block for a legacy one. Falls
  // back to the plain event count when no period length is set yet.
  const periodsMissed = shaped.reduce((sum, a) => sum + (a.periods ?? 1), 0)
  return { absences: shaped, periodMinutes, periodsMissed, periodEnd }
}

export const getMyAbsences = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const from = req.query.from ? String(req.query.from) : undefined
    const to = req.query.to ? String(req.query.to) : undefined
    const { absences, periodMinutes, periodsMissed, periodEnd } = await listAbsences(schoolId, req.user!.id, from, to)
    res.json({ absences, periodMinutes, periodsMissed, periodEnd })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Admin-only, for the "By Teacher" browsing list — every teacher's absence total in one
// query, decoupled from coverage/required-hours entirely (a teacher's absences for a
// course with no hours target set still count here, even though they'd never appear in
// a coverage row). One groupBy rather than N getTeacherAbsences calls for N teachers.
// Scoped to the CURRENT period (semester for university, academic year for
// primary/secondary) — same reset rule as listAbsences above.
export const getAbsenceCounts = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const range = await getCurrentPeriodRange(schoolId)
    // Sum PERIODS per teacher (a 2-period class = 2), not just event rows — so this can't
    // be a plain groupBy count; each row's slot duration has to be turned into periods.
    const [absences, school] = await Promise.all([
      prisma.teacherAbsence.findMany({
        where: {
          schoolId,
          ...(range ? { date: { gte: range.start.toISOString().slice(0, 10), lte: range.end.toISOString().slice(0, 10) } } : {}),
        },
        select: { teacherId: true, periodIndex: true, slot: { select: { startTime: true, endTime: true } } },
      }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
    ])
    const periodMinutes = school?.periodMinutes ?? null
    const byTeacher = new Map<string, { count: number; periods: number }>()
    for (const a of absences) {
      const cur = byTeacher.get(a.teacherId) ?? { count: 0, periods: 0 }
      cur.count += 1
      // A per-period row is worth exactly one period; only a legacy whole-slot row still
      // has to be converted from its duration.
      cur.periods += a.periodIndex != null ? 1 : (slotPeriods(a.slot.startTime, a.slot.endTime, periodMinutes) ?? 1)
      byTeacher.set(a.teacherId, cur)
    }
    res.json({
      counts: [...byTeacher].map(([teacherId, v]) => ({ teacherId, count: v.count, periods: v.periods })),
      periodMinutes,
      // Also the far edge for booking an absence ahead — see listAbsences. Served from here
      // so the admin's report-on-behalf form can get it without calling getTeacherAbsences,
      // which would mark that teacher's records as reviewed as a side effect.
      periodEnd: range ? range.end.toISOString().slice(0, 10) : null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getTeacherAbsences = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teacherId = String(req.query.teacherId ?? '')
    if (!teacherId) { res.status(400).json({ message: 'teacherId is required' }); return }
    const from = req.query.from ? String(req.query.from) : undefined
    const to = req.query.to ? String(req.query.to) : undefined

    const { absences: shaped, periodMinutes, periodsMissed, periodEnd } = await listAbsences(schoolId, teacherId, from, to)

    // Mark seen for the NEXT time this list is fetched — deliberately not before building
    // the response above, so the admin's CURRENT visit still shows these as deletable
    // (their real chance to act, e.g. remove one to mark the teacher present after all).
    // Only a later visit will show seenByAdmin: true and refuse the delete.
    const unseenIds = shaped.filter((a) => !a.seenByAdmin).map((a) => a.id)
    if (unseenIds.length > 0) {
      await prisma.teacherAbsence.updateMany({ where: { id: { in: unseenIds } }, data: { seenByAdmin: true } })
    }

    res.json({ absences: shaped, periodMinutes, periodsMissed, periodEnd })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

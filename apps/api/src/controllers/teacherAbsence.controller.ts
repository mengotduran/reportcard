import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import {
  dateStringToDayOfWeek, slotHasPassed, slotPeriods, periodWindows, graceHasExpired, periodHasEnded, PeriodWindow, slotRunsOn,
} from '../utils/teachingHours'
import { getCurrentPeriodRange } from './coverage.controller'
import { NotificationLink } from '../utils/notificationLink'
import { emitToUser, emitToUsers, emitToSchool } from '../config/socket'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The exact period an absence row refers to.
 *
 * A row with a `periodIndex` names one period inside the slot, so it reports that period's
 * own start and end rather than the whole block's. A legacy row (null index, written before
 * absences became per-period) still stands for the entire slot.
 */
/**
 * What to call a slot in a list or a notification.
 *
 * A private class has no subject, only a free-text label — reading `subject.name` for it gave
 * every list a blank name (mobile literally rendered "undefined (undefined)").
 */
function slotDisplayName(slot: { subject?: { name: string } | null; label?: string | null }): string {
  return slot.subject?.name ?? slot.label ?? 'Private class'
}

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

function shapeAbsence<T extends { date: string; seenByAdmin: boolean; periodIndex: number | null; teacherId: string; recordedById: string; slot: { dayOfWeek: string; startTime: string; endTime: string; subjectId: string | null; label: string | null; subject: { name: string; classLevel: string } | null; privateSubject: { name: string; classLevel: string } | null } }>(
  { slot, ...a }: T,
  periodMinutes: number | null,
  graceMinutes: number | null,
) {
  const { window, periods } = windowForAbsence(a.periodIndex, slot, periodMinutes)
  // Times shown are this row's own period, so a double period still reads as two 50-minute
  // records. The GATES below are judged on the whole class instead, because deleting is atomic
  // per slot (see deleteAbsence) — judging them per window would grey out one half's button
  // while the endpoint happily cleared both.
  const classWindow: PeriodWindow = { index: 0, startTime: slot.startTime, endTime: slot.endTime }
  return {
    ...a,
    dayOfWeek: slot.dayOfWeek,
    startTime: window.startTime,
    endTime: window.endTime,
    // Falls back to the private class's label, so clients need no special case. A private
    // class linked to a course borrows that course's class for the secondary line.
    subjectName: slot.subject?.name ?? slot.label ?? null,
    classLevel: slot.subject?.classLevel ?? slot.privateSubject?.classLevel ?? null,
    /** True for a private/personal class, so clients can badge it as one. */
    isPrivate: slot.subjectId == null,
    // Two separate gates, because they apply to different people (see deleteAbsence):
    //   isFinal      the CLASS is over — nobody, admin included, can change it
    //   graceExpired the arrival window has closed — the teacher can no longer retract,
    //                and an admin who deletes it is warned the class was lost
    // Clients use these to grey the button and to word the confirmation; the DELETE
    // endpoint is the real gate either way.
    isFinal: periodHasEnded(a.date, classWindow),
    graceExpired: graceHasExpired(a.date, classWindow, graceMinutes),
    // Somebody other than the teacher filed this, which can only be an admin — createAbsence
    // forces teacherId to the caller for everyone else, so a teacher can never record against
    // another. It is NOT the teacher's report to retract: an admin logging an absence is
    // recording something they were told happened, and letting the subject of the record erase
    // it before an admin next opens the list would make the whole thing advisory. Independent
    // of seenByAdmin, which only ever locked the teacher out of retracting their OWN report and
    // starts false on a record the teacher never made. See deleteAbsence.
    recordedByAdmin: a.recordedById !== a.teacherId,
    // How many periods this row is worth: 1 for a per-period row, the whole block for a
    // legacy one. null if the school hasn't set a period length yet, so clients fall back
    // to counting events.
    periods,
  }
}

/**
 * Collapses the per-period rows of one class on one date into a SINGLE entry.
 *
 * Rows are stored per period because that is what keeps the hours arithmetic and the
 * "N periods missed" totals right. But nobody acts on a period: reporting and deleting are
 * both atomic per slot, so a 07:30-09:10 double shown as two rows with two delete buttons
 * invites you to remove "one" and then watch both disappear.
 *
 * The entry spans the whole class (earliest start to latest end) and carries the period count,
 * so it reads "07:30-09:10 with 2 periods" behind one button. Its `id` is one of the underlying
 * rows, which is all the DELETE endpoint needs — it clears every sibling anyway.
 */
function groupByClass<T extends {
  id: string; date: string; timetableSlotId: string; startTime: string; endTime: string
  seenByAdmin: boolean; periods: number | null; periodIndex: number | null; recordedByAdmin: boolean
}>(rows: T[]): T[] {
  const byClass = new Map<string, T[]>()
  for (const r of rows) {
    const key = `${r.date}|${r.timetableSlotId}`
    const list = byClass.get(key)
    if (list) list.push(r)
    else byClass.set(key, [r])
  }
  // Map preserves insertion order, so the caller's date/period ordering survives.
  return [...byClass.values()].map((group) => ({
    ...group[0],
    startTime: group.reduce((min, r) => (r.startTime < min ? r.startTime : min), group[0].startTime),
    endTime: group.reduce((max, r) => (r.endTime > max ? r.endTime : max), group[0].endTime),
    // Null only when the school has set no period length at all, in which case it stays null
    // and clients fall back to counting events.
    periods: group.every((r) => r.periods == null)
      ? null
      : group.reduce((sum, r) => sum + (r.periods ?? 1), 0),
    // Reviewed if ANY period of the class was: the lock is on the class, like everything else.
    seenByAdmin: group.some((r) => r.seenByAdmin),
    // Same rule, same reason: deleting clears every period of the class, so if an admin filed
    // any part of it the teacher cannot take the class down. Mixed authorship is only reachable
    // if a slot's period count changed between two reports, but the gate must match what the
    // endpoint actually deletes.
    recordedByAdmin: group.some((r) => r.recordedByAdmin),
    // The entry is the whole class, not one period inside it.
    periodIndex: null,
  }))
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
        // archivedAt: null is essential, not a refinement. Re-saving a teacher's timetable
        // archives the old rows rather than deleting them (absences already logged against
        // them must keep working), so without this a "whole day" report books the CURRENT
        // timetable plus every superseded version of it. One teacher with two archived
        // Thursday slots got 7 periods for a day that has 2.
        // No `subjectId: { not: null }` any more. That single filter was why a private class
        // could never be reported absent: it was never in the candidate set, so naming one
        // explicitly produced nothing and fell through to the "no reportable periods" 400.
        where: { schoolId, teacherId, dayOfWeek: { in: daysOfWeek }, archivedAt: null },
        include: {
          subject: { select: { name: true } },
          privateSubject: { select: { name: true, classLevel: true } },
        },
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
      // slotRunsOn, not a bare weekday match: a one-off private class runs on exactly one
      // date and a time-boxed one only inside its window. A weekday match alone offered
      // a single Saturday tutorial on every Saturday of the term.
      const daySlots = allSlots.filter((s) => slotRunsOn(s, d.date))
      const slotsToMark = d.wholeDay ? daySlots : daySlots.filter((s) => d.timetableSlotIds.includes(s.id))

      // Reporting is ATOMIC PER SLOT. The slot is the class the admin put on the timetable,
      // so it is also the smallest thing anyone can be absent from: a 07:30-09:10 block is
      // one class of two periods, and "I will miss it" cannot mean half of it. Counting stays
      // per period — one row per periodIndex below — which is what keeps the hours arithmetic
      // right and still lets an admin cancel one period of a double afterwards.
      //
      // The cutoff is therefore judged on the SLOT, not on each 50-minute window, and differs
      // by who is reporting:
      //   teacher  the slot's START. Once their class has begun, saying "I will be absent" is
      //            no longer a statement about a class still to come; whether it was taught is
      //            now a matter of record for the administration to settle.
      //   admin    the slot's END. They are often recording after the fact, having been told
      //            some other way, so they need the class itself.
      // Neither may report once the slot is over: backdating silently rewrites hours already
      // counted as taught.
      //
      // Judging per window was a real bug: at 08:00 a teacher's whole-day report on a
      // 07:30-09:10 double dropped the first period and booked only the second, leaving them
      // absent for half a class they cannot be half-absent from.
      const slotPastCutoff = (s: { startTime: string; endTime: string }) =>
        slotHasPassed(d.date, isAdmin ? s.endTime : s.startTime)

      // "Whole day" quietly skips slots past the cutoff and reports the rest, so reporting
      // absent partway through a day still works. Explicitly-picked slots are rejected
      // outright, since those exact ones were chosen — and the date is named, because in a
      // multi-day report it is not obvious which day is the problem.
      if (!d.wholeDay && slotsToMark.some(slotPastCutoff)) {
        res.status(400).json({
          message: isAdmin
            ? `One or more of the classes selected for ${d.date} has already ended and can no longer be reported`
            : `One or more of the classes selected for ${d.date} has already started and can no longer be reported. Ask an admin to record it.`,
        })
        return
      }

      for (const slot of slotsToMark) {
        if (legacyWholeSlot.has(`${d.date}|${slot.id}`)) continue
        if (slotPastCutoff(slot)) continue
        // Every period of the slot, all or nothing. One row each so the count and the hours
        // stay per period, and so an admin can later cancel just one of them.
        for (const window of periodWindows(slot.startTime, slot.endTime, periodMinutes)) {
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
          ? (isAdmin
              ? 'Every period for this day has already ended and can no longer be reported'
              : 'Every period for this day has already started and can no longer be reported. Ask an admin to record it.')
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
    const subjectNames = [...new Set(toMark.map((m) => slotDisplayName(m.slot)))]
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

    // Where the notification leads. The grid highlights whole SLOTS, not periods, so the
    // test is one slot on one date — not one period. A double period reported as a single
    // class writes two rows and must still point at that class, which is the commonest
    // report there is. Anything wider carries the span instead, since the grid already
    // marks every slot the teacher has a live absence on.
    const slotIds = new Set(toMark.map((m) => m.slot.id))
    const singleSlot = slotIds.size === 1 && markedDates.length === 1 ? toMark[0].slot : null
    const link: NotificationLink = {
      teacherId,
      teacherName: teacher.name,
      ...(singleSlot
        ? {
            timetableSlotId: singleSlot.id,
            date: markedDates[0],
            // The span of what was actually booked, which on a part-reported double period
            // is narrower than the slot's own times.
            startTime: toMark.reduce((min, m) => (m.window.startTime < min ? m.window.startTime : min), toMark[0].window.startTime),
            endTime: toMark.reduce((max, m) => (m.window.endTime > max ? m.window.endTime : max), toMark[0].window.endTime),
          }
        : {
            dateFrom: markedDates[0],
            dateTo: markedDates[markedDates.length - 1],
            periods: toMark.length,
          }),
    }

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
            data: link as any,
          })),
        })
        // After the write, never before: the signal tells clients to refetch, so the rows
        // have to be readable by the time it lands. Targeted at the admins who actually got
        // a notification rather than the whole school room, so a teacher's client isn't
        // woken to refetch a list that didn't change.
        emitToUsers(admins.map((a) => a.id), 'notifications:changed')
      }
    } else {
      // An admin logged it on the teacher's behalf (they didn't report it themselves) —
      // the teacher would otherwise have no way of knowing it's on record at all.
      await prisma.notification.create({
        data: {
          schoolId, recipientId: teacherId, type: 'TEACHER_ABSENCE_LOGGED_BY_ADMIN',
          title: 'Absence recorded', body: `An admin recorded you as absent for ${scope}.`,
          data: link as any,
        },
      })
      emitToUser(teacherId, 'notifications:changed')
    }

    // The absence lists changed for BOTH sides regardless of who filed it: the teacher's own
    // list and every admin's coverage/absence view. Sent to the school room here rather than
    // to each admin, because this is about a shared view of the school rather than one
    // person's inbox — the teacher's own client gets it via their user room.
    emitToUser(teacherId, 'absences:changed')
    emitToSchool(schoolId, 'absences:changed')

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
      include: {
        teacher: { select: { name: true } },
        slot: { include: {
          subject: { select: { name: true } },
          privateSubject: { select: { name: true, classLevel: true } },
        } },
      },
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
    // An absence an ADMIN recorded is never the teacher's to retract, at any point in its life.
    // seenByAdmin does not cover this: it starts false on a record the teacher never filed, so
    // until an admin happened to re-open the list the subject of the record could quietly erase
    // it — including before ever reading the notification telling them it existed.
    //
    // Judged across the whole class, because the delete below clears every period of it. The
    // check is "not recorded by the teacher themselves" rather than "recorded by an admin role":
    // createAbsence pins teacherId to the caller for non-admins, so the two are the same set,
    // and phrasing it this way stays correct if roles are ever added.
    if (!isAdmin) {
      const classRows = await prisma.teacherAbsence.findMany({
        where: {
          schoolId, teacherId: absence.teacherId, timetableSlotId: absence.timetableSlotId, date: absence.date,
        },
        select: { recordedById: true },
      })
      if (classRows.some((r) => r.recordedById !== absence.teacherId)) {
        res.status(403).json({ message: 'An admin recorded this absence, so only an admin can remove it' })
        return
      }
    }
    // Deletion is ATOMIC PER SLOT, mirroring reporting: the slot is the class the admin put
    // on the timetable, so it is the unit anyone acts on. Removing an absence therefore clears
    // EVERY period of that class on that date, and the cutoff is judged on the whole class,
    // not on each 50-minute window inside it.
    //
    // Counting stays per period — the rows are still one per periodIndex, which is what keeps
    // the hours arithmetic and the "N periods missed" totals right.
    //
    // Nobody, teacher or admin, can remove it once the CLASS is over: up to that moment there
    // is still a real possibility the teacher shows up, which is exactly the window an admin
    // needs to mark them present again; past it the record stands.
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { periodMinutes: true, absenceGraceMinutes: true },
    })
    // The whole class, not this row's own 50 minutes — see the atomicity note above.
    const window: PeriodWindow = { index: 0, startTime: absence.slot.startTime, endTime: absence.slot.endTime }

    // The hard stop, for everyone including admins: once the period itself is over there
    // is nothing left to correct.
    if (periodHasEnded(absence.date, window)) {
      res.status(403).json({ message: 'This class has already ended and can no longer be changed' })
      return
    }
    // Past the arrival window the period is lost, so the teacher can no longer retract
    // their own report — only an admin can, and the client warns them before they do.
    if (!isAdmin && graceHasExpired(absence.date, window, school?.absenceGraceMinutes ?? null)) {
      res.status(403).json({
        message: school?.absenceGraceMinutes != null
          ? `The ${school.absenceGraceMinutes}-minute arrival window for this period has passed. Ask an admin if this needs correcting.`
          : 'This period has already passed and can no longer be removed',
      })
      return
    }

    // Every period of this class on this date, not just the row that was clicked. Deleting one
    // and leaving its sibling would say the teacher missed half a class they cannot be
    // half-absent from.
    const { count: removed } = await prisma.teacherAbsence.deleteMany({
      where: { schoolId, teacherId: absence.teacherId, timetableSlotId: absence.timetableSlotId, date: absence.date },
    })

    // Captured from the row we just deleted — this is the only moment the period is still
    // knowable, which is the whole reason the link is stored rather than resolved on read.
    const link: NotificationLink = {
      teacherId: absence.teacherId,
      teacherName: absence.teacher.name,
      timetableSlotId: absence.timetableSlotId,
      date: absence.date,
      startTime: window.startTime,
      endTime: window.endTime,
      retracted: true,
    }

    if (!isAdmin) {
      // Mirrors createAbsence's notification — the TEACHER retracted their own report,
      // so admins see the reversal, not just the original "reported absent" that's no
      // longer true.
      const admins = await prisma.user.findMany({
        where: { schoolId, isActive: true, role: { in: ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'] } },
        select: { id: true },
      })
      if (admins.length > 0) {
        const subjectName = slotDisplayName(absence.slot)
        const body = `${absence.teacher.name} is no longer absent — retracted their report for ${absence.date}${subjectName ? ` (${subjectName})` : ''}.`
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            schoolId, recipientId: a.id, type: 'TEACHER_ABSENCE_RETRACTED',
            title: 'Absence report retracted', body, data: link as any,
          })),
        })
        emitToUsers(admins.map((a) => a.id), 'notifications:changed')
      }
    } else {
      // An ADMIN removed it instead — e.g. deciding to mark the teacher present after
      // all. The teacher would otherwise have no way of knowing their report vanished.
      const subjectName = slotDisplayName(absence.slot)
      const body = `An admin removed your absence report for ${absence.date}${subjectName ? ` (${subjectName})` : ''} — you're now marked present for that period.`
      await prisma.notification.create({
        data: {
          schoolId, recipientId: absence.teacherId, type: 'TEACHER_ABSENCE_REMOVED_BY_ADMIN',
          title: 'Absence report removed', body, data: link as any,
        },
      })
      emitToUser(absence.teacherId, 'notifications:changed')
    }

    emitToUser(absence.teacherId, 'absences:changed')
    emitToSchool(schoolId, 'absences:changed')

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
      include: { slot: { include: {
        subject: { select: { name: true, classLevel: true } },
        // Needed so a private class can be named by its label and, when linked, borrow
        // that course's class for the secondary line. See shapeAbsence.
        privateSubject: { select: { name: true, classLevel: true } },
      } } },
      // Within a day, earliest period first, so a split double period reads in order.
      orderBy: [{ date: 'desc' }, { periodIndex: 'asc' }],
    }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true, absenceGraceMinutes: true } }),
  ])
  const periodMinutes = school?.periodMinutes ?? null
  const shaped = absences.map((a) => shapeAbsence(a, periodMinutes, school?.absenceGraceMinutes ?? null))
  // Total periods missed: 1 per per-period row, the whole block for a legacy one. Falls
  // back to the plain event count when no period length is set yet.
  // Counted on the UNGROUPED rows: the total is per period even though the list is per class.
  const periodsMissed = shaped.reduce((sum, a) => sum + (a.periods ?? 1), 0)
  return { absences: groupByClass(shaped), periodMinutes, periodsMissed, periodEnd }
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
      // The teacher just lost the ability to retract these, and nothing else would tell them:
      // this is a READ by the admin, so it writes no notification. Without the signal their
      // screen keeps showing a delete button until they happen to reload, which is exactly
      // the stale bin icon that reads as a bug.
      emitToUser(teacherId, 'absences:changed')
    }

    res.json({ absences: shaped, periodMinutes, periodsMissed, periodEnd })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

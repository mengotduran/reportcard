import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { emitToUser } from '../config/socket'
import { NotificationLink } from '../utils/notificationLink'
import { timeToMinutes, dateStringToDayOfWeek, todayAtSchool, periodMinutesFor } from '../utils/teachingHours'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SET = new Set(DAY_ORDER)
const WEEKEND_DAYS = new Set(['SATURDAY', 'SUNDAY'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TEACHER_ROLES = ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL'] as const

const byDayThenTime = <T extends { dayOfWeek: string; startTime: string }>(a: T, b: T) =>
  DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime)

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd

// Same-day overlap, but two one-off (specificDate) slots that share a weekday without
// sharing the actual date never really coincide — mirrors the rule in saveTimetable.
const slotsOverlap = (
  a: { dayOfWeek: string; startTime: string; endTime: string; specificDate?: string | null },
  b: { dayOfWeek: string; startTime: string; endTime: string; specificDate?: string | null },
) => {
  if (a.dayOfWeek !== b.dayOfWeek) return false
  if (a.specificDate && b.specificDate && a.specificDate !== b.specificDate) return false
  return overlaps(a.startTime, a.endTime, b.startTime, b.endTime)
}

function shiftTime(hhmm: string, deltaMinutes: number): string {
  const total = Math.max(0, Math.min(timeToMinutes(hhmm) + deltaMinutes, 23 * 60 + 59))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function shapeSlot<T extends {
  dayOfWeek: string; startTime: string
  subject: { name: string; classLevel: string } | null
  privateSubject?: { name: string; classLevel: string } | null
}>(
  { subject, privateSubject, ...s }: T
) {
  return {
    ...s,
    subjectName: subject?.name ?? null,
    classLevel: subject?.classLevel ?? null,
    // The course a PRIVATE class delivers hours toward, resolved here so no client has to
    // fetch the whole subject list just to name it in a detail sheet.
    privateSubjectName: privateSubject?.name ?? null,
    privateSubjectClass: privateSubject?.classLevel ?? null,
  }
}

// A specific teacher's whole schedule — open to any authenticated role, same
// "read is open, write is restricted" split used elsewhere in this API. Admin
// uses this to view/build a teacher's timetable; anyone can look up a
// colleague's schedule.
export const getTeacherTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teacherId = String(req.query.teacherId ?? '')
    if (!teacherId) { res.status(400).json({ message: 'teacherId is required' }); return }

    const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, teacherId, archivedAt: null },
      include: {
        subject: { select: { name: true, classLevel: true } },
        privateSubject: { select: { name: true, classLevel: true } },
      },
    })

    res.json({ slots: slots.map(shapeSlot).sort(byDayThenTime) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// The logged-in teacher's own schedule.
export const getMyTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = req.user!.id
    const slots = await prisma.timetableSlot.findMany({
      where: { teacherId, archivedAt: null },
      include: {
        subject: { select: { name: true, classLevel: true } },
        privateSubject: { select: { name: true, classLevel: true } },
      },
    })
    res.json({ slots: slots.map(shapeSlot).sort(byDayThenTime) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Every slot at the school, across every teacher — lets the timetable builder
// warn about a cross-teacher clash the moment a class/period is picked in the
// Add Slot modal, instead of only finding out after "Save Timetable" makes a
// round trip. Admin-only (unlike getTeacherTimetable): this dumps every
// teacher's schedule at once, including private-slot labels that aren't
// really any admin's business to browse by the teacherful.
export const getSchoolTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, subjectId: { not: null }, archivedAt: null },
      include: { subject: { select: { classLevel: true } }, teacher: { select: { id: true, name: true } } },
    })
    res.json({
      slots: slots.map((s) => ({
        id: s.id, teacherId: s.teacherId, teacherName: s.teacher.name,
        dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
        classLevel: s.subject?.classLevel ?? null,
      })),
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// The school's shared bell schedule — open to any authenticated role (needed
// to label periods nicely on both the admin editor and a teacher's own view).
export const getPeriods = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const [periods, school] = await Promise.all([
      prisma.timetablePeriod.findMany({ where: { schoolId } }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { dayPeriodMinutes: true, eveningPeriodMinutes: true } }),
    ])
    res.json({
      periods: periods.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      dayPeriodMinutes: school?.dayPeriodMinutes ?? null,
      eveningPeriodMinutes: school?.eveningPeriodMinutes ?? null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Replace-all, same pattern as saveTimetable. Admin-only. Also persists the two
// sittings' own periodMinutes ("minutes per teaching period"), which every non-break
// period of that sitting must match. Day and Evening are independent bell schedules —
// no more "whole school" period — so shape rules (minute-multiple, overlap) are judged
// separately within each sitting's own list.
export const savePeriods = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!

    const parseMinutes = (raw: unknown): number | null => {
      const n = raw === null || raw === undefined || raw === '' ? null : Number(raw)
      return n
    }
    const dayPeriodMinutes = parseMinutes(req.body.dayPeriodMinutes)
    const eveningPeriodMinutes = parseMinutes(req.body.eveningPeriodMinutes)
    if (dayPeriodMinutes !== null && (!Number.isInteger(dayPeriodMinutes) || dayPeriodMinutes <= 0)) {
      res.status(400).json({ message: 'Minutes per Day period must be a positive whole number' }); return
    }
    if (eveningPeriodMinutes !== null && (!Number.isInteger(eveningPeriodMinutes) || eveningPeriodMinutes <= 0)) {
      res.status(400).json({ message: 'Minutes per Evening period must be a positive whole number' }); return
    }

    type PeriodRow = { startTime: string; endTime: string; isBreak: boolean; programme: 'DAY' | 'EVENING' }
    const rawPeriods = Array.isArray(req.body.periods) ? req.body.periods : []
    const periods: PeriodRow[] = rawPeriods.map((p: Record<string, unknown>) => ({
      startTime: String(p.startTime ?? ''),
      endTime: String(p.endTime ?? ''),
      isBreak: !!p.isBreak,
      // No more null/"whole school" — every row now belongs to one sitting. Anything
      // unrecognised falls back to DAY, matching the schema column default.
      programme: p.programme === 'EVENING' ? 'EVENING' : 'DAY',
    }))

    for (const p of periods) {
      if (!p.startTime || !p.endTime || p.endTime <= p.startTime) {
        res.status(400).json({ message: 'Each period needs a valid start time before its end time' }); return
      }
    }
    // Every teaching (non-break) period must be a whole multiple of ITS OWN sitting's
    // period length. How many is up to the admin and can differ row by row — the first
    // row of the day can be a double period and the next a single — so a class is
    // measured in whole periods either way. Breaks are exempt — they can be any length.
    for (const [sitting, minutes] of [['DAY', dayPeriodMinutes], ['EVENING', eveningPeriodMinutes]] as const) {
      if (minutes === null) continue
      // Every offending row at once. Reporting only the first sends the admin round the
      // save loop once per bad row, and a school that set its period length after building
      // its grid can easily have several.
      const bad = periods
        .filter((p) => p.programme === sitting && !p.isBreak && (timeToMinutes(p.endTime) - timeToMinutes(p.startTime)) % minutes !== 0)
        .map((p) => `${p.startTime}-${p.endTime} (${timeToMinutes(p.endTime) - timeToMinutes(p.startTime)} min)`)
      if (bad.length > 0) {
        res.status(400).json({ message: `Each ${sitting === 'EVENING' ? 'Evening' : 'Day'} teaching period must be a whole multiple of ${minutes} minutes. Fix: ${bad.join(', ')}. (Breaks can be any length.)` }); return
      }
    }
    // Overlap is judged within each sitting only — Day and Evening are independent
    // schedules, so nothing stops their clock windows from overlapping (in practice
    // Evening simply starts once Day is over).
    for (const sitting of ['DAY', 'EVENING'] as const) {
      const sittingSorted = periods.filter((p) => p.programme === sitting).sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let i = 1; i < sittingSorted.length; i++) {
        if (sittingSorted[i].startTime < sittingSorted[i - 1].endTime) {
          res.status(400).json({
            message: `Overlapping ${sitting === 'EVENING' ? 'Evening' : 'Day'} periods: ${sittingSorted[i - 1].startTime}-${sittingSorted[i - 1].endTime} and ${sittingSorted[i].startTime}-${sittingSorted[i].endTime}`,
          })
          return
        }
      }
    }
    const sorted = [...periods].sort((a, b) => a.startTime.localeCompare(b.startTime))

    // A teaching period whose time actually moved (whether the admin edited it in place
    // or deleted it and added a differently-timed one — this can't tell the two apart,
    // and doesn't need to) should carry every teacher's class at that old time along with
    // it, rather than silently leaving them on the stale time. Matched old-vs-new by
    // sorted position: the Nth period that disappeared is assumed to correspond to the
    // Nth one that appeared — the only signal available without asking the admin to link
    // them explicitly.
    type PeriodSpan = { startTime: string; endTime: string; isBreak: boolean }
    const oldPeriods = await prisma.timetablePeriod.findMany({ where: { schoolId } })
    const oldTeaching = oldPeriods.filter((p) => !p.isBreak).sort((a, b) => a.startTime.localeCompare(b.startTime))
    const newTeaching = periods.filter((p: PeriodSpan) => !p.isBreak).sort((a: PeriodSpan, b: PeriodSpan) => a.startTime.localeCompare(b.startTime))
    const sameSpan = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime === b.startTime && a.endTime === b.endTime
    const removed = oldTeaching.filter((o) => !newTeaching.some((n: PeriodSpan) => sameSpan(o, n)))
    const added = newTeaching.filter((n: PeriodSpan) => !oldTeaching.some((o) => sameSpan(o, n)))
    const periodMoves = removed.slice(0, added.length).map((oldP, i) => ({ oldP, newP: added[i] })).filter(({ oldP, newP }) => oldP.startTime !== newP.startTime)

    type ActiveSlot = { id: string; teacherId: string; dayOfWeek: string; startTime: string; endTime: string; subjectId: string | null; label: string | null; room: string | null; specificDate: string | null }
    const slotShifts: { slot: ActiveSlot; newStartTime: string; newEndTime: string }[] = []
    for (const { oldP, newP } of periodMoves) {
      const deltaMinutes = timeToMinutes(newP.startTime) - timeToMinutes(oldP.startTime)
      // Weekday, subject-linked slots only — private/one-off slots were never grid-locked
      // to a period in the first place, and weekend classes are explicitly exempt from
      // the period grid, so neither moves with it.
      const affected = await prisma.timetableSlot.findMany({
        where: { schoolId, archivedAt: null, subjectId: { not: null }, startTime: oldP.startTime, dayOfWeek: { notIn: [...WEEKEND_DAYS] } },
      })
      for (const slot of affected) {
        slotShifts.push({ slot, newStartTime: shiftTime(slot.startTime, deltaMinutes), newEndTime: shiftTime(slot.endTime, deltaMinutes) })
      }
    }

    if (slotShifts.length > 0) {
      const shiftedIds = new Set(slotShifts.map((s) => s.slot.id))
      const shiftById = new Map(slotShifts.map((s) => [s.slot.id, s]))
      const allActive = await prisma.timetableSlot.findMany({
        where: { schoolId, archivedAt: null },
        include: { subject: { select: { classLevel: true } }, teacher: { select: { name: true } } },
      })
      // Every slot as it would look AFTER this save — shifted ones at their new time,
      // everything else unchanged — so conflicts are checked against the real end state,
      // not the current one.
      const nextSlots = allActive.map((s) => {
        const shift = shiftById.get(s.id)
        return shift ? { ...s, startTime: shift.newStartTime, endTime: shift.newEndTime } : s
      })
      const newBreaks = periods.filter((p: PeriodSpan) => p.isBreak)

      const conflicts: string[] = []
      for (const s of nextSlots) {
        if (!shiftedIds.has(s.id)) continue
        const label = s.subjectId ? `${s.teacher.name} (${s.subject?.classLevel ?? ''})` : s.teacher.name
        // Same-teacher clash — they'd be in two places at once.
        const teacherClash = nextSlots.find((o) => o.id !== s.id && o.teacherId === s.teacherId && slotsOverlap(s, o))
        if (teacherClash) {
          conflicts.push(`${label} would clash with their own ${teacherClash.subjectId ? teacherClash.subject?.classLevel : (teacherClash.label ?? 'other')} slot on ${dayLabel(s.dayOfWeek)} at ${s.startTime}-${s.endTime}`)
          continue
        }
        // Cross-teacher clash — same class, same time, different teacher.
        if (s.subjectId) {
          const otherClash = nextSlots.find((o) => o.id !== s.id && o.teacherId !== s.teacherId && o.subjectId && o.subject?.classLevel === s.subject?.classLevel && slotsOverlap(s, o))
          if (otherClash) {
            conflicts.push(`${s.teacher.name} and ${otherClash.teacher.name} would both be teaching ${s.subject?.classLevel} on ${dayLabel(s.dayOfWeek)} at ${s.startTime}-${s.endTime}`)
            continue
          }
        }
        // Clash with a break band.
        const breakClash = newBreaks.find((b: PeriodSpan) => overlaps(s.startTime, s.endTime, b.startTime, b.endTime))
        if (breakClash) {
          conflicts.push(`${label} would overlap the break ${breakClash.startTime}-${breakClash.endTime} on ${dayLabel(s.dayOfWeek)}`)
        }
      }
      if (conflicts.length > 0) {
        res.status(400).json({ message: `Moving these periods would create conflicts — fix these first: ${conflicts.join('; ')}` })
        return
      }
    }

    const shiftArchivedAt = new Date()
    await prisma.$transaction([
      prisma.school.update({ where: { id: schoolId }, data: { dayPeriodMinutes, eveningPeriodMinutes } }),
      prisma.timetablePeriod.deleteMany({ where: { schoolId } }),
      ...(periods.length > 0 ? [prisma.timetablePeriod.createMany({ data: periods.map((p: typeof periods[number]) => ({ ...p, schoolId })) })] : []),
      ...(slotShifts.length > 0
        ? [
            prisma.timetableSlot.updateMany({ where: { id: { in: slotShifts.map((s) => s.slot.id) } }, data: { archivedAt: shiftArchivedAt } }),
            prisma.timetableSlot.createMany({
              data: slotShifts.map((s) => ({
                schoolId, teacherId: s.slot.teacherId, dayOfWeek: s.slot.dayOfWeek,
                startTime: s.newStartTime, endTime: s.newEndTime,
                subjectId: s.slot.subjectId, label: s.slot.label, room: s.slot.room, specificDate: null,
              })),
            }),
          ]
        : []),
    ])

    res.json({
      message: slotShifts.length > 0
        ? `Period structure saved — ${slotShifts.length} class${slotShifts.length === 1 ? '' : 'es'} automatically moved to match.`
        : 'Period structure saved',
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

interface SlotInput {
  dayOfWeek: string
  startTime: string
  endTime: string
  subjectId: string | null
  label: string | null
  room: string | null
  // "YYYY-MM-DD" — set only for a one-off private slot (see the schema comment on
  // TimetableSlot). Always null for a school-subject period.
  specificDate: string | null
  // Window for a private class that recurs weekly but only for part of the term. Both null
  // = runs the whole term, which is every school period and every "continuous" private one.
  startsOn: string | null
  endsOn: string | null
  // Optional course a private class delivers hours toward. Never set on a school period,
  // which already has subjectId.
  privateSubjectId: string | null
}

/** How a slot reads in the "your timetable changed" summary. A private class has no subject,
 *  only a label, so reading subject.name alone would list it as a blank line. */
const slotSummaryName = (s: { subjectName?: string | null; label?: string | null }): string =>
  s.subjectName ?? s.label ?? 'Private class'

const SHORT_DAY: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
}

const slotKey = (s: SlotInput) =>
  `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.subjectId ?? ''}|${s.label ?? ''}|${s.room ?? ''}|${s.specificDate ?? ''}`
  + `|${s.startsOn ?? ''}|${s.endsOn ?? ''}|${s.privateSubjectId ?? ''}`

// Identity for the period-shape rules, which judge WHEN a class runs and nothing else.
// Deliberately excludes room and label, so renaming a room never forces a class to be
// retimed to pass a rule it predates.
const slotTimingKey = (s: { dayOfWeek: string; startTime: string; endTime: string; subjectId: string | null; specificDate: string | null }) =>
  `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.subjectId ?? ''}|${s.specificDate ?? ''}`

// Replace-all: archives every currently-active slot for this teacher (rather than
// deleting them — see the archivedAt comment on TimetableSlot) and recreates from the
// submitted array as the new active set. Same delete-then-recreate SHAPE already used by
// assignTeacherSubjects, just non-destructive: this also happens to fix a real bug the
// old hard-delete had, where resaving ANY part of a teacher's timetable cascade-deleted
// every TeacherAbsence ever logged against their old slots (TimetableSlot -> TeacherAbsence
// is onDelete: Cascade).
export const saveTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teacherId = String(req.query.teacherId ?? '')
    if (!teacherId) { res.status(400).json({ message: 'teacherId is required' }); return }

    const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId, role: { in: [...TEACHER_ROLES] } } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    const rawSlots = Array.isArray(req.body.slots) ? req.body.slots : []
    const slots: SlotInput[] = rawSlots.map((s: Record<string, unknown>) => {
      const specificDate = s.specificDate ? String(s.specificDate) : null
      return {
        // A one-off slot's weekday is derived from its actual date, not whatever the
        // client sent — that's the one thing that can never be wrong or out of sync.
        dayOfWeek: specificDate && DATE_RE.test(specificDate) ? dateStringToDayOfWeek(specificDate) : String(s.dayOfWeek ?? '').toUpperCase(),
        startTime: String(s.startTime ?? ''),
        endTime: String(s.endTime ?? ''),
        subjectId: s.subjectId ? String(s.subjectId) : null,
        label: s.label ? String(s.label).trim() : null,
        room: s.room ? String(s.room).trim() : null,
        specificDate,
        // A window only means anything on a recurring slot. A one-off already names its
        // single day, so carrying a range alongside it would be two answers to one question.
        startsOn: !specificDate && s.startsOn && DATE_RE.test(String(s.startsOn)) ? String(s.startsOn) : null,
        endsOn: !specificDate && s.endsOn && DATE_RE.test(String(s.endsOn)) ? String(s.endsOn) : null,
        // Only a private slot can point at a course this way; a school period already has
        // subjectId, and setting both would double-count its hours on that course.
        privateSubjectId: !s.subjectId && s.privateSubjectId ? String(s.privateSubjectId) : null,
      }
    })

    // A backwards window silently produces zero hours, which reads as "the class never
    // happened" rather than "the dates are the wrong way round".
    const badWindow = slots.find((s) => s.startsOn && s.endsOn && s.startsOn > s.endsOn)
    if (badWindow) {
      res.status(400).json({ message: `A private class ends before it starts (${badWindow.startsOn} to ${badWindow.endsOn}).` })
      return
    }

    const [school, breakPeriods, teachingPeriodCount] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { dayPeriodMinutes: true, eveningPeriodMinutes: true } }),
      prisma.timetablePeriod.findMany({ where: { schoolId, isBreak: true }, select: { startTime: true, endTime: true } }),
      prisma.timetablePeriod.count({ where: { schoolId, isBreak: false } }),
    ])

    // Resolved up front (not just for the "assigned to this teacher" / "period sitting
    // matches class sitting" checks further down) because the minute-multiple check right
    // below needs to know EACH slot's own sitting: Day and Evening now have their own
    // period length, and a slot must be measured against the one its class actually runs on.
    const subjectIds = [...new Set(slots.filter((s) => s.subjectId).map((s) => s.subjectId as string))]
    let subjectClassLevel = new Map<string, string>()
    let subjectName = new Map<string, string>()
    let classProgramme = new Map<string, string>()
    if (subjectIds.length > 0) {
      const subjectRows = await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId }, select: { id: true, classLevel: true, name: true } })
      if (subjectRows.length !== subjectIds.length) {
        res.status(400).json({ message: 'One or more subjects were not found' }); return
      }
      subjectClassLevel = new Map(subjectRows.map((r) => [r.id, r.classLevel]))
      subjectName = new Map(subjectRows.map((r) => [r.id, r.name]))
      const classLevelRows = await prisma.classLevel.findMany({
        where: { schoolId, name: { in: [...new Set(subjectClassLevel.values())] } },
        select: { name: true, programme: true },
      })
      classProgramme = new Map(classLevelRows.map((c) => [c.name, c.programme]))
    }
    const periodMinutesForSlot = (s: { subjectId: string | null }): number | null => {
      const classLevel = s.subjectId ? subjectClassLevel.get(s.subjectId) : undefined
      const programme = classLevel ? classProgramme.get(classLevel) : undefined
      return periodMinutesFor({ dayPeriodMinutes: school?.dayPeriodMinutes ?? null, eveningPeriodMinutes: school?.eveningPeriodMinutes ?? null }, programme)
    }

    // Every slot already on this teacher's live timetable, by timing. The period-shape rules
    // below apply to what the admin is adding or retiming NOW, not to what is already there:
    // a school that sets a period length for the first time, or reshapes its bell schedule,
    // instantly makes every timetable built on the old grid non-conforming, and validating
    // those too would leave the admin unable to save any change at all until they had
    // retimed every stale class in the same sitting. Measured on real data here: one
    // lecturer's 09:10-11:50 block predates the 50-minute grid and would have blocked every
    // edit to his timetable.
    const activeSlots = await prisma.timetableSlot.findMany({ where: { schoolId, teacherId, archivedAt: null } })
    const untouchedTiming = new Set(activeSlots.map(slotTimingKey))

    for (const s of slots) {
      const preExisting = untouchedTiming.has(slotTimingKey(s))
      // A school with no period structure yet has nothing for a new slot to be measured
      // against — subject or private, weekday or weekend. Existing slots (preExisting)
      // are left alone for the same reason as every other check in this loop: a school
      // that never got round to Set Up Periods shouldn't suddenly be unable to save
      // edits to a timetable that predates this rule.
      if (!preExisting && teachingPeriodCount === 0) {
        res.status(400).json({ message: 'Set up your school\'s period structure ("Set Up Periods") before adding timetable slots.' })
        return
      }
      if (!DAY_SET.has(s.dayOfWeek)) { res.status(400).json({ message: `Invalid day: ${s.dayOfWeek}` }); return }
      if (!s.startTime || !s.endTime || s.endTime <= s.startTime) {
        res.status(400).json({ message: 'Each slot needs a valid start time before its end time' }); return
      }
      if (!s.subjectId && !s.label) { res.status(400).json({ message: 'Each slot needs either a subject or a label' }); return }
      if (s.specificDate) {
        if (!DATE_RE.test(s.specificDate)) { res.status(400).json({ message: 'Invalid one-off date' }); return }
        if (s.subjectId) { res.status(400).json({ message: 'A one-off date can only be used for a private/extra class, not a school subject period' }); return }
      }

      // A class cannot be booked into a day that is already over.
      //
      // Only for slots being ADDED or RETIMED (`preExisting`), exactly like the period-shape
      // rules above and for the same reason: this save re-sends every slot on the teacher's
      // timetable, so judging the old ones too would refuse every future edit the moment a
      // single past one-off existed — the admin would be locked out of that timetable for
      // good.
      //
      // Date-only, so entering this morning's class this afternoon still works. A window is
      // judged on its END: one that began a fortnight ago and is still running is a real
      // class being recorded late, but one that finished already can never run again.
      if (!preExisting) {
        const today = todayAtSchool()
        if (s.specificDate && s.specificDate < today) {
          res.status(400).json({ message: `That date has already passed (${s.specificDate}). Pick today or a later date.` })
          return
        }
        if (s.endsOn && s.endsOn < today) {
          res.status(400).json({ message: `That class finishes in the past (${s.endsOn}). Pick an end date of today or later.` })
          return
        }
      }
      // A class (subject slot) must be a whole number of periods, measured against ITS
      // OWN sitting's period length — an Evening class is never held to the Day minutes,
      // or the reverse. Private slots (label, no subject) are exempt — extra/after-hours
      // classes can be any length. So are Saturday/Sunday classes: weekend schedules
      // routinely don't follow the same period grid as the weekday timetable.
      if (s.subjectId && !preExisting && !WEEKEND_DAYS.has(s.dayOfWeek)) {
        const slotMinutes = periodMinutesForSlot(s)
        if (slotMinutes) {
          const dur = timeToMinutes(s.endTime) - timeToMinutes(s.startTime)
          if (dur % slotMinutes !== 0) {
            res.status(400).json({ message: `A class must be a whole number of ${slotMinutes}-minute periods — ${s.startTime}-${s.endTime} is ${dur} minutes.` }); return
          }
        }
      }
      // A class may never run across a break: a "double period" that reaches into one is
      // really two blocks either side of it, and the break would otherwise be counted as
      // taught time (and as a missed period whenever an absence is logged against it).
      // Private/extra classes are deliberately exempt — being off the period grid is what
      // they're for — as are weekend classes, exempt from the grid for the same reason.
      if (s.subjectId && !preExisting && !WEEKEND_DAYS.has(s.dayOfWeek)) {
        const crossed = breakPeriods.find((b) => s.startTime < b.endTime && b.startTime < s.endTime)
        if (crossed) {
          res.status(400).json({ message: `${s.startTime}-${s.endTime} runs across the break at ${crossed.startTime}-${crossed.endTime}. Use fewer periods, or start the class after the break.` }); return
        }
      }
    }

    // Same-day overlap check — a teacher can't be scheduled in two places at once. Two
    // one-off slots that share a weekday but fall on DIFFERENT actual dates never really
    // coincide, so they're exempt from clashing with each other.
    const byDay = new Map<string, SlotInput[]>()
    for (const s of slots) byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) ?? []), s])
    for (const [day, daySlots] of byDay) {
      const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i], b = sorted[j]
          if (a.specificDate && b.specificDate && a.specificDate !== b.specificDate) continue
          if (a.startTime < b.endTime && b.startTime < a.endTime) {
            res.status(400).json({ message: `Overlapping slots on ${day}: ${a.startTime}-${a.endTime} and ${b.startTime}-${b.endTime}` })
            return
          }
        }
      }
    }

    // A school-period slot may only use a subject/course this teacher is actually
    // assigned to. The builder schedules what a teacher already teaches; giving them a
    // new course is a separate, deliberate act on the Teachers page (which is also where
    // the "a university course has exactly one lecturer" hand-over is enforced, see
    // assignTeacherSubjects). Private slots (label-only) skip this entirely.
    // (subjectClassLevel/subjectName/classProgramme were already resolved above, for the
    // minute-multiple check.)
    if (subjectIds.length > 0) {
      // Pairs already on this teacher's live timetable are grandfathered: schools that
      // built timetables under the old "any course in the department" rule have slots for
      // courses since unassigned, and refusing those would make an existing timetable
      // impossible to re-save at all (proven on real data: one lecturer here has an active
      // slot for a course he no longer holds). Only a NEWLY added course must be assigned.
      const [assigned, alreadyScheduled] = await Promise.all([
        prisma.teacherSubject.findMany({ where: { userId: teacherId, subjectId: { in: subjectIds } }, select: { subjectId: true } }),
        prisma.timetableSlot.findMany({ where: { schoolId, teacherId, archivedAt: null, subjectId: { in: subjectIds } }, select: { subjectId: true } }),
      ])
      const allowed = new Set<string>([
        ...assigned.map((a) => a.subjectId),
        ...alreadyScheduled.map((s) => s.subjectId as string),
      ])
      const notAllowed = subjectIds.filter((id) => !allowed.has(id))
      if (notAllowed.length > 0) {
        res.status(400).json({
          message: `This teacher is not assigned to ${notAllowed.map((id) => subjectName.get(id) ?? id).join(', ')}. Assign the course on the Teachers page first, then schedule it here.`,
        })
        return
      }

      // A period tagged for one sitting only accepts a class of that same sitting — the
      // whole point of tagging is to stop a Day class landing in an Evening-only period, or
      // the reverse. Only NEW or RETIMED slots are judged, same grandfathering as the
      // period-shape rules above: a school that tags a period after building its grid must
      // still be able to re-save the timetable it already has.
      const taggedPeriods = await prisma.timetablePeriod.findMany({
        where: { schoolId, isBreak: false },
        select: { startTime: true, endTime: true, programme: true },
      })
      if (taggedPeriods.length > 0) {
        for (const s of slots) {
          if (!s.subjectId || WEEKEND_DAYS.has(s.dayOfWeek) || untouchedTiming.has(slotTimingKey(s))) continue
          const period = taggedPeriods.find((p) => p.startTime === s.startTime && p.endTime === s.endTime)
          if (!period) continue
          const classLevel = subjectClassLevel.get(s.subjectId)
          const programme = (classLevel && classProgramme.get(classLevel)) ?? 'DAY'
          if (programme !== period.programme) {
            res.status(400).json({
              message: `${s.startTime}-${s.endTime} is an ${period.programme === 'EVENING' ? 'Evening' : 'Day'}-only period, but ${classLevel} is a ${programme === 'EVENING' ? 'Evening' : 'Day'} class.`,
            })
            return
          }
        }
      }
    }

    // Cross-teacher clash check — a class can only have one teacher in front of
    // it at a time. Only school-period slots matter here (a private slot has no
    // class attached, so it can never clash with anyone else's class).
    const classLevelsUsed = [...new Set([...subjectClassLevel.values()])]
    if (classLevelsUsed.length > 0) {
      const otherSlots = await prisma.timetableSlot.findMany({
        where: { schoolId, teacherId: { not: teacherId }, archivedAt: null, subject: { classLevel: { in: classLevelsUsed } } },
        include: { subject: { select: { classLevel: true } }, teacher: { select: { name: true } } },
      })
      for (const s of slots) {
        if (!s.subjectId) continue
        const classLevel = subjectClassLevel.get(s.subjectId)
        const conflict = otherSlots.find((o) =>
          o.dayOfWeek === s.dayOfWeek && o.subject?.classLevel === classLevel && overlaps(s.startTime, s.endTime, o.startTime, o.endTime)
        )
        if (conflict) {
          res.status(400).json({
            message: `This period is already taken — ${conflict.teacher.name} is already teaching ${classLevel} on ${dayLabel(s.dayOfWeek)} at ${conflict.startTime}-${conflict.endTime}`,
          })
          return
        }
      }
    }

    // Nothing to do if this is exactly the schedule already active — skip archiving a
    // version that would be identical to the one it's replacing. (Same rows already
    // fetched above for the pre-existing-timing check.)
    const existingActive = activeSlots
    const existingKeys = existingActive.map(slotKey).sort()
    const newKeys = slots.map(slotKey).sort()
    const unchanged = existingKeys.length === newKeys.length && existingKeys.every((k, i) => k === newKeys[i])

    if (!unchanged) {
      // Scheduling no longer changes WHO teaches a course — it can only arrange courses the
      // teacher already holds (checked above). Assigning a course, and the university
      // "exactly one lecturer, take it off whoever held it" hand-over that goes with it,
      // both live in assignTeacherSubjects on the Teachers page, which is now the only way
      // in. Nothing here writes to TeacherSubject any more.
      const archivedAt = new Date()
      await prisma.$transaction([
        ...(existingActive.length > 0
          ? [prisma.timetableSlot.updateMany({ where: { schoolId, teacherId, archivedAt: null }, data: { archivedAt } })]
          : []),
        ...(slots.length > 0
          ? [prisma.timetableSlot.createMany({ data: slots.map((s) => ({ ...s, schoolId, teacherId })) })]
          : []),
      ])

      // Tell the teacher their schedule moved. Until now saving a timetable notified nobody
      // and emitted nothing: an admin could add, move or remove a class and the teacher had
      // no way of finding out short of opening the screen and noticing.
      //
      // The diff is free — existingKeys/newKeys above already exist for the `unchanged`
      // check, so the same key sets say what was added and what was removed.
      const existingSet = new Set(existingKeys)
      const newSet = new Set(newKeys)
      // Neither side of the diff carries a subject NAME: `slots` is the parsed request body
      // and `existingActive` is a bare row query, both of which have only subjectId. Resolve
      // them once, or every added/removed course would be summarised as "Private class".
      const namedIds = [...new Set([...slots, ...existingActive].map((x) => x.subjectId).filter((v): v is string => !!v))]
      const subjectNameById = new Map(
        (namedIds.length > 0
          ? await prisma.subject.findMany({ where: { id: { in: namedIds } }, select: { id: true, name: true } })
          : []
        ).map((x) => [x.id, x.name]),
      )
      const describe = (x: { dayOfWeek: string; startTime: string; endTime: string; subjectId: string | null; label?: string | null; specificDate?: string | null }) =>
        `${slotSummaryName({ subjectName: x.subjectId ? subjectNameById.get(x.subjectId) ?? null : null, label: x.label })}`
        + ` · ${x.specificDate ?? SHORT_DAY[x.dayOfWeek] ?? x.dayOfWeek} ${x.startTime}-${x.endTime}`
      const addedList = slots.filter((x) => !existingSet.has(slotKey(x))).map(describe)
      const removedList = existingActive.filter((x) => !newSet.has(slotKey(x))).map(describe)

      // Capped: a rebuilt timetable would otherwise produce a notification listing forty
      // lines, which nobody reads. The count still tells the whole truth.
      const summarise = (verb: string, list: string[]) =>
        list.length === 0 ? null
          : `${verb}: ${list.slice(0, 3).join('; ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}`
      const parts = [summarise('Added', addedList), summarise('Removed', removedList)].filter(Boolean)

      if (parts.length > 0) {
        const link: NotificationLink = { teacherId, teacherName: teacher.name, timetableChanged: true }
        await prisma.notification.create({
          data: {
            schoolId, recipientId: teacherId, type: 'TIMETABLE_UPDATED',
            title: 'Your timetable was updated',
            body: `${parts.join('. ')}.`,
            data: link as any,
          },
        })
        emitToUser(teacherId, 'notifications:changed')
      }
      // Signalled whether or not a notification was written: even a pure retiming (same
      // classes, different times) leaves an open timetable screen showing the old grid.
      emitToUser(teacherId, 'timetable:changed')
    }

    res.json({ message: unchanged ? 'No changes to save' : 'Timetable saved' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Every past version of this teacher's timetable — every slot that's been archived
// (superseded by a later save), grouped by the exact archivedAt timestamp they share
// (everything archived in one save shares one timestamp; see saveTimetable). Newest
// version first. Purely informational — hour/coverage math never looks at these.
export const getTimetableHistory = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teacherId = String(req.query.teacherId ?? '')
    if (!teacherId) { res.status(400).json({ message: 'teacherId is required' }); return }

    const archived = await prisma.timetableSlot.findMany({
      where: { schoolId, teacherId, archivedAt: { not: null } },
      include: {
        subject: { select: { name: true, classLevel: true } },
        privateSubject: { select: { name: true, classLevel: true } },
      },
    })

    const versions = new Map<string, ReturnType<typeof shapeSlot>[]>()
    for (const s of archived) {
      const key = s.archivedAt!.toISOString()
      versions.set(key, [...(versions.get(key) ?? []), shapeSlot(s)])
    }
    const sorted = [...versions.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([archivedAt, versionSlots]) => ({ archivedAt, slots: versionSlots.sort(byDayThenTime) }))

    res.json({ versions: sorted })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Permanently removes one archived version — the admin's way to actually get rid of a
// past timetable they don't want kept, rather than it just sitting in history forever.
// Admin-only. The CURRENT (active) timetable is never reachable through this endpoint.
export const deleteTimetableHistoryVersion = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teacherId = String(req.body.teacherId ?? '')
    const archivedAtRaw = req.body.archivedAt ? String(req.body.archivedAt) : ''
    const archivedAt = archivedAtRaw ? new Date(archivedAtRaw) : null
    if (!teacherId || !archivedAt || isNaN(archivedAt.getTime())) {
      res.status(400).json({ message: 'teacherId and archivedAt are required' }); return
    }
    // Deleting is only safe while nothing is RECORDED against this version. TeacherAbsence
    // cascades on TimetableSlot, so removing these rows would silently take every absence
    // logged against them — and with them the teacher's missed-period counts and the hours
    // arithmetic that subtracts from. That is unrecoverable, and the admin would never be
    // told it happened.
    //
    // The version stays; an admin who wants a different schedule edits the CURRENT timetable
    // instead, which archives rather than destroys.
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, teacherId, archivedAt },
      select: { id: true },
    })
    if (slots.length === 0) {
      res.status(404).json({ message: 'Timetable version not found' }); return
    }
    const recorded = await prisma.teacherAbsence.count({
      where: { timetableSlotId: { in: slots.map((s) => s.id) } },
    })
    if (recorded > 0) {
      res.status(409).json({
        message: `This version cannot be deleted: ${recorded} recorded ${recorded === 1 ? 'absence is' : 'absences are'} attached to it. Edit the current timetable instead — past versions are kept so those records stay valid.`,
        recordedAbsences: recorded,
      })
      return
    }

    await prisma.timetableSlot.deleteMany({ where: { schoolId, teacherId, archivedAt } })
    res.json({ message: 'Timetable version removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

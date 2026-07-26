import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { timeToMinutes, dateStringToDayOfWeek } from '../utils/teachingHours'

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

function shapeSlot<T extends { dayOfWeek: string; startTime: string; subject: { name: string; classLevel: string } | null }>(
  { subject, ...s }: T
) {
  return { ...s, subjectName: subject?.name ?? null, classLevel: subject?.classLevel ?? null }
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
      include: { subject: { select: { name: true, classLevel: true } } },
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
      include: { subject: { select: { name: true, classLevel: true } } },
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
      prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
    ])
    res.json({
      periods: periods.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      periodMinutes: school?.periodMinutes ?? null,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Replace-all, same pattern as saveTimetable. Admin-only. Also persists the school-wide
// periodMinutes ("minutes per teaching period"), which every non-break period must match.
export const savePeriods = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!

    const rawMinutes = req.body.periodMinutes
    const periodMinutes = rawMinutes === null || rawMinutes === undefined || rawMinutes === '' ? null : Number(rawMinutes)
    if (periodMinutes !== null && (!Number.isInteger(periodMinutes) || periodMinutes <= 0)) {
      res.status(400).json({ message: 'Minutes per period must be a positive whole number' }); return
    }

    type PeriodRow = { startTime: string; endTime: string; isBreak: boolean }
    const rawPeriods = Array.isArray(req.body.periods) ? req.body.periods : []
    const periods: PeriodRow[] = rawPeriods.map((p: Record<string, unknown>) => ({
      startTime: String(p.startTime ?? ''),
      endTime: String(p.endTime ?? ''),
      isBreak: !!p.isBreak,
    }))

    for (const p of periods) {
      if (!p.startTime || !p.endTime || p.endTime <= p.startTime) {
        res.status(400).json({ message: 'Each period needs a valid start time before its end time' }); return
      }
    }
    // Every teaching (non-break) period must be a whole multiple of one period. How many
    // is up to the admin and can differ row by row — the first row of the day can be a
    // double period and the next a single — so a class is measured in whole periods
    // either way. Breaks are exempt — they can be any length.
    if (periodMinutes !== null) {
      // Every offending row at once. Reporting only the first sends the admin round the
      // save loop once per bad row, and a school that set its period length after building
      // its grid can easily have several.
      const bad = periods
        .filter((p) => !p.isBreak && (timeToMinutes(p.endTime) - timeToMinutes(p.startTime)) % periodMinutes !== 0)
        .map((p) => `${p.startTime}-${p.endTime} (${timeToMinutes(p.endTime) - timeToMinutes(p.startTime)} min)`)
      if (bad.length > 0) {
        res.status(400).json({ message: `Each teaching period must be a whole multiple of ${periodMinutes} minutes. Fix: ${bad.join(', ')}. (Breaks can be any length.)` }); return
      }
    }
    const sorted = [...periods].sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        res.status(400).json({
          message: `Overlapping periods: ${sorted[i - 1].startTime}-${sorted[i - 1].endTime} and ${sorted[i].startTime}-${sorted[i].endTime}`,
        })
        return
      }
    }

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
      prisma.school.update({ where: { id: schoolId }, data: { periodMinutes } }),
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
}

const slotKey = (s: SlotInput) =>
  `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.subjectId ?? ''}|${s.label ?? ''}|${s.room ?? ''}|${s.specificDate ?? ''}`

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
      }
    })

    const [school, breakPeriods] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
      prisma.timetablePeriod.findMany({ where: { schoolId, isBreak: true }, select: { startTime: true, endTime: true } }),
    ])
    const periodMinutes = school?.periodMinutes ?? null

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
      if (!DAY_SET.has(s.dayOfWeek)) { res.status(400).json({ message: `Invalid day: ${s.dayOfWeek}` }); return }
      if (!s.startTime || !s.endTime || s.endTime <= s.startTime) {
        res.status(400).json({ message: 'Each slot needs a valid start time before its end time' }); return
      }
      if (!s.subjectId && !s.label) { res.status(400).json({ message: 'Each slot needs either a subject or a label' }); return }
      if (s.specificDate) {
        if (!DATE_RE.test(s.specificDate)) { res.status(400).json({ message: 'Invalid one-off date' }); return }
        if (s.subjectId) { res.status(400).json({ message: 'A one-off date can only be used for a private/extra class, not a school subject period' }); return }
      }
      // A class (subject slot) must be a whole number of periods. Private slots (label,
      // no subject) are exempt — extra/after-hours classes can be any length. So are
      // Saturday/Sunday classes: weekend schedules routinely don't follow the same
      // period grid as the weekday timetable.
      if (s.subjectId && periodMinutes && !preExisting && !WEEKEND_DAYS.has(s.dayOfWeek)) {
        const dur = timeToMinutes(s.endTime) - timeToMinutes(s.startTime)
        if (dur % periodMinutes !== 0) {
          res.status(400).json({ message: `A class must be a whole number of ${periodMinutes}-minute periods — ${s.startTime}-${s.endTime} is ${dur} minutes.` }); return
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
    const subjectIds = [...new Set(slots.filter((s) => s.subjectId).map((s) => s.subjectId as string))]
    let subjectClassLevel = new Map<string, string>()
    if (subjectIds.length > 0) {
      const subjectRows = await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId }, select: { id: true, classLevel: true, name: true } })
      if (subjectRows.length !== subjectIds.length) {
        res.status(400).json({ message: 'One or more subjects were not found' }); return
      }
      subjectClassLevel = new Map(subjectRows.map((r) => [r.id, r.classLevel]))

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
      const notAllowed = subjectRows.filter((r) => !allowed.has(r.id))
      if (notAllowed.length > 0) {
        res.status(400).json({
          message: `This teacher is not assigned to ${notAllowed.map((r) => r.name).join(', ')}. Assign the course on the Teachers page first, then schedule it here.`,
        })
        return
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
      include: { subject: { select: { name: true, classLevel: true } } },
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
    await prisma.timetableSlot.deleteMany({ where: { schoolId, teacherId, archivedAt } })
    res.json({ message: 'Timetable version removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { dateStringToDayOfWeek, slotHasPassed, slotPeriods } from '../utils/teachingHours'
import { getCurrentPeriodRange } from './coverage.controller'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function shapeAbsence<T extends { date: string; seenByAdmin: boolean; slot: { dayOfWeek: string; startTime: string; endTime: string; subject: { name: string; classLevel: string } | null } }>(
  { slot, ...a }: T,
  periodMinutes: number | null,
) {
  return {
    ...a,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    subjectName: slot.subject?.name ?? null,
    classLevel: slot.subject?.classLevel ?? null,
    // Both clients need this to decide whether to show a delete button at all — the
    // DELETE endpoint is the real gate either way.
    hourHasPassed: slotHasPassed(a.date, slot.endTime),
    // How many periods this one missed class is worth (a 2-period class = 2). null if the
    // school hasn't set a period length yet — clients then fall back to counting events.
    periods: slotPeriods(slot.startTime, slot.endTime, periodMinutes),
  }
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
    const date = String(req.body.date ?? '')
    const wholeDay = Boolean(req.body.wholeDay)
    const requestedSlotIds: string[] = Array.isArray(req.body.timetableSlotIds) ? req.body.timetableSlotIds.map(String) : []

    if (!DATE_RE.test(date)) {
      res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' })
      return
    }
    if (!wholeDay && requestedSlotIds.length === 0) {
      res.status(400).json({ message: 'Select the whole day or at least one period' })
      return
    }

    const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    const dayOfWeek = dateStringToDayOfWeek(date)
    const daySlots = await prisma.timetableSlot.findMany({
      where: { schoolId, teacherId, dayOfWeek, subjectId: { not: null } },
      include: { subject: { select: { name: true } } },
    })

    let slotsToMark = wholeDay
      ? daySlots
      : daySlots.filter((s) => requestedSlotIds.includes(s.id))

    if (slotsToMark.length === 0) {
      res.status(400).json({ message: 'No matching periods on that day for this teacher' })
      return
    }

    // Nobody — teacher OR admin — can report an absence for a period that has already
    // ENDED. An absence is a statement about a class that is still to happen; once it's
    // over there's nothing left to report, and backdating one silently rewrites hours
    // already counted as taught. Admins used to be exempt here (to backfill after the
    // fact); that exemption is gone, matching the same rule on deletion.
    //
    // "Whole day" quietly drops any already-elapsed periods and reports the rest, so
    // reporting absent partway through a day still works. Explicitly-picked periods are
    // rejected outright if any has passed, since those specific ones were chosen.
    if (wholeDay) {
      slotsToMark = slotsToMark.filter((s) => !slotHasPassed(date, s.endTime))
      if (slotsToMark.length === 0) {
        res.status(400).json({ message: 'All periods for this day have already passed and can no longer be reported' })
        return
      }
    } else if (slotsToMark.some((s) => slotHasPassed(date, s.endTime))) {
      res.status(400).json({ message: 'One or more of the selected periods has already passed and can no longer be reported' })
      return
    }

    await prisma.teacherAbsence.createMany({
      data: slotsToMark.map((s) => ({
        schoolId, teacherId, timetableSlotId: s.id, date, recordedById: req.user!.id,
      })),
      skipDuplicates: true,
    })

    const subjectNames = [...new Set(slotsToMark.map((s) => s.subject?.name).filter((n): n is string => !!n))]
    const periodWord = slotsToMark.length === 1 ? 'period' : 'periods'

    if (!isAdmin) {
      // Admins get an in-app notification when a teacher reports their OWN absence.
      const admins = await prisma.user.findMany({
        where: { schoolId, isActive: true, role: { in: ['SCHOOL_ADMIN', 'VICE_PRINCIPAL'] } },
        select: { id: true },
      })
      if (admins.length > 0) {
        const body = wholeDay
          ? `${teacher.name} reported absent for the whole day on ${date}.`
          : `${teacher.name} reported absent for ${slotsToMark.length} ${periodWord} on ${date}${subjectNames.length ? ` (${subjectNames.join(', ')})` : ''}.`
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            schoolId, recipientId: a.id, type: 'TEACHER_ABSENCE',
            title: 'Teacher absence reported', body,
          })),
        })
      }
    } else {
      // An admin logged it on the teacher's behalf (they didn't report it themselves) —
      // the teacher would otherwise have no way of knowing it's on record at all.
      const body = wholeDay
        ? `An admin recorded you as absent for the whole day on ${date}.`
        : `An admin recorded you as absent for ${slotsToMark.length} ${periodWord} on ${date}${subjectNames.length ? ` (${subjectNames.join(', ')})` : ''}.`
      await prisma.notification.create({
        data: { schoolId, recipientId: teacherId, type: 'TEACHER_ABSENCE_LOGGED_BY_ADMIN', title: 'Absence recorded', body },
      })
    }

    res.status(201).json({ message: 'Absence recorded', count: slotsToMark.length })
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
    // Nobody — teacher or admin — can remove an absence once the period it was reported
    // for has actually ENDED (not just started; a multi-period report stays removable
    // until the LAST of those periods ends). Before that point there's still a real
    // possibility the teacher shows up after all; once it's over, there's nothing left to
    // correct, so the record is final for everyone.
    if (slotHasPassed(absence.date, absence.slot.endTime)) {
      res.status(403).json({ message: 'This period has already passed and can no longer be removed' })
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
  let effectiveFrom = from
  let effectiveTo = to
  if (!from && !to) {
    const range = await getCurrentPeriodRange(schoolId)
    if (range) {
      effectiveFrom = range.start.toISOString().slice(0, 10)
      effectiveTo = range.end.toISOString().slice(0, 10)
    }
  }
  const [absences, school] = await Promise.all([
    prisma.teacherAbsence.findMany({
      where: {
        schoolId, teacherId,
        ...(effectiveFrom ? { date: { gte: effectiveFrom } } : {}),
        ...(effectiveTo ? { date: { lte: effectiveTo } } : {}),
      },
      include: { slot: { include: { subject: { select: { name: true, classLevel: true } } } } },
      orderBy: { date: 'desc' },
    }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
  ])
  const periodMinutes = school?.periodMinutes ?? null
  const shaped = absences.map((a) => shapeAbsence(a, periodMinutes))
  // Total periods missed (a 2-period class counts as 2). Falls back to the plain event
  // count when no period length is set yet.
  const periodsMissed = shaped.reduce((sum, a) => sum + (a.periods ?? 1), 0)
  return { absences: shaped, periodMinutes, periodsMissed }
}

export const getMyAbsences = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const from = req.query.from ? String(req.query.from) : undefined
    const to = req.query.to ? String(req.query.to) : undefined
    const { absences, periodMinutes, periodsMissed } = await listAbsences(schoolId, req.user!.id, from, to)
    res.json({ absences, periodMinutes, periodsMissed })
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
        select: { teacherId: true, slot: { select: { startTime: true, endTime: true } } },
      }),
      prisma.school.findUnique({ where: { id: schoolId }, select: { periodMinutes: true } }),
    ])
    const periodMinutes = school?.periodMinutes ?? null
    const byTeacher = new Map<string, { count: number; periods: number }>()
    for (const a of absences) {
      const cur = byTeacher.get(a.teacherId) ?? { count: 0, periods: 0 }
      cur.count += 1
      cur.periods += slotPeriods(a.slot.startTime, a.slot.endTime, periodMinutes) ?? 1
      byTeacher.set(a.teacherId, cur)
    }
    res.json({
      counts: [...byTeacher].map(([teacherId, v]) => ({ teacherId, count: v.count, periods: v.periods })),
      periodMinutes,
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

    const { absences: shaped, periodMinutes, periodsMissed } = await listAbsences(schoolId, teacherId, from, to)

    // Mark seen for the NEXT time this list is fetched — deliberately not before building
    // the response above, so the admin's CURRENT visit still shows these as deletable
    // (their real chance to act, e.g. remove one to mark the teacher present after all).
    // Only a later visit will show seenByAdmin: true and refuse the delete.
    const unseenIds = shaped.filter((a) => !a.seenByAdmin).map((a) => a.id)
    if (unseenIds.length > 0) {
      await prisma.teacherAbsence.updateMany({ where: { id: { in: unseenIds } }, data: { seenByAdmin: true } })
    }

    res.json({ absences: shaped, periodMinutes, periodsMissed })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

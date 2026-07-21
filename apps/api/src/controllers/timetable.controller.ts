import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_SET = new Set(DAY_ORDER)
const TEACHER_ROLES = ['CLASS_TEACHER', 'CLASS_MASTER', 'SUBJECT_TEACHER', 'VICE_PRINCIPAL'] as const

const byDayThenTime = <T extends { dayOfWeek: string; startTime: string }>(a: T, b: T) =>
  DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime)

const dayLabel = (d: string) => d.charAt(0) + d.slice(1).toLowerCase()
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd

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
      where: { schoolId, teacherId },
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
      where: { teacherId },
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
      where: { schoolId, subjectId: { not: null } },
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
    const periods = await prisma.timetablePeriod.findMany({ where: { schoolId } })
    res.json({ periods: periods.sort((a, b) => a.startTime.localeCompare(b.startTime)) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

// Replace-all, same pattern as saveTimetable. Admin-only.
export const savePeriods = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const rawPeriods = Array.isArray(req.body.periods) ? req.body.periods : []
    const periods = rawPeriods.map((p: Record<string, unknown>) => ({
      startTime: String(p.startTime ?? ''),
      endTime: String(p.endTime ?? ''),
      isBreak: !!p.isBreak,
    }))

    for (const p of periods) {
      if (!p.startTime || !p.endTime || p.endTime <= p.startTime) {
        res.status(400).json({ message: 'Each period needs a valid start time before its end time' }); return
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

    await prisma.$transaction([
      prisma.timetablePeriod.deleteMany({ where: { schoolId } }),
      ...(periods.length > 0 ? [prisma.timetablePeriod.createMany({ data: periods.map((p: typeof periods[number]) => ({ ...p, schoolId })) })] : []),
    ])

    res.json({ message: 'Period structure saved' })
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
}

// Replace-all: deletes every existing slot for this teacher and recreates
// from the submitted array — same delete-then-recreate approach already used
// by assignTeacherSubjects, simpler and less error-prone than incremental
// per-slot CRUD for what is fundamentally a whole-day schedule the admin
// edits together.
export const saveTimetable = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const teacherId = String(req.query.teacherId ?? '')
    if (!teacherId) { res.status(400).json({ message: 'teacherId is required' }); return }

    const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId, role: { in: [...TEACHER_ROLES] } } })
    if (!teacher) { res.status(404).json({ message: 'Teacher not found' }); return }

    const rawSlots = Array.isArray(req.body.slots) ? req.body.slots : []
    const slots: SlotInput[] = rawSlots.map((s: Record<string, unknown>) => ({
      dayOfWeek: String(s.dayOfWeek ?? '').toUpperCase(),
      startTime: String(s.startTime ?? ''),
      endTime: String(s.endTime ?? ''),
      subjectId: s.subjectId ? String(s.subjectId) : null,
      label: s.label ? String(s.label).trim() : null,
      room: s.room ? String(s.room).trim() : null,
    }))

    for (const s of slots) {
      if (!DAY_SET.has(s.dayOfWeek)) { res.status(400).json({ message: `Invalid day: ${s.dayOfWeek}` }); return }
      if (!s.startTime || !s.endTime || s.endTime <= s.startTime) {
        res.status(400).json({ message: 'Each slot needs a valid start time before its end time' }); return
      }
      if (!s.subjectId && !s.label) { res.status(400).json({ message: 'Each slot needs either a subject or a label' }); return }
    }

    // Same-day overlap check — a teacher can't be scheduled in two places at once.
    const byDay = new Map<string, SlotInput[]>()
    for (const s of slots) byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) ?? []), s])
    for (const [day, daySlots] of byDay) {
      const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startTime < sorted[i - 1].endTime) {
          res.status(400).json({
            message: `Overlapping slots on ${day}: ${sorted[i - 1].startTime}-${sorted[i - 1].endTime} and ${sorted[i].startTime}-${sorted[i].endTime}`,
          })
          return
        }
      }
    }

    // A school-period slot's subject just needs to be a real subject at this
    // school — it no longer has to already be one of this teacher's subject
    // assignments. A course can be picked up by any teacher in its department;
    // the only thing that actually blocks two teachers is a real schedule
    // clash (checked below via classLevel). Private slots (label-only) skip
    // this entirely.
    const subjectIds = [...new Set(slots.filter((s) => s.subjectId).map((s) => s.subjectId as string))]
    let subjectClassLevel = new Map<string, string>()
    if (subjectIds.length > 0) {
      const subjectRows = await prisma.subject.findMany({ where: { id: { in: subjectIds }, schoolId }, select: { id: true, classLevel: true } })
      if (subjectRows.length !== subjectIds.length) {
        res.status(400).json({ message: 'One or more subjects were not found' }); return
      }
      subjectClassLevel = new Map(subjectRows.map((r) => [r.id, r.classLevel]))
    }

    // Cross-teacher clash check — a class can only have one teacher in front of
    // it at a time. Only school-period slots matter here (a private slot has no
    // class attached, so it can never clash with anyone else's class).
    const classLevelsUsed = [...new Set([...subjectClassLevel.values()])]
    if (classLevelsUsed.length > 0) {
      const otherSlots = await prisma.timetableSlot.findMany({
        where: { schoolId, teacherId: { not: teacherId }, subject: { classLevel: { in: classLevelsUsed } } },
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

    await prisma.$transaction([
      prisma.timetableSlot.deleteMany({ where: { schoolId, teacherId } }),
      ...(slots.length > 0
        ? [prisma.timetableSlot.createMany({ data: slots.map((s) => ({ ...s, schoolId, teacherId })) })]
        : []),
      // Picking a course for a teacher here is itself the assignment — no need
      // to separately visit the Teachers page first. Doesn't touch any other
      // teacher's existing link to the same subject; a course can now have more
      // than one teacher as long as their slots don't clash (checked above).
      ...(subjectIds.length > 0
        ? [prisma.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ userId: teacherId, subjectId })), skipDuplicates: true })]
        : []),
    ])

    res.json({ message: 'Timetable saved' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

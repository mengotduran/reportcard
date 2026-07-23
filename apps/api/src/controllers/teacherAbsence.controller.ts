import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { dateStringToDayOfWeek } from '../utils/teachingHours'

const ADMIN_ROLES = ['SCHOOL_ADMIN', 'VICE_PRINCIPAL']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function shapeAbsence<T extends { slot: { dayOfWeek: string; startTime: string; endTime: string; subject: { name: string; classLevel: string } | null } }>(
  { slot, ...a }: T
) {
  return {
    ...a,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    subjectName: slot.subject?.name ?? null,
    classLevel: slot.subject?.classLevel ?? null,
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
    })

    const slotsToMark = wholeDay
      ? daySlots
      : daySlots.filter((s) => requestedSlotIds.includes(s.id))

    if (slotsToMark.length === 0) {
      res.status(400).json({ message: 'No matching periods on that day for this teacher' })
      return
    }

    await prisma.teacherAbsence.createMany({
      data: slotsToMark.map((s) => ({
        schoolId, teacherId, timetableSlotId: s.id, date, recordedById: req.user!.id,
      })),
      skipDuplicates: true,
    })

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

    const absence = await prisma.teacherAbsence.findFirst({ where: { id, schoolId } })
    if (!absence) { res.status(404).json({ message: 'Absence not found' }); return }
    if (!isAdmin && absence.teacherId !== req.user!.id) {
      res.status(403).json({ message: 'You do not have permission to perform this action' })
      return
    }

    await prisma.teacherAbsence.delete({ where: { id } })
    res.json({ message: 'Absence removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

async function listAbsences(schoolId: string, teacherId: string, from?: string, to?: string) {
  const absences = await prisma.teacherAbsence.findMany({
    where: {
      schoolId, teacherId,
      ...(from ? { date: { gte: from } } : {}),
      ...(to ? { date: { lte: to } } : {}),
    },
    include: { slot: { include: { subject: { select: { name: true, classLevel: true } } } } },
    orderBy: { date: 'desc' },
  })
  return absences.map(shapeAbsence)
}

export const getMyAbsences = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const from = req.query.from ? String(req.query.from) : undefined
    const to = req.query.to ? String(req.query.to) : undefined
    res.json({ absences: await listAbsences(schoolId, req.user!.id, from, to) })
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
    res.json({ absences: await listAbsences(schoolId, teacherId, from, to) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

/**
 * School closures — public holidays, mid-term breaks, anything that cancels teaching.
 *
 * Stored as named INCLUSIVE date ranges. Nothing here writes to attendance or hours: the
 * coverage maths reads these live and subtracts the affected periods, so declaring a holiday
 * after the fact retroactively corrects every total rather than needing a backfill.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parses "YYYY-MM-DD" as a UTC calendar day. The school year has no timezone of its own,
 *  and parsing as local time would shift a holiday a day either side of UTC. */
function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return Number.isNaN(date.getTime()) ? null : date
}

const shape = (h: { id: string; name: string; startDate: Date; endDate: Date; programme: string | null }) => ({
  id: h.id,
  name: h.name,
  // null = the whole school. Only universities currently have an evening sitting, so this
  // stays null everywhere else.
  programme: h.programme,
  startDate: h.startDate.toISOString().slice(0, 10),
  endDate: h.endDate.toISOString().slice(0, 10),
  // Inclusive of both ends, so a single-day holiday is 1 rather than 0.
  days: Math.round((Date.UTC(h.endDate.getUTCFullYear(), h.endDate.getUTCMonth(), h.endDate.getUTCDate())
    - Date.UTC(h.startDate.getUTCFullYear(), h.startDate.getUTCMonth(), h.startDate.getUTCDate())) / 86400000) + 1,
})

export const getHolidays = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const holidays = await prisma.schoolHoliday.findMany({
      where: { schoolId },
      orderBy: { startDate: 'asc' },
    })
    res.json({ holidays: holidays.map(shape) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/** Shared validation for create and update. */
function readBody(body: any): { name: string; startDate: Date; endDate: Date; programme: 'DAY' | 'EVENING' | null } | string {
  const name = String(body?.name ?? '').trim()
  if (!name) return 'A name is required'
  const startDate = parseDay(body?.startDate)
  const endDate = parseDay(body?.endDate)
  if (!startDate) return 'A valid start date (YYYY-MM-DD) is required'
  if (!endDate) return 'A valid end date (YYYY-MM-DD) is required'
  // A backwards range would silently subtract nothing, so it is rejected rather than stored
  // as a holiday that appears in the list but cancels no periods.
  if (endDate < startDate) return 'The end date cannot be before the start date'
  // Anything but DAY/EVENING means the whole school, which is the sane default for a value
  // that is simply absent.
  const raw = body?.programme
  const programme = raw === 'DAY' || raw === 'EVENING' ? raw : null
  return { name, startDate, endDate, programme }
}

export const createHoliday = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const parsed = readBody(req.body)
    if (typeof parsed === 'string') { res.status(400).json({ message: parsed }); return }

    const holiday = await prisma.schoolHoliday.create({ data: { schoolId, ...parsed } })
    res.status(201).json({ holiday: shape(holiday) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateHoliday = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const id = String(req.params.id)
    const parsed = readBody(req.body)
    if (typeof parsed === 'string') { res.status(400).json({ message: parsed }); return }

    // Scoped to the caller's school, so an id from another school cannot be edited.
    const existing = await prisma.schoolHoliday.findFirst({ where: { id, schoolId } })
    if (!existing) { res.status(404).json({ message: 'Holiday not found' }); return }

    const holiday = await prisma.schoolHoliday.update({ where: { id }, data: parsed })
    res.json({ holiday: shape(holiday) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteHoliday = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const id = String(req.params.id)
    const existing = await prisma.schoolHoliday.findFirst({ where: { id, schoolId } })
    if (!existing) { res.status(404).json({ message: 'Holiday not found' }); return }

    // Deleting simply puts those teaching days back: hours are derived, never stored, so
    // there is nothing to recompute or repair.
    await prisma.schoolHoliday.delete({ where: { id } })
    res.json({ message: 'Holiday removed' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

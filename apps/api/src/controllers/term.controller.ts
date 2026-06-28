import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

export const getCurrentTerm = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const term = await prisma.term.findFirst({ where: { schoolId, isCurrent: true } })
    if (!term) {
      res.status(404).json({ message: 'No current term set' })
      return
    }
    res.json({ term })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const getTerms = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const terms = await prisma.term.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' }
    })
    res.json({ terms })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createTerm = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, session, startDate, endDate } = req.body

    const term = await prisma.term.create({
      data: { schoolId, name, session, startDate: new Date(startDate), endDate: new Date(endDate) }
    })
    res.status(201).json({ message: 'Term created', term })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateTerm = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, session, startDate, endDate } = req.body

    const term = await prisma.term.findFirst({ where: { id, schoolId } })
    if (!term) {
      res.status(404).json({ message: 'Term not found' })
      return
    }

    const updated = await prisma.term.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(session ? { session } : {}),
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      }
    })
    res.json({ message: 'Term updated', term: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const setCurrentTerm = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    // Unset all current terms for this school
    await prisma.term.updateMany({ where: { schoolId }, data: { isCurrent: false } })

    // Set the selected one as current
    const term = await prisma.term.update({ where: { id }, data: { isCurrent: true } })
    res.json({ message: 'Current term updated', term })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/terms/end-year
 * Closes the current academic year:
 *  - Unsets isCurrent on all terms of the active session
 *  - If school.repeatThreshold is configured, computes each student's annual
 *    average across all published report cards in the session and writes
 *    decision = 'PASS' | 'REPEAT' on every one of those report cards.
 */
export const endAcademicYear = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!

    const currentTerms = await prisma.term.findMany({ where: { schoolId, isCurrent: true } })
    if (currentTerms.length === 0) {
      res.status(400).json({ message: 'No active academic year to end.' })
      return
    }
    const session = currentTerms[0].session

    // Unset isCurrent for all terms in this session
    await prisma.term.updateMany({ where: { schoolId, session }, data: { isCurrent: false } })

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { repeatThreshold: true } })
    let decisionsSet = 0

    if (school?.repeatThreshold != null) {
      const threshold = school.repeatThreshold

      // Load all report cards in the session (via term join)
      const termsInSession = await prisma.term.findMany({ where: { schoolId, session }, select: { id: true } })
      const termIds = termsInSession.map((t) => t.id)

      const cards = await prisma.reportCard.findMany({
        where: { schoolId, termId: { in: termIds }, average: { not: null } },
        select: { id: true, studentId: true, average: true },
      })

      // Compute per-student annual average (mean of their term averages)
      const byStudent = new Map<string, { ids: string[]; sum: number; count: number }>()
      for (const c of cards) {
        const entry = byStudent.get(c.studentId) ?? { ids: [], sum: 0, count: 0 }
        entry.ids.push(c.id)
        entry.sum += c.average!
        entry.count += 1
        byStudent.set(c.studentId, entry)
      }

      // Write decision on all report cards for each student
      for (const { ids, sum, count } of byStudent.values()) {
        const annualAvg = sum / count
        const decision = annualAvg >= threshold ? 'PASS' : 'REPEAT'
        await prisma.reportCard.updateMany({ where: { id: { in: ids } }, data: { decision } })
        decisionsSet += ids.length
      }
    }

    res.json({ session, termsEnded: currentTerms.length, decisionsSet })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * POST /api/terms/new-year
 * Creates a new academic year with its terms.
 * Body: { session: string, terms: [{ name, startDate, endDate }], setFirstCurrent?: boolean }
 * The first term is set as current when setFirstCurrent = true (default true).
 */
export const startNewAcademicYear = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { session, terms: termDefs, setFirstCurrent = true } = req.body

    if (!session || typeof session !== 'string') {
      res.status(400).json({ message: 'Session name is required (e.g. 2025/2026).' })
      return
    }
    if (!Array.isArray(termDefs) || termDefs.length === 0) {
      res.status(400).json({ message: 'At least one term is required.' })
      return
    }

    // Guard: ensure no term already exists for this session
    const existing = await prisma.term.findFirst({ where: { schoolId, session } })
    if (existing) {
      res.status(400).json({ message: `Session "${session}" already has terms. Edit them directly.` })
      return
    }

    // Guard: no active term should exist (year must be ended first)
    const activeTerm = await prisma.term.findFirst({ where: { schoolId, isCurrent: true } })
    if (activeTerm) {
      res.status(400).json({ message: `End the current academic year (${activeTerm.session}) before starting a new one.` })
      return
    }

    const created = await prisma.$transaction(
      termDefs.map((t: { name: string; startDate: string; endDate: string }, idx: number) =>
        prisma.term.create({
          data: {
            schoolId,
            name: t.name,
            session,
            startDate: new Date(t.startDate),
            endDate: new Date(t.endDate),
            isCurrent: setFirstCurrent && idx === 0,
          },
        }),
      ),
    )

    res.status(201).json({ session, terms: created })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteTerm = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const term = await prisma.term.findFirst({ where: { id, schoolId } })
    if (!term) {
      res.status(404).json({ message: 'Term not found' })
      return
    }

    await prisma.term.delete({ where: { id } })
    res.json({ message: 'Term deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

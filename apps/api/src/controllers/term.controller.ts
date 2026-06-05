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

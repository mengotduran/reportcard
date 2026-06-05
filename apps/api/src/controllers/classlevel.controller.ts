import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

export const getClassLevels = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const levels = await prisma.classLevel.findMany({
      where: { schoolId },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })
    res.json({ classLevels: levels })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const createClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { name, hasStream, order, maxScore } = req.body

    if (!name?.trim()) {
      res.status(400).json({ message: 'Class name is required' })
      return
    }

    const existing = await prisma.classLevel.findUnique({
      where: { schoolId_name: { schoolId, name: name.trim() } },
    })
    if (existing) {
      res.status(400).json({ message: 'A class with this name already exists' })
      return
    }

    const level = await prisma.classLevel.create({
      data: {
        schoolId, name: name.trim(),
        hasStream: hasStream ?? false,
        order: order ?? 0,
        maxScore: maxScore ? Number(maxScore) : 20,
      },
    })
    res.status(201).json({ message: 'Class created', classLevel: level })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const updateClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!
    const { name, hasStream, order, maxScore } = req.body

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) {
      res.status(404).json({ message: 'Class not found' })
      return
    }

    if (name?.trim() && name.trim() !== level.name) {
      const conflict = await prisma.classLevel.findUnique({
        where: { schoolId_name: { schoolId, name: name.trim() } },
      })
      if (conflict) {
        res.status(400).json({ message: 'A class with this name already exists' })
        return
      }
    }

    const updated = await prisma.classLevel.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(hasStream !== undefined ? { hasStream } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(maxScore !== undefined ? { maxScore: Number(maxScore) } : {}),
      },
    })
    res.json({ message: 'Class updated', classLevel: updated })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const deleteClassLevel = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id)
    const schoolId = req.user!.schoolId!

    const level = await prisma.classLevel.findFirst({ where: { id, schoolId } })
    if (!level) {
      res.status(404).json({ message: 'Class not found' })
      return
    }

    await prisma.classLevel.delete({ where: { id } })
    res.json({ message: 'Class deleted' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

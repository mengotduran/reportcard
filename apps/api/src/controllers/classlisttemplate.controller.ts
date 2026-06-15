import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

export const getClassListTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    let tpl = await prisma.classListTemplate.findUnique({ where: { schoolId } })
    if (!tpl) {
      tpl = await prisma.classListTemplate.create({ data: { schoolId, config: {} } })
    }
    res.json({ config: tpl.config })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const saveClassListTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { config } = req.body
    const tpl = await prisma.classListTemplate.upsert({
      where: { schoolId },
      create: { schoolId, config },
      update: { config },
    })
    res.json({ message: 'Class list design saved', config: tpl.config })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

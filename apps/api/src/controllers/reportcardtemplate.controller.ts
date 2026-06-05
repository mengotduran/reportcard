import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

export const getTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    let tpl = await prisma.reportCardTemplate.findUnique({ where: { schoolId } })
    if (!tpl) {
      tpl = await prisma.reportCardTemplate.create({ data: { schoolId, config: {} } })
    }
    res.json({ config: tpl.config })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const saveTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { config } = req.body
    const tpl = await prisma.reportCardTemplate.upsert({
      where: { schoolId },
      create: { schoolId, config },
      update: { config },
    })
    res.json({ message: 'Template saved', config: tpl.config })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'

const DEFAULT_RANGES = [
  { id: '1', minScore: 90, maxScore: 100, grade: 'A+', remark: 'Excellent',    color: '#15803d' },
  { id: '2', minScore: 75, maxScore: 89,  grade: 'A',  remark: 'Very Good',    color: '#16a34a' },
  { id: '3', minScore: 60, maxScore: 74,  grade: 'B',  remark: 'Good',         color: '#2563eb' },
  { id: '4', minScore: 50, maxScore: 59,  grade: 'C',  remark: 'Satisfactory', color: '#d97706' },
  { id: '5', minScore: 40, maxScore: 49,  grade: 'D',  remark: 'Pass',         color: '#ea580c' },
  { id: '6', minScore: 0,  maxScore: 39,  grade: 'F',  remark: 'Fail',         color: '#dc2626' },
]

export const getGradingScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    let scale = await prisma.gradingScale.findUnique({ where: { schoolId } })
    if (!scale) {
      scale = await prisma.gradingScale.create({ data: { schoolId, ranges: DEFAULT_RANGES } })
    }
    const ranges = (scale.ranges as any[]).length > 0 ? scale.ranges : DEFAULT_RANGES
    res.json({ ranges })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const saveGradingScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { ranges } = req.body
    const scale = await prisma.gradingScale.upsert({
      where: { schoolId },
      create: { schoolId, ranges },
      update: { ranges },
    })
    res.json({ message: 'Grading scale saved', ranges: scale.ranges })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

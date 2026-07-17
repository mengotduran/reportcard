import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { parseStoredScale } from '../utils/gradingScale'

const DEFAULT_RANGES = [
  { id: '1', minScore: 18, maxScore: 20, grade: 'A+', remark: 'Excellent',   color: '#15803d' },
  { id: '2', minScore: 16, maxScore: 18, grade: 'A',  remark: 'Very Good',   color: '#16a34a' },
  { id: '3', minScore: 14, maxScore: 16, grade: 'B',  remark: 'Good',        color: '#2563eb' },
  { id: '4', minScore: 12, maxScore: 14, grade: 'C',  remark: 'Fairly Good', color: '#ca8a04' },
  { id: '5', minScore: 10, maxScore: 12, grade: 'D',  remark: 'Average',     color: '#ea580c' },
  { id: '6', minScore: 0,  maxScore: 10, grade: 'F',  remark: 'Fail',        color: '#dc2626' },
]

const DEFAULT_UNIVERSITY_RANGES = [
  { id: 'u1', minScore: 80, maxScore: 100, grade: 'A',  remark: 'Excellent',   color: '#15803d', gradePoint: 4.0 },
  { id: 'u2', minScore: 70, maxScore: 79,  grade: 'B+', remark: 'Very Good',   color: '#2563eb', gradePoint: 3.5 },
  { id: 'u3', minScore: 60, maxScore: 69,  grade: 'B',  remark: 'Good',        color: '#3b82f6', gradePoint: 3.0 },
  { id: 'u4', minScore: 55, maxScore: 59,  grade: 'C+', remark: 'Fairly Good', color: '#0891b2', gradePoint: 2.5 },
  { id: 'u5', minScore: 50, maxScore: 54,  grade: 'C',  remark: 'Average',     color: '#ca8a04', gradePoint: 2.0 },
  { id: 'u6', minScore: 45, maxScore: 49,  grade: 'D',  remark: 'Poor',        color: '#ea580c', gradePoint: 1.0 },
  { id: 'u7', minScore: 0,  maxScore: 44,  grade: 'F',  remark: 'Fail',        color: '#dc2626', gradePoint: 0.0 },
]

const DEFAULT_CLASSIFICATION_BANDS = [
  { min: 3.60, max: 4.00, label: 'Distinction' },
  { min: 2.80, max: 3.59, label: 'Upper Credit' },
  { min: 2.40, max: 2.79, label: 'Lower Credit' },
  { min: 2.00, max: 2.39, label: 'Pass' },
  { min: 0.00, max: 1.99, label: 'Fail' },
]

// Old 0–100 percent scale (stale after the /20 switch for secondary schools only)
const isOldPercentScale = (ranges: any[]): boolean =>
  Array.isArray(ranges) && ranges.some(r => Number(r?.maxScore) > 20 || Number(r?.minScore) > 20)

// Stored value is either old array format or new { ranges, classificationBands, legendRows } object format
// Both storage shapes are handled in one place now (utils/gradingScale): this file had
// the only correct parser, and every other reader hand-rolled its own, which is how
// saveEntries came to ignore the school's scale entirely.
const parseStoredData = parseStoredScale

export const getGradingScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    const isUniversity = school?.type === 'UNIVERSITY'

    let scale = await prisma.gradingScale.findUnique({ where: { schoolId } })
    if (!scale) {
      const schoolExists = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } })
      if (!schoolExists) {
        const defRanges = isUniversity ? DEFAULT_UNIVERSITY_RANGES : DEFAULT_RANGES
        res.json({ ranges: defRanges, classificationBands: isUniversity ? DEFAULT_CLASSIFICATION_BANDS : [] })
        return
      }
      const defRanges = isUniversity ? DEFAULT_UNIVERSITY_RANGES : DEFAULT_RANGES
      scale = await prisma.gradingScale.create({ data: { schoolId, ranges: defRanges as any } })
    }

    const { ranges, classificationBands, legendRows } = parseStoredData(scale.ranges)

    // Auto-migrate stale percent scale for non-university schools only
    if (!isUniversity && ranges.length > 0 && isOldPercentScale(ranges)) {
      await prisma.gradingScale.update({ where: { schoolId }, data: { ranges: DEFAULT_RANGES as any } })
      res.json({ ranges: DEFAULT_RANGES, classificationBands: [], legendRows: [] })
      return
    }

    const defRanges = isUniversity ? DEFAULT_UNIVERSITY_RANGES : DEFAULT_RANGES
    const defBands = isUniversity ? DEFAULT_CLASSIFICATION_BANDS : []
    res.json({
      ranges: ranges.length > 0 ? ranges : defRanges,
      classificationBands: classificationBands.length > 0 ? classificationBands : defBands,
      legendRows,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const saveGradingScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const { ranges, classificationBands = [], legendRows = [] } = req.body
    const stored = { ranges, classificationBands, legendRows }
    const scale = await prisma.gradingScale.upsert({
      where: { schoolId },
      create: { schoolId, ranges: stored as any },
      update: { ranges: stored as any },
    })
    const parsed = parseStoredData(scale.ranges)
    res.json({ message: 'Grading scale saved', ranges: parsed.ranges, classificationBands: parsed.classificationBands, legendRows: parsed.legendRows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

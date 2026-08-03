import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { parseStoredScale, truePassCgpaFor } from '../utils/gradingScale'

const TRUE_PASS_MARK_NON_UNIVERSITY = 10

/** Same rule endAcademicYear uses: fixed 10/20 for non-university, otherwise the school's
 *  own classification "Pass" band lower bound. Computed here too so a save can be rejected
 *  if it would create a dead trial band. */
async function truePassMarkFor(schoolId: string, isUniversity: boolean): Promise<number> {
  if (!isUniversity) return TRUE_PASS_MARK_NON_UNIVERSITY
  const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId } })
  return truePassCgpaFor(parseStoredScale(gradingScale?.ranges))
}

export const getPromotionScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    const isUniversity = school?.type === 'UNIVERSITY'

    const scale = await prisma.promotionScale.findUnique({ where: { schoolId } })
    const truePassMark = await truePassMarkFor(schoolId, isUniversity)

    res.json({
      trialMinimum: scale?.trialMinimum ?? null,
      passLabel: scale?.passLabel ?? 'Pass',
      trialLabel: scale?.trialLabel ?? 'This student was promoted on trial',
      repeatLabel: scale?.repeatLabel ?? 'Repeat',
      truePassMark,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

export const savePromotionScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })
    const isUniversity = school?.type === 'UNIVERSITY'

    const { trialMinimum, passLabel, trialLabel, repeatLabel } = req.body
    const parsedTrialMinimum = trialMinimum === null || trialMinimum === undefined || trialMinimum === '' ? null : Number(trialMinimum)
    if (parsedTrialMinimum !== null && !Number.isFinite(parsedTrialMinimum)) {
      res.status(400).json({ message: 'Minimum must be a number' })
      return
    }

    if (parsedTrialMinimum !== null) {
      const truePassMark = await truePassMarkFor(schoolId, isUniversity)
      if (parsedTrialMinimum >= truePassMark) {
        res.status(400).json({
          message: `The trial minimum must be below the real pass mark (${truePassMark}) or it would never apply.`,
        })
        return
      }
    }

    const scale = await prisma.promotionScale.upsert({
      where: { schoolId },
      create: {
        schoolId,
        trialMinimum: parsedTrialMinimum,
        passLabel: passLabel?.trim() || 'Pass',
        trialLabel: trialLabel?.trim() || 'This student was promoted on trial',
        repeatLabel: repeatLabel?.trim() || 'Repeat',
      },
      update: {
        trialMinimum: parsedTrialMinimum,
        passLabel: passLabel?.trim() || 'Pass',
        trialLabel: trialLabel?.trim() || 'This student was promoted on trial',
        repeatLabel: repeatLabel?.trim() || 'Repeat',
      },
    })

    res.json({
      message: 'Promotion scale saved',
      trialMinimum: scale.trialMinimum,
      passLabel: scale.passLabel,
      trialLabel: scale.trialLabel,
      repeatLabel: scale.repeatLabel,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Server error' })
  }
}

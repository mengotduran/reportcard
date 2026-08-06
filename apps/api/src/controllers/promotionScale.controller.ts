import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import { parseStoredScale, truePassCgpaFor } from '../utils/gradingScale'

const TRUE_PASS_MARK_SECONDARY = 10 // out of 20
// Out of 100 — the same fixed pass mark as secondary's 10/20, scaled to primary's raw
// Test+Exam scale (see reportcard.controller.ts saveEntries). Not derived from the
// school's own grading scale: primary has no classificationBands (university-only), and
// this fixed-and-not-editable design is deliberate, same as secondary's.
const TRUE_PASS_MARK_PRIMARY = 50

/** Same rule endAcademicYear uses: a fixed mark for primary/secondary (10/20, 50/100),
 *  otherwise the school's own classification "Pass" band lower bound (university).
 *  Computed here too so a save can be rejected if it would create a dead trial band. */
async function truePassMarkFor(schoolId: string, schoolType: string | undefined): Promise<number> {
  if (schoolType === 'PRIMARY') return TRUE_PASS_MARK_PRIMARY
  if (schoolType !== 'UNIVERSITY') return TRUE_PASS_MARK_SECONDARY
  const gradingScale = await prisma.gradingScale.findUnique({ where: { schoolId } })
  return truePassCgpaFor(parseStoredScale(gradingScale?.ranges))
}

export const getPromotionScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } })

    const scale = await prisma.promotionScale.findUnique({ where: { schoolId } })
    const truePassMark = await truePassMarkFor(schoolId, school?.type)

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

    const { trialMinimum, passLabel, trialLabel, repeatLabel } = req.body
    const parsedTrialMinimum = trialMinimum === null || trialMinimum === undefined || trialMinimum === '' ? null : Number(trialMinimum)
    if (parsedTrialMinimum !== null && !Number.isFinite(parsedTrialMinimum)) {
      res.status(400).json({ message: 'Minimum must be a number' })
      return
    }

    if (parsedTrialMinimum !== null) {
      const truePassMark = await truePassMarkFor(schoolId, school?.type)
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

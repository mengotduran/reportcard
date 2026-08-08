import { Response } from 'express'
import prisma from '../config/prisma'
import { AuthRequest } from '../middleware/auth'
import {
  CompetencyLevel,
  DEFAULT_COMPETENCY_LEVELS,
  levelsOrDefault,
  parseStoredLevels,
} from '../utils/competency'
import { frozenCompetencyClass } from '../utils/scaleFreeze'

/** A scale with one level cannot express anything; the picker would offer a single button. */
const MIN_LEVELS = 2
/** Past this the picker stops being a row of chips and the print column stops fitting. */
const MAX_LEVELS = 6

/**
 * The rating levels this school's COMPETENCY classes are assessed on.
 *
 * Unlike getGradingScale, this does NOT create a row on read. A school that has never
 * customised its scale keeps no row at all and is served the defaults — which means the
 * defaults can be improved later and reach every such school, and it keeps the table empty
 * for the overwhelming majority of schools that will never touch this.
 */
export const getCompetencyScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!
    const [row, frozenBy] = await Promise.all([
      prisma.competencyScale.findUnique({ where: { schoolId } }),
      frozenCompetencyClass(schoolId),
    ])
    res.json({
      levels: levelsOrDefault(row?.levels),
      // True when these are the built-ins rather than the school's own, so the editor can
      // say "you are using the standard scale" rather than implying someone chose it.
      isDefault: parseStoredLevels(row?.levels).length === 0,
      // Non-null means the editor must be read-only and say which class and term settled it.
      frozenBy: frozenBy ? { className: frozenBy.className, termName: frozenBy.termName } : null,
      limits: { min: MIN_LEVELS, max: MAX_LEVELS },
    })
  } catch (err) {
    console.error('getCompetencyScale error:', err)
    res.status(500).json({ message: 'Server error' })
  }
}

export const saveCompetencyScale = async (req: AuthRequest, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!

    // Same rule the class form uses for mark ceilings and gradingMode: once a rated class has
    // published cards for a closed term of this session, the wording is settled for the year.
    // Renaming now would leave the remaining terms of that class using different words from
    // the ones already sent home, on cards that sit side by side in the same folder.
    const frozenBy = await frozenCompetencyClass(schoolId)
    if (frozenBy) {
      res.status(403).json({
        message: `Report cards for ${frozenBy.className} have already been published for ${frozenBy.termName}, so the rating levels cannot change until the next academic year.`,
      })
      return
    }

    const incoming = parseStoredLevels(req.body?.levels)
    if (incoming.length < MIN_LEVELS || incoming.length > MAX_LEVELS) {
      res.status(400).json({ message: `A rating scale needs between ${MIN_LEVELS} and ${MAX_LEVELS} levels.` })
      return
    }
    // The English label is the stored value, so duplicates would make two levels
    // indistinguishable on an entry — and the picker would set an ambiguous rating.
    const seen = new Set<string>()
    for (const l of incoming) {
      const key = l.labelEn.toLowerCase()
      if (seen.has(key)) {
        res.status(400).json({ message: `"${l.labelEn}" is listed twice. Each level needs its own name.` })
        return
      }
      seen.add(key)
    }

    // Resetting to the built-ins deletes the row rather than storing a copy of them, so the
    // school goes back to tracking the defaults instead of pinning today's version of them.
    if (req.body?.reset === true) {
      await prisma.competencyScale.deleteMany({ where: { schoolId } })
      res.json({ levels: DEFAULT_COMPETENCY_LEVELS, isDefault: true, frozenBy: null, limits: { min: MIN_LEVELS, max: MAX_LEVELS } })
      return
    }

    const levels = incoming as unknown as object[]
    const saved = await prisma.competencyScale.upsert({
      where: { schoolId },
      create: { schoolId, levels: levels as any },
      update: { levels: levels as any },
    })
    res.json({
      levels: levelsOrDefault(saved.levels),
      isDefault: false,
      frozenBy: null,
      limits: { min: MIN_LEVELS, max: MAX_LEVELS },
    })
  } catch (err) {
    console.error('saveCompetencyScale error:', err)
    res.status(500).json({ message: 'Server error' })
  }
}

/** Shared by the marks-entry validation: the levels in force for a school, already parsed. */
export async function levelsForSchool(schoolId: string): Promise<CompetencyLevel[]> {
  const row = await prisma.competencyScale.findUnique({ where: { schoolId } })
  return levelsOrDefault(row?.levels)
}

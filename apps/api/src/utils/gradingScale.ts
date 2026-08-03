/**
 * The school's grading scale is stored in ONE json column in two shapes:
 *
 *   legacy : [ {minScore, maxScore, grade, remark, …}, … ]          (a bare array)
 *   current: { ranges: [...], classificationBands: [...], legendRows: [...] }
 *
 * `saveGradingScale` always writes the CURRENT shape, so any school that has touched its
 * scale since that change is an object, while untouched schools are still arrays. Every
 * reader must therefore handle both.
 *
 * This exists because reading the column directly is a trap that already bit: saveEntries
 * did `ranges = gradingScale.ranges` and then tested `ranges.length`, which is undefined
 * for the object shape. It silently fell back to the built-in default scale, so a school's
 * own grades and remarks were ignored, and `.some()` on that object would have thrown for
 * a non-university school outright. Parse through here, never by hand.
 */
export interface StoredRange {
  minScore: number
  maxScore: number
  grade?: string
  remark: string
  color?: string
  gradePoint?: number
  /** Lets a school fail a passing-looking letter (CITEC juries D as FAIL), so it outranks
   *  the grade letter wherever a pass/fail question is asked. */
  juryDecision?: string
}

export interface ParsedScale {
  ranges: StoredRange[]
  classificationBands: { min: number; max: number; label: string }[]
  legendRows: { abbr: string; meaning: string }[]
}

/** Bottom edge of the school's lowest PASSING classification band — the real CGPA a
 *  student must clear to pass, independent of a school's own admin-editable trial threshold
 *  (see PromotionScale). Bands literally labeled "Fail" are excluded before taking the
 *  minimum — DEFAULT_CLASSIFICATION_BANDS (and most schools' own scales) include an explicit
 *  Fail band down to 0, so a naive Math.min over every band's min would always return 0.
 *  Empty classificationBands, or every band excluded (all labeled Fail — degenerate, but
 *  possible), falls back to 2.00, matching DEFAULT_CLASSIFICATION_BANDS' own Pass band and
 *  the identical fallback already used in excelTemplate.controller.ts. */
export function truePassCgpaFor(parsed: Pick<ParsedScale, 'classificationBands'>): number {
  const passing = parsed.classificationBands.filter((b) => b.label.trim().toLowerCase() !== 'fail')
  if (passing.length === 0) return 2.00
  return Math.min(...passing.map((b) => b.min))
}

export function parseStoredScale(raw: unknown): ParsedScale {
  if (Array.isArray(raw)) return { ranges: raw as StoredRange[], classificationBands: [], legendRows: [] }
  if (raw && typeof raw === 'object') {
    const o = raw as { ranges?: unknown; classificationBands?: unknown; legendRows?: unknown }
    if (Array.isArray(o.ranges)) {
      return {
        ranges: o.ranges as StoredRange[],
        classificationBands: (Array.isArray(o.classificationBands) ? o.classificationBands : []) as ParsedScale['classificationBands'],
        legendRows: (Array.isArray(o.legendRows) ? o.legendRows : []) as ParsedScale['legendRows'],
      }
    }
  }
  return { ranges: [], classificationBands: [], legendRows: [] }
}

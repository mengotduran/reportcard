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

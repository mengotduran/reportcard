/**
 * Nursery / pre-primary assessment, client side.
 *
 * Mirrors `apps/api/src/utils/competency.ts` — a class whose gradingMode is COMPETENCY
 * carries a developmental RATING per subject instead of a mark, and its report card has
 * no total, no average and no position.
 *
 * The rating is stored in the entry's `grade` as the ENGLISH label verbatim, which is why
 * these strings are the values sent and received. Translation happens here, at display
 * time, through the same t() path as everything else — never in storage, so a French
 * section reads French wording over the same stored rows.
 */
export const COMPETENCY_RATINGS = ['Attained', 'Developing', 'Not Yet Attained'] as const

export type CompetencyRating = (typeof COMPETENCY_RATINGS)[number]

export function isCompetencyRating(value: unknown): value is CompetencyRating {
  return typeof value === 'string' && (COMPETENCY_RATINGS as readonly string[]).includes(value)
}

/** Short form for narrow columns (a report card's subject table, a phone screen). */
export const RATING_SHORT: Record<CompetencyRating, string> = {
  'Attained': 'A',
  'Developing': 'D',
  'Not Yet Attained': 'NY',
}

/** Deliberately the same green / amber / red reading the grading scale uses elsewhere. */
export const RATING_COLORS: Record<CompetencyRating, { bg: string; text: string; border: string }> = {
  'Attained':        { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  'Developing':      { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  'Not Yet Attained':{ bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
}

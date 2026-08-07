/**
 * Nursery / pre-primary assessment, mobile side.
 *
 * Mirrors `apps/api/src/utils/competency.ts` and `apps/web/lib/competency.ts` — a class
 * whose gradingMode is COMPETENCY carries a developmental RATING per subject instead of a
 * mark, and its report card has no total, no average and no position.
 *
 * The rating is stored in the entry's `grade` as the ENGLISH label verbatim, so these
 * strings are what goes over the wire. Translation happens at display time through t().
 */
export const COMPETENCY_RATINGS = ['Attained', 'Developing', 'Not Yet Attained'] as const

export type CompetencyRating = (typeof COMPETENCY_RATINGS)[number]

export function isCompetencyRating(value: unknown): value is CompetencyRating {
  return typeof value === 'string' && (COMPETENCY_RATINGS as readonly string[]).includes(value)
}

/** The same green / amber / red the grading scale reads with elsewhere in the app. */
export const RATING_COLORS: Record<CompetencyRating, string> = {
  'Attained': '#15803d',
  'Developing': '#b45309',
  'Not Yet Attained': '#b91c1c',
}

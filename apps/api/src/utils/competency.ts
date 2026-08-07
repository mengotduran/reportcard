/**
 * Nursery / pre-primary assessment.
 *
 * A class whose `ClassLevel.gradingMode` is COMPETENCY is not marked out of anything. Each
 * subject carries a developmental RATING instead of a score, and the report card has no
 * total, no average and no position — ranking three-year-olds is precisely what this mode
 * exists to avoid.
 *
 * The rating is stored in `ReportEntry.grade`, verbatim, as one of the strings below.
 * Deliberately the human-readable label rather than a code:
 *   - every report card template already resolves and prints the `grade` column, so a
 *     competency card renders correctly with no template plumbing and no lookup table;
 *   - there is no second mapping layer to drift out of sync with this one.
 * Translation happens at DISPLAY time through the normal i18n `t()` path, never in storage,
 * so a French section shows French wording over the same stored rows.
 *
 * `score`, `seq1Score` and `seq2Score` stay NULL on a competency entry — that is what keeps
 * the average, the total and the class position empty without any of the arithmetic having
 * to know this mode exists (a null score is already "not marked" everywhere).
 *
 * The set is fixed, not school-configurable (product decision, 2026-08-07). If that ever
 * changes it becomes a stored scale like GradingScale, and these become its default rows.
 */
export const COMPETENCY_RATINGS = ['Attained', 'Developing', 'Not Yet Attained'] as const

export type CompetencyRating = (typeof COMPETENCY_RATINGS)[number]

/** Highest first — the order rating pickers and report card legends should present. */
export function isCompetencyRating(value: unknown): value is CompetencyRating {
  return typeof value === 'string' && (COMPETENCY_RATINGS as readonly string[]).includes(value)
}

/**
 * A numeric mark expressed as a rating, for converting historic numeric nursery cards.
 * Percentage-based so it is independent of whatever `maxScore` the class was marked on.
 * Only used by the one-off migration — live competency entries are never derived from a
 * score, they are what the teacher actually selected.
 */
export function ratingFromPercentage(pct: number): CompetencyRating {
  if (pct >= 70) return 'Attained'
  if (pct >= 50) return 'Developing'
  return 'Not Yet Attained'
}

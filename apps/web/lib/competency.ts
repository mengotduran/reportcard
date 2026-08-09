/**
 * Nursery / pre-primary assessment, client side.
 *
 * Mirrors `apps/api/src/utils/competency.ts` — a class whose gradingMode is COMPETENCY
 * carries a developmental RATING per subject instead of a mark, and its report card has
 * no total, no average and no position.
 *
 * The levels are now PER SCHOOL (`GET /competency-scale`), 2 to 6 of them. The constants
 * below are the built-in defaults, served to any school that has never customised its
 * scale — which is most of them, so these stay the common path.
 *
 * The rating is stored in the entry's `grade` as the ENGLISH label verbatim. Two
 * consequences that every caller has to respect:
 *
 *  - **A stored rating may not be in the school's current set.** Renaming a level is not
 *    retroactive by design: an issued card keeps the word it was printed with. Resolve a
 *    stored value with `findLevel`, never by testing membership of the live scale.
 *  - **Custom labels cannot be translated.** t() only knows the three built-in English
 *    strings, so a level carries its own labelEn/labelFr and `levelLabel` picks by section
 *    language. Only fall back to t() for the built-ins.
 */

export interface CompetencyLevel {
  id: string
  labelEn: string
  labelFr: string
  short: string
  color: string
}

/** The built-in scale. Kept as the exact wording and colours that already-issued cards
 *  were printed with, so a school that never customises sees no change at all. */
export const DEFAULT_COMPETENCY_LEVELS: CompetencyLevel[] = [
  { id: 'attained',   labelEn: 'Attained',         labelFr: 'Acquis',                 short: 'A',  color: '#15803d' },
  { id: 'developing', labelEn: 'Developing',       labelFr: "En cours d'acquisition", short: 'D',  color: '#b45309' },
  { id: 'not_yet',    labelEn: 'Not Yet Attained', labelFr: 'Non acquis',             short: 'NY', color: '#b91c1c' },
]

/** Legacy label list. Still the right answer for a school on the defaults, and still what
 *  the built-in i18n entries are keyed on. */
export const COMPETENCY_RATINGS = DEFAULT_COMPETENCY_LEVELS.map(l => l.labelEn)

export type CompetencyRating = string

/** Backwards-compatible membership test against the BUILT-INS. Use only where no school
 *  scale is available; prefer findLevel/isRatingIn, which understand a custom scale. */
export function isCompetencyRating(value: unknown): value is CompetencyRating {
  return typeof value === 'string' && COMPETENCY_RATINGS.includes(value)
}

export function isRatingIn(levels: CompetencyLevel[], value: unknown): boolean {
  return typeof value === 'string' && levels.some(l => l.labelEn === value)
}

/**
 * Resolve a stored rating for display against the levels in force.
 *
 * Returns null when the value is not a rating at all (a letter grade, or empty). A rating
 * the school no longer lists still resolves — to its own wording in a neutral colour — so a
 * card issued under an older scale prints what it always printed instead of vanishing.
 */
export function findLevel(levels: CompetencyLevel[], value: unknown): CompetencyLevel | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const hit = levels.find(l => l.labelEn === value)
  if (hit) return hit
  const legacy = DEFAULT_COMPETENCY_LEVELS.find(l => l.labelEn === value)
  if (legacy) return { ...legacy, color: '#475569' }
  return null
}

/** The wording to show. A built-in goes through t() so existing translations keep working
 *  (including any language beyond EN/FR); a custom level uses its own stored pair. */
export function levelLabel(
  level: CompetencyLevel,
  lang: 'EN' | 'FR',
  t?: (s: string) => string
): string {
  const isBuiltIn = DEFAULT_COMPETENCY_LEVELS.some(d => d.labelEn === level.labelEn)
  if (isBuiltIn && t) return t(level.labelEn)
  return lang === 'FR' ? (level.labelFr || level.labelEn) : level.labelEn
}

/**
 * Chip colours derived from the level's single stored colour.
 *
 * The built-ins previously carried a hand-picked bg/text/border triple each; a custom level
 * only stores one colour, so the tint and border are mixed from it with alpha rather than
 * asking an admin to choose three. `18`/`55` are the same hex alphas the report card screens
 * already use for grade pills, so a default scale still reads as it did.
 */
export function ratingChipColors(level: CompetencyLevel): { bg: string; text: string; border: string } {
  return { bg: `${level.color}18`, text: level.color, border: `${level.color}55` }
}

/** Short form for narrow columns. */
export const RATING_SHORT: Record<string, string> = Object.fromEntries(
  DEFAULT_COMPETENCY_LEVELS.map(l => [l.labelEn, l.short])
)

/** Retained for callers still keyed on the built-in labels. */
export const RATING_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Attained':         { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  'Developing':       { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  'Not Yet Attained': { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
}

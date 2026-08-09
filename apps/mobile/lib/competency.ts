/**
 * Nursery / pre-primary assessment, mobile side.
 *
 * Mirrors `apps/api/src/utils/competency.ts` and `apps/web/lib/competency.ts` — a class
 * whose gradingMode is COMPETENCY carries a developmental RATING per subject instead of a
 * mark, and its report card has no total, no average and no position.
 *
 * The levels are PER SCHOOL (`GET /competency-scale`), 2 to 6 of them. The constants below
 * are the built-in defaults, served to any school that has never customised its scale.
 *
 * The rating is stored in the entry's `grade` as the ENGLISH label verbatim. Two
 * consequences every caller has to respect:
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

export const DEFAULT_COMPETENCY_LEVELS: CompetencyLevel[] = [
  { id: 'attained',   labelEn: 'Attained',         labelFr: 'Acquis',                 short: 'A',  color: '#15803d' },
  { id: 'developing', labelEn: 'Developing',       labelFr: "En cours d'acquisition", short: 'D',  color: '#b45309' },
  { id: 'not_yet',    labelEn: 'Not Yet Attained', labelFr: 'Non acquis',             short: 'NY', color: '#b91c1c' },
]

export const COMPETENCY_RATINGS = DEFAULT_COMPETENCY_LEVELS.map(l => l.labelEn)

export type CompetencyRating = string

/** Membership test against the BUILT-INS. Use only where no school scale is available. */
export function isCompetencyRating(value: unknown): value is CompetencyRating {
  return typeof value === 'string' && COMPETENCY_RATINGS.includes(value)
}

export function isRatingIn(levels: CompetencyLevel[], value: unknown): boolean {
  return typeof value === 'string' && levels.some(l => l.labelEn === value)
}

/**
 * Resolve a stored rating for display against the levels in force. Returns null when the
 * value is not a rating at all. A rating the school no longer lists still resolves, to its
 * own wording in a neutral colour, so a card issued under an older scale keeps its meaning.
 */
export function findLevel(levels: CompetencyLevel[], value: unknown): CompetencyLevel | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const hit = levels.find(l => l.labelEn === value)
  if (hit) return hit
  const legacy = DEFAULT_COMPETENCY_LEVELS.find(l => l.labelEn === value)
  if (legacy) return { ...legacy, color: '#475569' }
  return null
}

/** A built-in goes through t() so existing translations keep working; a custom level uses
 *  its own stored pair. */
export function levelLabel(
  level: CompetencyLevel,
  lang: 'EN' | 'FR',
  t?: (s: string) => string
): string {
  const isBuiltIn = DEFAULT_COMPETENCY_LEVELS.some(d => d.labelEn === level.labelEn)
  if (isBuiltIn && t) return t(level.labelEn)
  return lang === 'FR' ? (level.labelFr || level.labelEn) : level.labelEn
}

/** Retained for callers still keyed on the built-in labels. Mobile stores ONE colour per
 *  rating (chips tint it with an alpha suffix at the call site), unlike web's triple. */
export const RATING_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_COMPETENCY_LEVELS.map(l => [l.labelEn, l.color])
)

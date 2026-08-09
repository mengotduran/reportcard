/**
 * Nursery / pre-primary assessment.
 *
 * A class whose `ClassLevel.gradingMode` is COMPETENCY is not marked out of anything. Each
 * subject carries a developmental RATING instead of a score, and the report card has no
 * total, no average and no position — ranking three-year-olds is precisely what this mode
 * exists to avoid.
 *
 * The rating is stored in `ReportEntry.grade`, verbatim, as the level's ENGLISH label.
 * Deliberately the human-readable label rather than a code:
 *   - every report card template already resolves and prints the `grade` column, so a
 *     competency card renders correctly with no template plumbing and no lookup table;
 *   - there is no second mapping layer to drift out of sync with this one;
 *   - and it makes an issued card self-describing. A card printed last term keeps the exact
 *     word it was printed with even if the school later renames its scale, because the word
 *     IS the stored value. That is the property the whole design leans on, and it is why
 *     renaming a level is safe rather than retroactive.
 *
 * The consequence of that last point, which every reader must handle: a stored rating may be
 * a label the school NO LONGER has. Never assume `grade` is in the current set — resolve it
 * with `findLevel`, which falls back to rendering the stored text as-is.
 *
 * `score`, `seq1Score` and `seq2Score` stay NULL on a competency entry — that is what keeps
 * the average, the total and the class position empty without any of the arithmetic having
 * to know this mode exists (a null score is already "not marked" everywhere).
 */

export interface CompetencyLevel {
  /** Stable per-row id. Not stored on entries — the label is. Used only for React keys
   *  and for matching rows across an edit in the designer. */
  id: string
  /** What lands in `ReportEntry.grade`. The English label is the canonical stored form,
   *  in every school, so a French section still stores "Attained" and displays "Acquis". */
  labelEn: string
  labelFr: string
  /** For narrow columns (a print table, a phone screen). */
  short: string
  color: string
}

/**
 * Used by any school that has not customised its scale. These are the three that were
 * hardcoded before scales became per-school, so an existing school keeps exactly the wording
 * and colours its already-issued cards were printed with.
 *
 * Ordered highest attainment first — the order pickers and legends present.
 */
export const DEFAULT_COMPETENCY_LEVELS: CompetencyLevel[] = [
  { id: 'attained',   labelEn: 'Attained',         labelFr: 'Acquis',                   short: 'A',  color: '#15803d' },
  { id: 'developing', labelEn: 'Developing',       labelFr: "En cours d'acquisition",   short: 'D',  color: '#b45309' },
  { id: 'not_yet',    labelEn: 'Not Yet Attained', labelFr: 'Non acquis',               short: 'NY', color: '#b91c1c' },
]

/** Legacy shape: the plain label list. Kept because callers that predate per-school scales
 *  still expect it, and because it is the correct answer for a school with no scale row. */
export const COMPETENCY_RATINGS = DEFAULT_COMPETENCY_LEVELS.map(l => l.labelEn)

export type CompetencyRating = string

/**
 * Read `CompetencyScale.levels` into a usable array.
 *
 * Defensive on purpose. The column's SQLite default is what Prisma emits for
 * `@default("[]")` — `DEFAULT []`, which SQLite parses as a quoted identifier and stores as
 * an EMPTY STRING, not as `[]`. (Same is true of `School.coverImages` and
 * `User.departments`.) So a row written without an explicit value reads back as `''`, and
 * `JSON.parse('')` throws. Anything unusable here means "not customised", which is exactly
 * the case the defaults exist for.
 */
export function parseStoredLevels(raw: unknown): CompetencyLevel[] {
  let value: unknown = raw
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return []
    try { value = JSON.parse(trimmed) } catch { return [] }
  }
  if (!Array.isArray(value)) return []
  const levels: CompetencyLevel[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const labelEn = typeof r.labelEn === 'string' ? r.labelEn.trim() : ''
    if (labelEn === '') continue // the stored form; a level without one cannot be saved on an entry
    const labelFr = typeof r.labelFr === 'string' && r.labelFr.trim() !== '' ? r.labelFr.trim() : labelEn
    levels.push({
      id: typeof r.id === 'string' && r.id !== '' ? r.id : `lvl_${levels.length}`,
      labelEn,
      labelFr,
      short: typeof r.short === 'string' && r.short.trim() !== '' ? r.short.trim() : labelEn.slice(0, 2).toUpperCase(),
      color: typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#475569',
    })
  }
  return levels
}

/** The levels actually in force: the school's own, or the built-in defaults. */
export function levelsOrDefault(raw: unknown): CompetencyLevel[] {
  const parsed = parseStoredLevels(raw)
  return parsed.length > 0 ? parsed : DEFAULT_COMPETENCY_LEVELS
}

/** Every valid stored value for these levels. */
export function ratingLabels(levels: CompetencyLevel[]): string[] {
  return levels.map(l => l.labelEn)
}

/** Is `value` a rating THIS school currently offers? Use when validating what a teacher
 *  just submitted. For deciding how to DISPLAY an already-stored value, use findLevel —
 *  a historic rating is legitimate even once it leaves the school's set. */
export function isRatingIn(levels: CompetencyLevel[], value: unknown): boolean {
  return typeof value === 'string' && ratingLabels(levels).includes(value)
}

/**
 * Resolve a stored rating for display. Returns null when the value is not a rating at all
 * (a letter grade, or empty), and a synthesised level when it is a rating the school no
 * longer lists — so a card issued under an older scale still prints its own wording, in a
 * neutral colour, instead of disappearing.
 */
export function findLevel(levels: CompetencyLevel[], value: unknown): CompetencyLevel | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const hit = levels.find(l => l.labelEn === value)
  if (hit) return hit
  const legacy = DEFAULT_COMPETENCY_LEVELS.find(l => l.labelEn === value)
  if (legacy) return { ...legacy, color: '#475569' }
  return null
}

/** Backwards-compatible check against the built-in defaults, for the callers that have no
 *  school scale to hand. Prefer isRatingIn/findLevel wherever the school IS known. */
export function isCompetencyRating(value: unknown): value is CompetencyRating {
  return typeof value === 'string' && COMPETENCY_RATINGS.includes(value)
}

/**
 * A numeric mark expressed as a rating, for converting historic numeric nursery cards.
 * Percentage-based so it is independent of whatever `maxScore` the class was marked on.
 * Targets the DEFAULT scale only: it exists for the one-off migration of cards that predate
 * competency mode, which by definition predate any custom scale. Live competency entries are
 * never derived from a score — they are what the teacher actually selected.
 */
export function ratingFromPercentage(pct: number): CompetencyRating {
  if (pct >= 70) return 'Attained'
  if (pct >= 50) return 'Developing'
  return 'Not Yet Attained'
}

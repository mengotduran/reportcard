// Day / Evening section of a class, mobile side. Mirrors `apps/web/lib/programme.ts`, which
// carries the full reasoning; the short version:
//
// A class is in the evening SECTION because it is a separate intake with its own students,
// not because of the hour it is taught. The school's own example: Level 3 (Degree) runs in
// the evening by the clock but follows the day curriculum, so it is a DAY class.
//
// The name carries an "(Evening)" marker only because classes are referenced BY NAME
// (`Student.classLevel`, `Subject.classLevel` are strings, not foreign keys) and ClassLevel
// is unique on (schoolId, name). Two sittings sharing a name would silently merge the two
// cohorts in every query. `ClassLevel.programme` is what MEANS the section.
//
// USER RULE: "Evening" is an internal section and must never reach a report card ("the
// evening is just that you are in evening section"). Strip it wherever a class name is
// shown to a student or printed.

export type Programme = 'DAY' | 'EVENING'

const EVENING_TOKEN = '(Evening)'

/** Remove the sitting marker from a class name. Safe on any name: one without a marker comes
 *  back unchanged, and a secondary department suffix like " (Technical)" is left alone. */
export function stripProgrammeSuffix<T extends string | null | undefined>(name: T): T {
  if (!name) return name
  return name.replace(/\s*\(Evening\)/gi, '').replace(/\s{2,}/g, ' ').trim() as T
}

/** The stored name for a class in a given section. Day names are untouched. */
export function withProgrammeSuffix(name: string, programme: Programme | undefined): string {
  const base = stripProgrammeSuffix(name)
  return programme === 'EVENING' ? `${base} ${EVENING_TOKEN}` : base
}

/** Read the section back off a stored name. Only a fallback for the places that hold a class
 *  NAME but not the class row; `ClassLevel.programme` is the source of truth. */
export function programmeFromName(name: string): Programme {
  return /\(Evening\)/i.test(name ?? '') ? 'EVENING' : 'DAY'
}

export const PROGRAMME_LABELS: Record<Programme, string> = {
  DAY: 'Day',
  EVENING: 'Evening',
}

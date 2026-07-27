// Which SECTION of the school a class belongs to: the day section or the evening section.
//
// This is not the time of day, and the difference matters. A class is in the evening
// section because it is a separate intake with its own students following the evening
// programme, not because of when it is taught. The school's own example: Level 3 (Degree)
// is taught in the evening by the clock, but it follows the day curriculum and continues
// from Level 2 day, so it is a DAY class. Only Level 1 and Level 2 Evening are the evening
// section (user, 2026-07-26: "it's day just it's in the evening but it follows the day
// school curriculum. level 1 and 2 evening fall under evening section").
//
// A university runs the same programme twice over, same lecturers, different students:
// "HND Nursing - Level 1" in the day section and again in the evening section. Each is its
// own ClassLevel row so students, marks, positions and fees stay separate.
//
// That forces a marker into the class NAME, and it is worth being clear why, because the
// name is not where this information belongs. Classes are referenced by name throughout the
// app (`Student.classLevel` and `Subject.classLevel` are strings, not foreign keys) and
// ClassLevel is unique on (schoolId, name). Two sittings sharing one name would make every
// student and course query mix the two cohorts together, silently. Until class references
// become real foreign keys, the name has to carry the distinction.
//
// `ClassLevel.programme` is the field that MEANS it, and is what grouping, filtering and
// (later) period structures read. The name marker exists purely to keep names unique.
//
// USER RULE: "Evening" is an internal section, not something a student's report card
// announces ("the evening is just that you are in evening section"). It must never reach a
// printed document. So the marker is stripped wherever a class name is displayed, and
// always before printing.

export type Programme = 'DAY' | 'EVENING'

const EVENING_TOKEN = '(Evening)'

/** Remove the sitting marker from a class name, wherever it sits, and tidy the spacing it
 *  leaves behind. Safe to call on any name: one without a marker comes back unchanged, and
 *  a secondary department suffix like " (Technical)" is deliberately left alone. */
export function stripProgrammeSuffix<T extends string | null | undefined>(name: T): T {
  if (!name) return name
  return name.replace(/\s*\(Evening\)/gi, '').replace(/\s{2,}/g, ' ').trim() as T
}

/** The stored name for a class in a given section. Day names are untouched, so every school
 *  without an evening programme keeps exactly the names it already has. */
export function withProgrammeSuffix(name: string, programme: Programme | undefined): string {
  const base = stripProgrammeSuffix(name)
  return programme === 'EVENING' ? `${base} ${EVENING_TOKEN}` : base
}

/** Read the section back off a stored name. Only a fallback for the rare place that has a
 *  name but not the class row; `ClassLevel.programme` is the source of truth. */
export function programmeFromName(name: string): Programme {
  return /\(Evening\)/i.test(name ?? '') ? 'EVENING' : 'DAY'
}

export const PROGRAMME_LABELS: Record<Programme, string> = {
  DAY: 'Day',
  EVENING: 'Evening',
}

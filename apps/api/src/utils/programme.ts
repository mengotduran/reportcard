/**
 * Day vs Evening section of a class, API side. Mirrors `apps/web/lib/programme.ts`.
 *
 * `ClassLevel.programme` is what MEANS which section a class belongs to. The class NAME
 * additionally carries an "(Evening)" marker, purely because classes are referenced by name
 * (`Student.classLevel` and `Subject.classLevel` are strings, not foreign keys) and
 * ClassLevel is unique on (schoolId, name): two sections sharing one name would make every
 * student and course query mix the two cohorts silently.
 *
 * The catch, and the reason this file exists: nearly every university class-name pattern in
 * this codebase is ANCHORED AT THE END of the string ( / - Level 2$/ and friends ), which is
 * exactly where the marker sits. Any such pattern must normalise first or it stops matching
 * evening classes altogether. That is not a cosmetic failure — before this was fixed,
 * `resolveStudentFee` fell through for evening HND students and `bulkPromote` silently
 * skipped them.
 *
 * Rule of thumb:
 *   - testing or reading a name  -> strip first (`stripProgramme`)
 *   - producing a name to look a class up by -> strip, transform, then re-apply
 *     (`withProgrammeOf`), so the result stays in the same section
 */

const EVENING_TOKEN = '(Evening)'

/** True when the name belongs to the evening section. */
export function isEveningName(name: string): boolean {
  return /\(Evening\)/i.test(name ?? '')
}

/** The name without its section marker. Safe on any name. */
export function stripProgramme(name: string): string {
  if (!name) return name
  return name.replace(/\s*\(Evening\)/gi, '').replace(/\s{2,}/g, ' ').trim()
}

/**
 * Put `derived` back into the same section as `source`. Used whenever one class name is
 * computed from another (Level 1 -> Level 2 on promotion, Level 2 -> Level 1 to find where
 * the programme fee lives), so the result never crosses from evening into day.
 */
export function withProgrammeOf(source: string, derived: string): string {
  const base = stripProgramme(derived)
  return isEveningName(source) ? `${base} ${EVENING_TOKEN}` : base
}

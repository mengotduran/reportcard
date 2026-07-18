/**
 * A university has no Level entity and no Department rows: both live inside the class
 * name. "HND Nursing - Level 1" means the HND Nursing programme at Level 1, and that
 * string is the ONLY place either fact exists, so both are parsed back out of it.
 *
 * Pure and importable so the grouping can be tested against a school's real class names,
 * which is where the edge cases are (Degree programmes carry no level at all).
 */

/**
 * The level a class belongs to: "Level 1", "Level 2", …
 *
 * Programmes with no level in the name ("Degree Nursing") group under "Degree", since
 * that is what they are. Anything else level-less falls to "Other" rather than being
 * mislabelled as a Degree or dropped off the page entirely, which would make its courses
 * unreachable.
 */
export function levelGroupOf(className: string): string {
  const m = /^\s*(.*?)\s*-\s*Level\s*(\d+)\s*$/i.exec(className)
  // Rebuilt from the number rather than echoed back, so however the class was typed
  // ("level 2", "Level  2", "LEVEL 2") it lands in ONE group. Echoing the matched text
  // split the picker into a "Level 2" group and a "level 2" group off one typo.
  if (m) return `Level ${Number(m[2])}`
  return /^\s*degree\b/i.test(className) ? 'Degree' : 'Other'
}

/** The programme within a level: "HND Nursing - Level 1" -> "HND Nursing". */
export function programmeOf(className: string): string {
  const m = /^\s*(.*?)\s*-\s*Level\s*\d+\s*$/i.exec(className)
  return m ? m[1] : className
}

/** Level 1, Level 2, … then Degree, then Other. Numeric, so Level 10 sorts after Level 9
 *  rather than beside Level 1 as a plain string sort would have it. */
export function sortLevelGroups(a: string, b: string): number {
  const num = (g: string) => { const m = /Level\s*(\d+)/i.exec(g); return m ? Number(m[1]) : NaN }
  const na = num(a), nb = num(b)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  if (!isNaN(na)) return -1
  if (!isNaN(nb)) return 1
  if (a === 'Degree') return -1
  if (b === 'Degree') return 1
  return a.localeCompare(b)
}

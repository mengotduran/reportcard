import prisma from '../config/prisma'

/**
 * Which of a school's classes have their assessment settings FROZEN for the rest of the academic
 * year, and what closed term froze each one.
 *
 * Covers the mark ceilings (`maxScore`, and primary's `testMaxScore`), `gradingMode`, and the
 * school's competency rating levels — everything that decides how a card is scored and what it
 * therefore states.
 *
 * The rule: a class is frozen once it has a PUBLISHED report card in a term of the current
 * session that is no longer the current term. Cards were handed out scored against those
 * settings, so the year is committed to them.
 *
 * Judged per CLASS, not per school — a class created in the second term has no history of
 * its own and must stay editable, which is exactly when a school is most likely to be
 * setting one up.
 *
 * Why freezing matters more than it looks: a `Subject` copies the ceilings from its class
 * when it is created and keeps its own copy, so changing a class's ceilings mid-year does
 * NOT re-scale the subjects already there. It leaves one class holding two different scales,
 * with nothing on screen saying so. Switching gradingMode has its own version of this: the
 * cards already in parents' hands state an average and a position, or deliberately state
 * neither, and flipping the mode makes them describe a class that no longer exists.
 *
 * The session is the current term's; with no current term, the newest term's — so the freeze
 * does not silently lift in the gap between two academic years.
 *
 * Lives in utils rather than in classlevel.controller so the competency-scale endpoint
 * applies the SAME rule instead of re-deriving a second, subtly different one.
 */
export async function frozenScaleClasses(schoolId: string): Promise<Map<string, string>> {
  const anchor = await prisma.term.findFirst({ where: { schoolId, isCurrent: true }, select: { session: true } })
    ?? await prisma.term.findFirst({ where: { schoolId }, orderBy: { startDate: 'desc' }, select: { session: true } })
  if (!anchor) return new Map()
  const published = await prisma.reportCard.findMany({
    where: { schoolId, status: 'PUBLISHED', term: { session: anchor.session, isCurrent: false } },
    select: { student: { select: { classLevel: true } }, term: { select: { name: true } } },
  })
  const frozen = new Map<string, string>()
  for (const card of published) {
    if (!frozen.has(card.student.classLevel)) frozen.set(card.student.classLevel, card.term.name)
  }
  return frozen
}

/**
 * The first COMPETENCY class whose ratings are already committed for the year, if any.
 *
 * The rating levels are stored per SCHOOL but frozen per CLASS, so this asks the narrower
 * question the scale editor actually needs: has ANY rated class already had cards published
 * in a closed term? If so the wording is settled for the year — re-labelling now would leave
 * the class's remaining terms using different words from the ones already sent home.
 *
 * A school with no competency classes, or none that have published yet, stays editable.
 */
export async function frozenCompetencyClass(
  schoolId: string
): Promise<{ className: string; termName: string } | null> {
  const rated = await prisma.classLevel.findMany({
    where: { schoolId, gradingMode: 'COMPETENCY' },
    select: { name: true },
  })
  if (rated.length === 0) return null
  const frozen = await frozenScaleClasses(schoolId)
  for (const cl of rated) {
    const termName = frozen.get(cl.name)
    if (termName) return { className: cl.name, termName }
  }
  return null
}

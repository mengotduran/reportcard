/**
 * Convert every existing report card in a COMPETENCY class from numeric marks to
 * developmental ratings.
 *
 * Needed when a class is switched from NUMERIC to COMPETENCY after it already has marked
 * cards: those cards keep their scores, averages and positions, so a nursery report card
 * would go on printing a class rank until each one happened to be re-saved.
 *
 * Each subject's existing total is expressed as a percentage of that subject's own
 * `maxScore` (so it does not matter what scale the class was marked on) and banded via
 * `ratingFromPercentage`. Scores, sequences, and the card's average/total/position are then
 * cleared — the card ends up exactly as if a teacher had entered the ratings by hand.
 *
 * Only ever reads a score to derive the rating. A live competency entry is never derived
 * from a mark; it is whatever the teacher actually selected.
 *
 * Usage:
 *   npx tsx src/scripts/convertClassToCompetency.ts            # report only, writes nothing
 *   npx tsx src/scripts/convertClassToCompetency.ts --apply    # perform the conversion
 */
import prisma from '../config/prisma'
import { ratingFromPercentage } from '../utils/competency'

const APPLY = process.argv.includes('--apply')

async function main() {
  const levels = await prisma.classLevel.findMany({
    where: { gradingMode: 'COMPETENCY' },
    select: { schoolId: true, name: true, school: { select: { name: true } } },
  })
  if (levels.length === 0) { console.log('No COMPETENCY classes.'); return }

  let cardsTouched = 0
  let entriesTouched = 0

  for (const level of levels) {
    const subjects = await prisma.subject.findMany({
      where: { schoolId: level.schoolId, classLevel: level.name },
      select: { id: true, maxScore: true },
    })
    const maxById = new Map(subjects.map((s) => [s.id, s.maxScore]))

    const cards = await prisma.reportCard.findMany({
      where: { schoolId: level.schoolId, student: { classLevel: level.name } },
      select: {
        id: true, average: true, position: true, totalScore: true,
        entries: { select: { id: true, subjectId: true, score: true, grade: true } },
      },
    })
    console.log(`\n${level.school.name} → ${level.name}: ${cards.length} cards`)

    for (const card of cards) {
      // Already converted (no scores anywhere, and the card carries no derived figures):
      // nothing to do, and re-deriving would be a no-op anyway.
      const needsCard = card.average != null || card.position != null || card.totalScore != null
      const scored = card.entries.filter((e) => e.score != null)
      if (!needsCard && scored.length === 0) continue

      for (const e of scored) {
        const max = maxById.get(e.subjectId) ?? 0
        const rating = ratingFromPercentage(max > 0 ? (e.score! / max) * 100 : 0)
        entriesTouched++
        if (APPLY) {
          await prisma.reportEntry.update({
            where: { id: e.id },
            data: { grade: rating, remarks: rating, score: null, seq1Score: null, seq2Score: null, resitScore: null },
          })
        }
      }
      cardsTouched++
      if (APPLY) {
        await prisma.reportCard.update({
          where: { id: card.id },
          data: { average: null, position: null, totalScore: null },
        })
      }
    }

    const sample = cards[0]
    if (sample) {
      const shown = sample.entries.slice(0, 3).map((e) => {
        const max = maxById.get(e.subjectId) ?? 0
        return e.score != null ? `${e.score}/${max} -> ${ratingFromPercentage(max > 0 ? (e.score / max) * 100 : 0)}` : `(already ${e.grade ?? 'unrated'})`
      })
      console.log('  e.g. ' + shown.join(' · '))
    }
  }

  console.log(`\n${APPLY ? 'Converted' : 'Would convert'} ${entriesTouched} entries across ${cardsTouched} cards.`)
  if (!APPLY) console.log('Dry run — re-run with --apply to write.')
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })

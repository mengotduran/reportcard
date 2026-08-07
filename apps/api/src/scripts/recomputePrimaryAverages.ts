/**
 * Recompute ReportCard.average for every PRIMARY school, applying the current rule:
 * coefficient-weighted, normalised per subject onto /20 (see saveEntries in
 * reportcard.controller.ts).
 *
 * Needed because the average used to be a plain unweighted mean on the raw Test+Exam
 * scale (so /100 at a school marking out of 100). Cards written under the old rule store
 * a figure the whole app now reads as /20 — 69.4 would print as 69.4/20 and pass every
 * threshold in sight. Positions are re-derived too: they rank on `average`, and while a
 * uniform rescale preserves order, introducing coefficients does not.
 *
 * Marks themselves (ReportEntry.score/grade/remarks) are never touched — only the derived
 * average, totalScore and position columns.
 *
 * Usage:
 *   npx tsx src/scripts/recomputePrimaryAverages.ts            # report only, writes nothing
 *   npx tsx src/scripts/recomputePrimaryAverages.ts --apply    # perform the update
 */
import prisma from '../config/prisma'

const APPLY = process.argv.includes('--apply')

async function main() {
  const schools = await prisma.school.findMany({ where: { type: 'PRIMARY' }, select: { id: true, name: true } })
  if (schools.length === 0) { console.log('No primary schools.'); return }

  let cardsChanged = 0
  let positionsChanged = 0

  for (const school of schools) {
    const subjects = await prisma.subject.findMany({
      where: { schoolId: school.id },
      select: { id: true, coefficient: true, maxScore: true },
    })
    const subjectById = new Map(subjects.map((s) => [s.id, s]))

    const cards = await prisma.reportCard.findMany({
      where: { schoolId: school.id },
      select: {
        id: true, termId: true, average: true, totalScore: true, position: true,
        student: { select: { classLevel: true } },
        entries: { select: { subjectId: true, score: true } },
      },
    })
    console.log(`\n${school.name}: ${cards.length} report cards`)

    // ── 1. average + totalScore, exactly mirroring saveEntries ──
    const newAverageById = new Map<string, number | null>()
    for (const card of cards) {
      let totalWeighted20 = 0
      let totalCoeff = 0
      let rawSum = 0
      for (const e of card.entries) {
        if (e.score == null) continue
        const sub = subjectById.get(e.subjectId)
        const coeff = sub?.coefficient ?? 1
        const max = sub?.maxScore ?? 0
        totalWeighted20 += (max > 0 ? (e.score / max) * 20 : 0) * coeff
        totalCoeff += coeff
        rawSum += e.score
      }
      const average = totalCoeff > 0 ? totalWeighted20 / totalCoeff : null
      newAverageById.set(card.id, average)

      const changed = average == null
        ? card.average != null
        : card.average == null || Math.abs(card.average - average) > 1e-9
      if (changed) {
        cardsChanged++
        if (APPLY) {
          await prisma.reportCard.update({ where: { id: card.id }, data: { average, totalScore: rawSum } })
        }
      }
    }

    // ── 2. positions, per (class, term) ──
    // Competition ranking (1, 2, 2, 4) over cards WITH an average, ordered here rather than
    // in the database — Postgres sorts NULLS FIRST on DESC, which is the exact defect
    // scripts/repairPositions.ts existed to fix. Tie-break on id so the order is stable.
    const groups = new Map<string, typeof cards>()
    for (const card of cards) {
      const key = `${card.student.classLevel}|${card.termId}`
      const list = groups.get(key)
      if (list) list.push(card)
      else groups.set(key, [card])
    }
    for (const group of groups.values()) {
      const ranked = group
        .filter((c) => newAverageById.get(c.id) != null)
        .sort((a, b) => newAverageById.get(b.id)! - newAverageById.get(a.id)! || a.id.localeCompare(b.id))
      let pos = 1
      for (let i = 0; i < ranked.length; i++) {
        if (i > 0 && newAverageById.get(ranked[i].id) !== newAverageById.get(ranked[i - 1].id)) pos = i + 1
        if (ranked[i].position !== pos) {
          positionsChanged++
          if (APPLY) await prisma.reportCard.update({ where: { id: ranked[i].id }, data: { position: pos } })
        }
      }
      const unranked = group.filter((c) => newAverageById.get(c.id) == null && c.position != null)
      for (const c of unranked) {
        positionsChanged++
        if (APPLY) await prisma.reportCard.update({ where: { id: c.id }, data: { position: null } })
      }
    }

    // A couple of worked examples, so the rescale can be eyeballed rather than trusted.
    for (const card of cards.slice(0, 3)) {
      console.log(`  ${card.student.classLevel}: ${card.average?.toFixed(2) ?? '—'} -> ${newAverageById.get(card.id)?.toFixed(2) ?? '—'}`)
    }
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${cardsChanged} averages and ${positionsChanged} positions.`)
  if (!APPLY) console.log('Dry run — re-run with --apply to write.')
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })

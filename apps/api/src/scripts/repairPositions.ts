/**
 * One-off repair for ReportCard.position.
 *
 * Fixes two defects that existed before the position logic was corrected:
 *
 *  1. Ranking ordered by `average DESC` and walked the whole list. Postgres sorts
 *     NULLS FIRST on DESC, so every unmarked card sat above the top scorer and pushed
 *     each real rank down by the number of students with no marks yet. Measured on real
 *     data: a class with 5 unmarked students recorded its best student as position 6.
 *
 *  2. Universities were given positions at all. They rank by GPA/CGPA and
 *     classification, never by position in class, so those values are meaningless —
 *     and no university screen renders them.
 *
 * Only the derived `position` column is touched. Marks, averages, remarks and publish
 * status are never read for writing or modified.
 *
 * Usage:
 *   npx tsx src/scripts/repairPositions.ts            # report only, writes nothing
 *   npx tsx src/scripts/repairPositions.ts --apply    # perform the repair
 */
import prisma from '../config/prisma'

const APPLY = process.argv.includes('--apply')

/** Host of the database being targeted, with credentials stripped. Printed before any
 *  work so it's impossible to run this against the wrong database by accident — the
 *  difference between local and production is one environment variable. */
function targetDb(): string {
  const url = process.env.DATABASE_URL ?? ''
  if (!url) return '(DATABASE_URL not set)'
  const host = url.replace(/^[a-z]+:\/\/[^@]*@/i, '').replace(/[/?].*$/, '')
  const db = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] ?? '?'
  return `${host} db=${db}`
}

async function main() {
  console.log(APPLY ? '=== REPAIR (writing) ===' : '=== DRY RUN (no writes) ===')
  console.log(`target: ${targetDb()}\n`)
  const schools = await prisma.school.findMany({ select: { id: true, name: true, type: true } })

  let clearedUni = 0
  let fixedPositions = 0

  for (const school of schools) {
    if (school.type === 'UNIVERSITY') {
      const stale = await prisma.reportCard.count({ where: { schoolId: school.id, position: { not: null } } })
      if (stale > 0) {
        console.log(`${school.name}: clearing ${stale} position(s) from university cards`)
        if (APPLY) {
          await prisma.reportCard.updateMany({
            where: { schoolId: school.id, position: { not: null } },
            data: { position: null },
          })
        }
        clearedUni += stale
      }
      continue
    }

    // Primary/secondary: recompute every class+term group from scratch.
    const cards = await prisma.reportCard.findMany({
      where: { schoolId: school.id },
      select: { id: true, average: true, position: true, termId: true, student: { select: { classLevel: true } } },
    })
    const groups = new Map<string, typeof cards>()
    for (const rc of cards) {
      const key = `${rc.termId}::${rc.student.classLevel}`
      if (!groups.has(key)) groups.set(key, [] as unknown as typeof cards)
      groups.get(key)!.push(rc)
    }

    let schoolFixed = 0
    for (const group of groups.values()) {
      const ranked = group
        .filter((c) => c.average != null)
        .sort((a, b) => b.average! - a.average! || a.id.localeCompare(b.id))
      const unranked = group.filter((c) => c.average == null)

      // Competition ranking (1, 2, 2, 4) — ties share a place, the next one skips.
      const writes = []
      let pos = 1
      for (let i = 0; i < ranked.length; i++) {
        if (i > 0 && ranked[i].average !== ranked[i - 1].average) pos = i + 1
        if (ranked[i].position !== pos) {
          schoolFixed++
          if (APPLY) writes.push(prisma.reportCard.update({ where: { id: ranked[i].id }, data: { position: pos } }))
        }
      }
      const toNull = unranked.filter((c) => c.position != null).map((c) => c.id)
      schoolFixed += toNull.length
      if (APPLY && toNull.length > 0) {
        writes.push(prisma.reportCard.updateMany({ where: { id: { in: toNull } }, data: { position: null } }))
      }
      if (APPLY && writes.length > 0) await prisma.$transaction(writes)
    }
    if (schoolFixed > 0) console.log(`${school.name}: ${schoolFixed} position(s) corrected across ${groups.size} class+term groups`)
    fixedPositions += schoolFixed
  }

  console.log(`\nuniversity positions cleared: ${clearedUni}`)
  console.log(`primary/secondary positions corrected: ${fixedPositions}`)
  if (!APPLY) console.log('\nNothing was written. Re-run with --apply to perform the repair.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

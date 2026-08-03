/**
 * One-off backfill for the new PromotionScale table.
 *
 * `School.repeatThreshold` is being replaced by `PromotionScale.trialMinimum` (see
 * DOCUMENTATION.md, "Promotion Scale"). Every school with a repeatThreshold set today gets
 * a PromotionScale row with that same value carried forward, so admin-configured minimums
 * survive the cutover — decisions keep computing exactly as before until an admin opens the
 * new Promotion Scale page and changes something.
 *
 * MUST be run against a database where the `repeatThreshold` column still physically exists
 * — i.e. after the migration that creates PromotionScale, but strictly BEFORE the migration
 * that drops repeatThreshold. Reads it via raw SQL rather than the Prisma Client, because by
 * the time this ships, schema.prisma no longer declares the column at all (the generated
 * client has no typed field for it to read even though the column is still physically
 * present on a not-yet-migrated database).
 *
 * Usage:
 *   npx tsx src/scripts/backfillPromotionScale.ts            # report only, writes nothing
 *   npx tsx src/scripts/backfillPromotionScale.ts --apply    # perform the backfill
 */
import prisma from '../config/prisma'

interface SchoolThresholdRow {
  id: string
  name: string
  repeatThreshold: number | null
}

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
  console.log(APPLY ? '=== BACKFILL (writing) ===' : '=== DRY RUN (no writes) ===')
  console.log(`target: ${targetDb()}\n`)

  const schools = await prisma.$queryRaw<SchoolThresholdRow[]>`
    SELECT id, name, "repeatThreshold" FROM "School" WHERE "repeatThreshold" IS NOT NULL
  `

  let created = 0
  for (const school of schools) {
    const existing = await prisma.promotionScale.findUnique({ where: { schoolId: school.id } })
    if (existing) {
      console.log(`${school.name}: already has a PromotionScale row, skipping`)
      continue
    }
    console.log(`${school.name}: trialMinimum <- ${school.repeatThreshold}`)
    if (APPLY) {
      await prisma.promotionScale.create({
        data: { schoolId: school.id, trialMinimum: school.repeatThreshold },
      })
    }
    created++
  }

  console.log(`\nschools with repeatThreshold set: ${schools.length}`)
  console.log(`PromotionScale rows ${APPLY ? 'created' : 'to create'}: ${created}`)
  if (!APPLY) console.log('\nNothing was written. Re-run with --apply to perform the backfill.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

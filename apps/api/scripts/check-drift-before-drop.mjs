// Read-only check before running migration 20260627081138_add_school_acronym_batch,
// which drops School.accessExpiresAt, School.restrictionNote, and the
// SyncCursor/SyncToken/SyncTombstone tables. Run with:
//   railway run node scripts/check-drift-before-drop.mjs
// Prints whether any of that data still exists in production. Makes no changes.
import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

async function count(sql, label) {
  try {
    const { rows } = await client.query(sql)
    console.log(`${label}: ${rows[0].count}`)
  } catch (e) {
    console.log(`${label}: table/column doesn't exist (${e.message})`)
  }
}

await count(`SELECT count(*) FROM "School" WHERE "accessExpiresAt" IS NOT NULL OR "restrictionNote" IS NOT NULL`, 'Schools with accessExpiresAt/restrictionNote set')
await count(`SELECT count(*) FROM "SyncCursor"`, 'SyncCursor rows')
await count(`SELECT count(*) FROM "SyncToken"`, 'SyncToken rows')
await count(`SELECT count(*) FROM "SyncTombstone"`, 'SyncTombstone rows')

await client.end()

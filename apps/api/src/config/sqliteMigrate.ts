// Offline build only — applies SQLITE_MIGRATIONS to the school's local db
// file on startup, tracked in a small _app_migrations table (deliberately
// not Prisma's own _prisma_migrations format: replicating that exactly
// isn't needed for a single embedded file with no concurrent writers/races
// to coordinate, and keeping our own simple table avoids depending on any
// Prisma-internal format that could change between versions).
import Database from 'better-sqlite3'
import { SQLITE_MIGRATIONS } from './sqliteMigrations'

export function runSqliteMigrations(fileUrl: string): void {
  const filePath = fileUrl.replace(/^file:/, '')
  const db = new Database(filePath)
  try {
    // WAL mode: readers (e.g. the backup endpoint, which opens its own
    // connection) don't block on writers — sticky once set, but harmless
    // to re-set on every startup.
    db.pragma('journal_mode = WAL')
    db.exec(
      `CREATE TABLE IF NOT EXISTS _app_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    )
    const applied = new Set(
      db.prepare('SELECT name FROM _app_migrations').all().map((r: any) => r.name as string)
    )
    for (const migration of SQLITE_MIGRATIONS) {
      if (applied.has(migration.name)) continue
      db.exec('BEGIN')
      try {
        db.exec(migration.sql)
        db.prepare('INSERT INTO _app_migrations (name) VALUES (?)').run(migration.name)
        db.exec('COMMIT')
        console.log(`[sqlite] applied migration ${migration.name}`)
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    }
  } finally {
    db.close()
  }
}

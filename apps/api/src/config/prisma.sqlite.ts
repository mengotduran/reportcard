import { PrismaClient } from '../../generated/sqlite-client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { runSqliteMigrations } from './sqliteMigrate'

// Offline build only. DATABASE_URL here is a `file:` path to the SQLite
// file on disk (e.g. the OS app-data folder at runtime), not a Postgres
// connection string. Falls back to a local dev file so this can be
// smoke-tested without the full packaging pipeline.
const url = process.env.DATABASE_URL ?? 'file:./prisma/sqlite/dev.db'

// No Prisma CLI on the school's machine to run `prisma migrate deploy` —
// apply pending migrations directly before the app starts taking requests.
runSqliteMigrations(url)

const adapter = new PrismaBetterSqlite3({ url })
const prisma = new PrismaClient({ adapter })

export default prisma

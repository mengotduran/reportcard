// Prisma config for the offline/SQLite schema — separate from prisma.config.ts
// (the Postgres/cloud config). Used only when generating/migrating the
// SQLite variant, e.g.:
//   npx prisma migrate dev --config=prisma.sqlite.config.ts --name <name>
//   npx prisma generate --config=prisma.sqlite.config.ts
//
// The dev.db path here is for local iteration only — the packaged offline
// app points DATABASE_URL at the OS app-data folder at runtime instead.
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/sqlite/schema.prisma",
  migrations: {
    path: "prisma/sqlite/migrations",
  },
  datasource: {
    url: "file:./prisma/sqlite/dev.db",
  },
})

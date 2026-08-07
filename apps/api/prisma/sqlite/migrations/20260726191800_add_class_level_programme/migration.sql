-- SQLite has no enum type: Prisma stores an enum as TEXT and enforces the values in the
-- client. The Postgres twin of this migration (20260726191744_add_class_level_programme)
-- creates a real "Programme" type; here the column alone carries the same meaning.
ALTER TABLE "ClassLevel" ADD COLUMN "programme" TEXT NOT NULL DEFAULT 'DAY';

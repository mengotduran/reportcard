-- AlterTable
-- `coverImages` was added to schema.prisma without ever generating a tracked
-- migration (likely applied to the dev DB via `db push`), so any database
-- built purely from `migrate deploy` was missing this column.
ALTER TABLE "School" ADD COLUMN "coverImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

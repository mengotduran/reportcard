-- AlterTable
-- `ClassLevel.maxScore` was added to schema.prisma without a tracked migration
-- (same gap as School.coverImages) — missing on any database built purely
-- from `migrate deploy`.
ALTER TABLE "ClassLevel" ADD COLUMN "maxScore" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
-- `ReportEntry.score` was created NOT NULL in the init migration, but
-- schema.prisma has long modeled it as nullable (null = subject not yet
-- filled, distinct from an explicit 0). Never migrated, so a fresh database
-- would reject unfilled marks with a NOT NULL violation.
ALTER TABLE "ReportEntry" ALTER COLUMN "score" DROP NOT NULL;

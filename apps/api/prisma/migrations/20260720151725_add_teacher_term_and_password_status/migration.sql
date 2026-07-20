-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdForTerm" TEXT,
ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- Backfill: every existing user already has a real, working password (either
-- admin-typed pre-feature, or offline) — mark them as already set so none of
-- them show up with a false "Pending Setup" badge. Only rows created from here
-- on can legitimately have passwordSetAt IS NULL.
UPDATE "User" SET "passwordSetAt" = NOW() WHERE "passwordSetAt" IS NULL;

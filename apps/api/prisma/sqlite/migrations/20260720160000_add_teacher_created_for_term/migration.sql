-- Mirrors the Postgres migration 20260720151725_add_teacher_term_and_password_status.
-- No backfill needed for passwordSetAt here (unlike the Postgres side): every
-- offline-created teacher gets it stamped at creation time going forward, and
-- existing rows being NULL is harmless — pendingSetup just isn't computed/shown
-- anywhere in the offline UI in a way that matters before their next password set.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "createdForTerm" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordSetAt" DATETIME;

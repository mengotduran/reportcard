/*
  Warnings:

  - You are about to drop the column `repeatThreshold` on the `School` table. All the data in the column will be lost.

*/
-- PRECONDITION: src/scripts/backfillPromotionScale.ts --apply must have been run against
-- this database first, and its row counts verified, or every school's admin-configured
-- pass threshold is lost with no way to recover it.
-- AlterTable
ALTER TABLE "School" DROP COLUMN "repeatThreshold";

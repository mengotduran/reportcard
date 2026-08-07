-- DropIndex
DROP INDEX "TeacherSubject_userId_subjectId_key";

-- AlterTable
ALTER TABLE "TeacherSubject" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- BACKFILL, and the reason this migration is hand-edited: the column default is
-- CURRENT_TIMESTAMP, which would claim every existing assignment began the moment this
-- migration ran. Hours are counted from startedAt, so that would wipe out every hour any
-- teacher has accumulated to date. An assignment that already exists began when it was
-- created.
UPDATE "TeacherSubject" SET "startedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "TeacherSubject_userId_subjectId_idx" ON "TeacherSubject"("userId", "subjectId");

-- CreateIndex
CREATE INDEX "TeacherSubject_subjectId_endedAt_idx" ON "TeacherSubject"("subjectId", "endedAt");

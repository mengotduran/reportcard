-- AlterTable
ALTER TABLE "TimetableSlot" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "specificDate" TEXT;

-- CreateIndex
CREATE INDEX "TimetableSlot_schoolId_teacherId_archivedAt_idx" ON "TimetableSlot"("schoolId", "teacherId", "archivedAt");

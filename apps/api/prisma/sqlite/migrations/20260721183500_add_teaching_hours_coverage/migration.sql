-- Mirrors the Postgres migration 20260721183214_add_teaching_hours_coverage.

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN "requiredHours" INTEGER;

-- CreateTable
CREATE TABLE "TeacherAbsence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "timetableSlotId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherAbsence_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherAbsence_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherAbsence_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "TimetableSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherAbsence_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeacherAbsence_schoolId_teacherId_idx" ON "TeacherAbsence"("schoolId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAbsence_teacherId_timetableSlotId_date_key" ON "TeacherAbsence"("teacherId", "timetableSlotId", "date");

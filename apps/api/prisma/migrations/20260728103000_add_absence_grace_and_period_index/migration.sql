-- DropIndex
DROP INDEX "TeacherAbsence_teacherId_timetableSlotId_date_key";

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "absenceGraceMinutes" INTEGER;

-- AlterTable
ALTER TABLE "TeacherAbsence" ADD COLUMN     "periodIndex" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAbsence_teacherId_timetableSlotId_date_periodIndex_key" ON "TeacherAbsence"("teacherId", "timetableSlotId", "date", "periodIndex");


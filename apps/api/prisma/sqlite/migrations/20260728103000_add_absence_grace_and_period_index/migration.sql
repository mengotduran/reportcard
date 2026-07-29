-- Twin of the Postgres migration 20260728103000_add_absence_grace_and_period_index.
--
-- absenceGraceMinutes: minutes after a period STARTS before the teacher counts as having
-- missed it. NULL keeps the older rule (a period is only final once it has ENDED), so an
-- existing install is unaffected until an admin sets a value.
ALTER TABLE "School" ADD COLUMN "absenceGraceMinutes" INTEGER;

-- periodIndex: which period WITHIN the slot an absence row stands for, 0-based, so a
-- double period books one row per period and a late arrival loses only the period actually
-- missed. NULL marks a legacy row that still stands for the WHOLE slot.
ALTER TABLE "TeacherAbsence" ADD COLUMN "periodIndex" INTEGER;

-- The uniqueness that stops one period being booked twice now has to include the period.
-- SQLite cannot alter a constraint in place, but this one was created as a named index, so
-- it is dropped and recreated rather than requiring a full table rebuild.
DROP INDEX IF EXISTS "TeacherAbsence_teacherId_timetableSlotId_date_key";
CREATE UNIQUE INDEX "TeacherAbsence_teacherId_timetableSlotId_date_periodIndex_key"
  ON "TeacherAbsence"("teacherId", "timetableSlotId", "date", "periodIndex");

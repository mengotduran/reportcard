-- termId: the semester a switch happened in, so the "twice per semester" cap counts rows
-- instead of doing date arithmetic. NULL when no semester was running (between academic
-- years), where switching is unrestricted because there are no marks in flight to protect.
-- byProvider: a switch made by the provider (superadmin) on the school's behalf. It never
-- counts against the school's two, because it IS the permission that lifts the cap.
ALTER TABLE "MarksEntryModeChange" ADD COLUMN "termId" TEXT;
ALTER TABLE "MarksEntryModeChange" ADD COLUMN "byProvider" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "MarksEntryModeChange_schoolId_termId_idx" ON "MarksEntryModeChange"("schoolId", "termId");

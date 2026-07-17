-- Every switch of who records marks, kept forever. A log rather than a "last changed by"
-- pair on School: flipping to TEACHERS and back would overwrite itself and leave only the
-- innocent final state, hiding the very window this exists to reveal.
-- changedByName is a snapshot: an audit row must still read the same after the user is
-- renamed or deleted, so it is deliberately not a foreign key to User.
CREATE TABLE "MarksEntryModeChange" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "mode" "MarksEntryMode" NOT NULL,
  "changedById" TEXT,
  "changedByName" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarksEntryModeChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarksEntryModeChange_schoolId_changedAt_idx" ON "MarksEntryModeChange"("schoolId", "changedAt");
ALTER TABLE "MarksEntryModeChange" ADD CONSTRAINT "MarksEntryModeChange_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

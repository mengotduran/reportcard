-- Twin of the Postgres migration 20260808202501_add_competency_scale.
-- The developmental ratings a COMPETENCY (nursery / pre-primary) class is assessed on.
-- Its own table rather than a column on GradingScale, which is auto-migrated on every read.
-- `levels` is an ordered array, highest attainment first; empty means "never customised",
-- so the API serves the built-in defaults.

-- CreateTable
CREATE TABLE "CompetencyScale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "levels" JSONB NOT NULL DEFAULT [],
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetencyScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyScale_schoolId_key" ON "CompetencyScale"("schoolId");

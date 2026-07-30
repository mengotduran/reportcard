-- Twin of the Postgres add_school_holidays migration.
-- A named, inclusive date range during which the school is closed. Ranges may overlap; the
-- hours maths merges them before subtracting so a day is never removed twice.
CREATE TABLE "SchoolHoliday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolHoliday_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SchoolHoliday_schoolId_startDate_idx" ON "SchoolHoliday"("schoolId", "startDate");

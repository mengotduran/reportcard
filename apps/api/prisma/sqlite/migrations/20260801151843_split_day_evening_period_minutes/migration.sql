/*
  Warnings:

  - You are about to drop the column `periodMinutes` on the `School` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentSchoolId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'EN',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "marksEntryMode" TEXT NOT NULL DEFAULT 'TEACHERS',
    "stamp" TEXT,
    "coverImage" TEXT,
    "coverImages" JSONB NOT NULL DEFAULT [],
    "subdomain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "acronym" TEXT,
    "batch" INTEGER,
    "repeatThreshold" REAL,
    "dayPeriodMinutes" INTEGER,
    "eveningPeriodMinutes" INTEGER,
    "absenceGraceMinutes" INTEGER,
    "authorizationNumber" TEXT,
    "officialLeftTextEn" TEXT,
    "officialLeftTextFr" TEXT,
    "officialRightTextEn" TEXT,
    "officialRightTextFr" TEXT,
    CONSTRAINT "School_parentSchoolId_fkey" FOREIGN KEY ("parentSchoolId") REFERENCES "ParentSchool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- dayPeriodMinutes and eveningPeriodMinutes both start as a copy of the old shared
-- periodMinutes, so absence/coverage counting is unchanged until an admin sets the
-- evening value separately (relevant to universities only).
INSERT INTO "new_School" ("absenceGraceMinutes", "acronym", "address", "authorizationNumber", "batch", "coverImage", "coverImages", "createdAt", "dayPeriodMinutes", "eveningPeriodMinutes", "email", "id", "isActive", "language", "logo", "marksEntryMode", "name", "officialLeftTextEn", "officialLeftTextFr", "officialRightTextEn", "officialRightTextFr", "parentSchoolId", "phone", "repeatThreshold", "stamp", "subdomain", "type", "updatedAt", "website") SELECT "absenceGraceMinutes", "acronym", "address", "authorizationNumber", "batch", "coverImage", "coverImages", "createdAt", "periodMinutes", "periodMinutes", "email", "id", "isActive", "language", "logo", "marksEntryMode", "name", "officialLeftTextEn", "officialLeftTextFr", "officialRightTextEn", "officialRightTextFr", "parentSchoolId", "phone", "repeatThreshold", "stamp", "subdomain", "type", "updatedAt", "website" FROM "School";
DROP TABLE "School";
ALTER TABLE "new_School" RENAME TO "School";
CREATE UNIQUE INDEX "School_email_key" ON "School"("email");
CREATE UNIQUE INDEX "School_subdomain_key" ON "School"("subdomain");
CREATE TABLE "new_TimetablePeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "programme" TEXT NOT NULL DEFAULT 'DAY',
    CONSTRAINT "TimetablePeriod_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Backfill by clock time: 16:30 or later is Evening, everything before is Day. A no-op
-- for every school observed today except one that already runs an evening sitting.
INSERT INTO "new_TimetablePeriod" ("endTime", "id", "isBreak", "programme", "schoolId", "startTime") SELECT "endTime", "id", "isBreak", coalesce("programme", CASE WHEN "startTime" >= '16:30' THEN 'EVENING' ELSE 'DAY' END) AS "programme", "schoolId", "startTime" FROM "TimetablePeriod";
DROP TABLE "TimetablePeriod";
ALTER TABLE "new_TimetablePeriod" RENAME TO "TimetablePeriod";
CREATE INDEX "TimetablePeriod_schoolId_idx" ON "TimetablePeriod"("schoolId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

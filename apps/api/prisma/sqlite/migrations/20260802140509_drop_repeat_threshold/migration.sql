/*
  Warnings:

  - You are about to drop the column `repeatThreshold` on the `School` table. All the data in the column will be lost.

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
INSERT INTO "new_School" ("absenceGraceMinutes", "acronym", "address", "authorizationNumber", "batch", "coverImage", "coverImages", "createdAt", "dayPeriodMinutes", "email", "eveningPeriodMinutes", "id", "isActive", "language", "logo", "marksEntryMode", "name", "officialLeftTextEn", "officialLeftTextFr", "officialRightTextEn", "officialRightTextFr", "parentSchoolId", "phone", "stamp", "subdomain", "type", "updatedAt", "website") SELECT "absenceGraceMinutes", "acronym", "address", "authorizationNumber", "batch", "coverImage", "coverImages", "createdAt", "dayPeriodMinutes", "email", "eveningPeriodMinutes", "id", "isActive", "language", "logo", "marksEntryMode", "name", "officialLeftTextEn", "officialLeftTextFr", "officialRightTextEn", "officialRightTextFr", "parentSchoolId", "phone", "stamp", "subdomain", "type", "updatedAt", "website" FROM "School";
DROP TABLE "School";
ALTER TABLE "new_School" RENAME TO "School";
CREATE UNIQUE INDEX "School_email_key" ON "School"("email");
CREATE UNIQUE INDEX "School_subdomain_key" ON "School"("subdomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Brings the SQLite/offline schema up to parity with the Postgres/cloud schema as of
-- 2026-07-19. Two kinds of gap closed here at once:
--   1. Pre-existing drift: Department/ClassLevel.departmentId, School.website, and
--      School.authorizationNumber were already declared in schema.prisma (copied over
--      during an earlier hand-sync) but no migration for them was ever actually
--      generated — an offline install built before this migration would have crashed
--      the moment any of that code path ran, the same class of bug documented in
--      section 2a of DEPLOYMENT_ARCHITECTURE.md for the Postgres side.
--   2. Everything added to the Postgres schema since the last sync (2026-06-29):
--      Department/secondary sections, resit scores, the school stamp image, official
--      header letterhead text, marks-entry-mode (+ its audit log), and student birth
--      details.
-- Generated via `prisma migrate diff --from-migrations prisma/sqlite/migrations
-- --to-schema prisma/sqlite/schema.prisma --script`, then hand-fixed: Prisma's SQLite
-- generator emits unquoted `DEFAULT []` for Json fields, which SQLite rejects outright
-- (documented gotcha, section 8) — quoted to `DEFAULT '[]'` in three places below
-- (ExcelTemplate.classLevels, School.coverImages, User.departments).

-- AlterTable
ALTER TABLE "ReportEntry" ADD COLUMN "resitScore" REAL;

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Department_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarksEntryModeChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "changedById" TEXT,
    "changedByName" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termId" TEXT,
    "byProvider" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MarksEntryModeChange_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "hasStream" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 20,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "hndRegistrationFee" INTEGER,
    "departmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassLevel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClassLevel" ("abbreviation", "createdAt", "feeAmount", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "schoolId") SELECT "abbreviation", "createdAt", "feeAmount", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "schoolId" FROM "ClassLevel";
DROP TABLE "ClassLevel";
ALTER TABLE "new_ClassLevel" RENAME TO "ClassLevel";
CREATE UNIQUE INDEX "ClassLevel_schoolId_name_key" ON "ClassLevel"("schoolId", "name");
CREATE TABLE "new_ExcelTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileData" BLOB NOT NULL,
    "classLevels" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExcelTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExcelTemplate" ("classLevels", "createdAt", "fileData", "id", "name", "schoolId", "updatedAt") SELECT "classLevels", "createdAt", "fileData", "id", "name", "schoolId", "updatedAt" FROM "ExcelTemplate";
DROP TABLE "ExcelTemplate";
ALTER TABLE "new_ExcelTemplate" RENAME TO "ExcelTemplate";
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
    "coverImages" JSONB NOT NULL DEFAULT '[]',
    "subdomain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "acronym" TEXT,
    "batch" INTEGER,
    "repeatThreshold" REAL,
    "authorizationNumber" TEXT,
    "officialLeftTextEn" TEXT,
    "officialLeftTextFr" TEXT,
    "officialRightTextEn" TEXT,
    "officialRightTextFr" TEXT,
    CONSTRAINT "School_parentSchoolId_fkey" FOREIGN KEY ("parentSchoolId") REFERENCES "ParentSchool" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_School" ("acronym", "address", "batch", "coverImage", "coverImages", "createdAt", "email", "id", "isActive", "language", "logo", "name", "parentSchoolId", "phone", "repeatThreshold", "subdomain", "type", "updatedAt") SELECT "acronym", "address", "batch", "coverImage", "coverImages", "createdAt", "email", "id", "isActive", "language", "logo", "name", "parentSchoolId", "phone", "repeatThreshold", "subdomain", "type", "updatedAt" FROM "School";
DROP TABLE "School";
ALTER TABLE "new_School" RENAME TO "School";
CREATE UNIQUE INDEX "School_email_key" ON "School"("email");
CREATE UNIQUE INDEX "School_subdomain_key" ON "School"("subdomain");
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "studentId" TEXT NOT NULL,
    "classLevel" TEXT NOT NULL,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "directLevel2Entry" BOOLEAN NOT NULL DEFAULT false,
    "isRepeatingLevel" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dateOfBirth" TEXT,
    "placeOfBirth" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("classLevel", "createdAt", "directLevel2Entry", "gender", "guardianEmail", "guardianName", "guardianPhone", "id", "isActive", "isRepeatingLevel", "name", "schoolId", "status", "studentId", "updatedAt") SELECT "classLevel", "createdAt", "directLevel2Entry", "gender", "guardianEmail", "guardianName", "guardianPhone", "id", "isActive", "isRepeatingLevel", "name", "schoolId", "status", "studentId", "updatedAt" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE UNIQUE INDEX "Student_schoolId_studentId_key" ON "Student"("schoolId", "studentId");
CREATE TABLE "new_Term" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "printingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Term" ("createdAt", "endDate", "id", "isCurrent", "name", "printingEnabled", "schoolId", "session", "startDate") SELECT "createdAt", "endDate", "id", "isCurrent", "name", "printingEnabled", "schoolId", "session", "startDate" FROM "Term";
DROP TABLE "Term";
ALTER TABLE "new_Term" RENAME TO "Term";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "masterClassLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'EN',
    "departments" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "isActive", "masterClassLevel", "name", "password", "preferredLanguage", "role", "schoolId", "updatedAt") SELECT "createdAt", "email", "id", "isActive", "masterClassLevel", "name", "password", "preferredLanguage", "role", "schoolId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Department_schoolId_name_key" ON "Department"("schoolId", "name");

-- CreateIndex
CREATE INDEX "MarksEntryModeChange_schoolId_changedAt_idx" ON "MarksEntryModeChange"("schoolId", "changedAt");

-- CreateIndex
CREATE INDEX "MarksEntryModeChange_schoolId_termId_idx" ON "MarksEntryModeChange"("schoolId", "termId");

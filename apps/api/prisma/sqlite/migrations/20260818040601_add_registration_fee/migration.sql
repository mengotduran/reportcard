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
    "testMaxScore" INTEGER NOT NULL DEFAULT 30,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "registrationFee" INTEGER NOT NULL DEFAULT 0,
    "hndRegistrationFee" INTEGER,
    "departmentId" TEXT,
    "programme" TEXT NOT NULL DEFAULT 'DAY',
    "gradingMode" TEXT NOT NULL DEFAULT 'NUMERIC',
    "scaleUnlockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassLevel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClassLevel" ("abbreviation", "createdAt", "departmentId", "feeAmount", "gradingMode", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "programme", "scaleUnlockedAt", "schoolId", "testMaxScore") SELECT "abbreviation", "createdAt", "departmentId", "feeAmount", "gradingMode", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "programme", "scaleUnlockedAt", "schoolId", "testMaxScore" FROM "ClassLevel";
DROP TABLE "ClassLevel";
ALTER TABLE "new_ClassLevel" RENAME TO "ClassLevel";
CREATE UNIQUE INDEX "ClassLevel_schoolId_name_key" ON "ClassLevel"("schoolId", "name");
CREATE TABLE "new_FeePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TUITION',
    "paidOn" DATETIME NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FeePayment" ("amount", "createdAt", "id", "note", "paidOn", "recordedBy", "schoolId", "session", "studentId") SELECT "amount", "createdAt", "id", "note", "paidOn", "recordedBy", "schoolId", "session", "studentId" FROM "FeePayment";
DROP TABLE "FeePayment";
ALTER TABLE "new_FeePayment" RENAME TO "FeePayment";
CREATE INDEX "FeePayment_studentId_session_idx" ON "FeePayment"("studentId", "session");
CREATE INDEX "FeePayment_schoolId_session_idx" ON "FeePayment"("schoolId", "session");
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
    "registrationSeparate" BOOLEAN NOT NULL DEFAULT false,
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

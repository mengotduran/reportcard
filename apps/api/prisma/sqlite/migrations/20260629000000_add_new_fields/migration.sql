-- New fields + models: preferredLanguage, student flags, class/term/report columns,
-- HndRegistrationPayment, ExcelTemplate, plus School/Subject minor additions.

-- User: preferred UI language
ALTER TABLE "User" ADD COLUMN "preferredLanguage" TEXT NOT NULL DEFAULT 'EN';

-- Student: university promotion flags
ALTER TABLE "Student" ADD COLUMN "directLevel2Entry" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Student" ADD COLUMN "isRepeatingLevel" INTEGER NOT NULL DEFAULT 0;

-- ClassLevel: abbreviation + HND fee
ALTER TABLE "ClassLevel" ADD COLUMN "abbreviation" TEXT;
ALTER TABLE "ClassLevel" ADD COLUMN "hndRegistrationFee" INTEGER;

-- Term: printing lock
ALTER TABLE "Term" ADD COLUMN "printingEnabled" INTEGER NOT NULL DEFAULT 1;

-- ReportCard: end-of-year PASS/REPEAT decision
ALTER TABLE "ReportCard" ADD COLUMN "decision" TEXT;

-- School: acronym, batch cohort, repeat threshold
ALTER TABLE "School" ADD COLUMN "acronym" TEXT;
ALTER TABLE "School" ADD COLUMN "batch" INTEGER;
ALTER TABLE "School" ADD COLUMN "repeatThreshold" REAL;

-- Subject: optional short code
ALTER TABLE "Subject" ADD COLUMN "code" TEXT;

-- HndRegistrationPayment (new)
CREATE TABLE "HndRegistrationPayment" (
    "id"         TEXT     NOT NULL PRIMARY KEY,
    "schoolId"   TEXT     NOT NULL,
    "studentId"  TEXT     NOT NULL,
    "session"    TEXT     NOT NULL,
    "amount"     INTEGER  NOT NULL,
    "paidOn"     DATETIME NOT NULL,
    "note"       TEXT,
    "recordedBy" TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HndRegistrationPayment_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HndRegistrationPayment_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HndRegistrationPayment_studentId_session_idx"
    ON "HndRegistrationPayment"("studentId", "session");

-- ExcelTemplate (new) — classLevels stored as JSON text (String[] not supported in SQLite)
CREATE TABLE "ExcelTemplate" (
    "id"          TEXT     NOT NULL PRIMARY KEY,
    "schoolId"    TEXT     NOT NULL,
    "name"        TEXT     NOT NULL,
    "fileData"    BLOB     NOT NULL,
    "classLevels" TEXT     NOT NULL DEFAULT '[]',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExcelTemplate_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

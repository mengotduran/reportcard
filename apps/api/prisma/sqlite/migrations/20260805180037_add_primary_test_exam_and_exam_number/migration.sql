-- AlterTable
ALTER TABLE "HndRegistrationPayment" ADD COLUMN "examNumber" TEXT;

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
    "hndRegistrationFee" INTEGER,
    "departmentId" TEXT,
    "programme" TEXT NOT NULL DEFAULT 'DAY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassLevel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClassLevel" ("abbreviation", "createdAt", "departmentId", "feeAmount", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "programme", "schoolId") SELECT "abbreviation", "createdAt", "departmentId", "feeAmount", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "programme", "schoolId" FROM "ClassLevel";
DROP TABLE "ClassLevel";
ALTER TABLE "new_ClassLevel" RENAME TO "ClassLevel";
CREATE UNIQUE INDEX "ClassLevel_schoolId_name_key" ON "ClassLevel"("schoolId", "name");
CREATE TABLE "new_Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "classLevel" TEXT NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 20,
    "testMaxScore" INTEGER NOT NULL DEFAULT 30,
    "coefficient" INTEGER NOT NULL DEFAULT 1,
    "credit" INTEGER,
    "compulsory" BOOLEAN NOT NULL DEFAULT true,
    "term" TEXT,
    "requiredHours" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subject" ("classLevel", "code", "coefficient", "compulsory", "createdAt", "credit", "id", "maxScore", "name", "requiredHours", "schoolId", "term") SELECT "classLevel", "code", "coefficient", "compulsory", "createdAt", "credit", "id", "maxScore", "name", "requiredHours", "schoolId", "term" FROM "Subject";
DROP TABLE "Subject";
ALTER TABLE "new_Subject" RENAME TO "Subject";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

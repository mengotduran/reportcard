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
    "gradingMode" TEXT NOT NULL DEFAULT 'NUMERIC',
    "scaleUnlockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClassLevel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClassLevel" ("abbreviation", "createdAt", "departmentId", "feeAmount", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "programme", "schoolId", "testMaxScore") SELECT "abbreviation", "createdAt", "departmentId", "feeAmount", "hasStream", "hndRegistrationFee", "id", "maxScore", "name", "order", "programme", "schoolId", "testMaxScore" FROM "ClassLevel";
DROP TABLE "ClassLevel";
ALTER TABLE "new_ClassLevel" RENAME TO "ClassLevel";
CREATE UNIQUE INDEX "ClassLevel_schoolId_name_key" ON "ClassLevel"("schoolId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


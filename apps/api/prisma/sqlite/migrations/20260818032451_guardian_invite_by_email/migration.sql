-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GuardianInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "claimedAt" DATETIME,
    "claimedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuardianInvite_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GuardianInvite_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GuardianInvite" ("claimedAt", "claimedBy", "createdAt", "createdBy", "expiresAt", "id", "phone", "schoolId", "studentId", "tokenHash") SELECT "claimedAt", "claimedBy", "createdAt", "createdBy", "expiresAt", "id", "phone", "schoolId", "studentId", "tokenHash" FROM "GuardianInvite";
DROP TABLE "GuardianInvite";
ALTER TABLE "new_GuardianInvite" RENAME TO "GuardianInvite";
CREATE UNIQUE INDEX "GuardianInvite_tokenHash_key" ON "GuardianInvite"("tokenHash");
CREATE INDEX "GuardianInvite_schoolId_studentId_idx" ON "GuardianInvite"("schoolId", "studentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "masterClassLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'EN',
    "departments" JSONB NOT NULL DEFAULT [],
    "createdForTerm" TEXT,
    "passwordSetAt" DATETIME,
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" DATETIME,
    CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "createdForTerm", "departments", "email", "id", "isActive", "masterClassLevel", "name", "password", "passwordSetAt", "preferredLanguage", "resetTokenExpiresAt", "resetTokenHash", "role", "schoolId", "updatedAt") SELECT "createdAt", "createdForTerm", "departments", "email", "id", "isActive", "masterClassLevel", "name", "password", "passwordSetAt", "preferredLanguage", "resetTokenExpiresAt", "resetTokenHash", "role", "schoolId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


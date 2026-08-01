-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimetableSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "subjectId" TEXT,
    "label" TEXT,
    "room" TEXT,
    "specificDate" TEXT,
    "startsOn" TEXT,
    "endsOn" TEXT,
    "privateSubjectId" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimetableSlot_privateSubjectId_fkey" FOREIGN KEY ("privateSubjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimetableSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimetableSlot" ("archivedAt", "createdAt", "dayOfWeek", "endTime", "endsOn", "id", "label", "privateSubjectId", "room", "schoolId", "specificDate", "startTime", "startsOn", "subjectId", "teacherId", "updatedAt") SELECT "archivedAt", "createdAt", "dayOfWeek", "endTime", "endsOn", "id", "label", "privateSubjectId", "room", "schoolId", "specificDate", "startTime", "startsOn", "subjectId", "teacherId", "updatedAt" FROM "TimetableSlot";
DROP TABLE "TimetableSlot";
ALTER TABLE "new_TimetableSlot" RENAME TO "TimetableSlot";
CREATE INDEX "TimetableSlot_schoolId_teacherId_idx" ON "TimetableSlot"("schoolId", "teacherId");
CREATE INDEX "TimetableSlot_schoolId_teacherId_archivedAt_idx" ON "TimetableSlot"("schoolId", "teacherId", "archivedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


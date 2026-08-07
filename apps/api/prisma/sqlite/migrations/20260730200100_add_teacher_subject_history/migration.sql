-- Twin of the Postgres add_teacher_subject_history migration.
--
-- An assignment now records WHEN a teacher took a course and when they gave it up, so a
-- mid-term handover splits the course's hours between the two teachers at the recorded date.
-- An ended row is kept, never deleted: it is the only evidence the previous teacher taught it.
--
-- The (userId, subjectId) unique constraint is dropped on purpose — a teacher may hold a
-- course, hand it over, and take it back, which is two legitimate rows. "Only one ACTIVE
-- assignment" is enforced in application code.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TeacherSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeacherSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- startedAt is seeded from createdAt, NOT left to the CURRENT_TIMESTAMP default. Hours are
-- counted from startedAt, so defaulting would claim every existing assignment began at
-- migration time and wipe out every hour accumulated so far.
INSERT INTO "new_TeacherSubject" ("id", "userId", "subjectId", "createdAt", "startedAt")
SELECT "id", "userId", "subjectId", "createdAt", "createdAt" FROM "TeacherSubject";
DROP TABLE "TeacherSubject";
ALTER TABLE "new_TeacherSubject" RENAME TO "TeacherSubject";
CREATE INDEX "TeacherSubject_userId_subjectId_idx" ON "TeacherSubject"("userId", "subjectId");
CREATE INDEX "TeacherSubject_subjectId_endedAt_idx" ON "TeacherSubject"("subjectId", "endedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

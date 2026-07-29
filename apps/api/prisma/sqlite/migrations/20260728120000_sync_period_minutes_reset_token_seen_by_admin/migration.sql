-- Closes a drift between the two schemas: these four columns existed on Postgres but were
-- never added to SQLite, so the code that reads them would fail on an offline install with
-- "no such column". Each one is added here with the same nullability/default as its
-- Postgres twin, so behaviour matches on both.
--
--  * School.periodMinutes        length of one school period; attendance is counted in
--                                these, so teaching-hours and every absence count need it.
--  * User.resetTokenHash/-ExpiresAt   the forgot-password flow.
--  * TeacherAbsence.seenByAdmin  locks an absence once an admin has reviewed it.
ALTER TABLE "School" ADD COLUMN "periodMinutes" INTEGER;

ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExpiresAt" DATETIME;
-- Unique on Postgres. A partial index keeps that guarantee for real tokens while letting
-- every user sit at NULL, which is the normal state for all but one at a time.
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash") WHERE "resetTokenHash" IS NOT NULL;

-- NOT NULL with a default, matching Postgres: every existing absence counts as unreviewed,
-- which is the safe starting point (it leaves them deletable rather than locking history).
ALTER TABLE "TeacherAbsence" ADD COLUMN "seenByAdmin" BOOLEAN NOT NULL DEFAULT false;

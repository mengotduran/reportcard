-- Twin of the Postgres backfill_assignment_start_to_term migration.
--
-- add_teacher_subject_history seeded startedAt = createdAt, the day the row happened to be
-- written. Before windows existed an assignment meant "this teacher holds this course", not
-- "from the day the record was created" — so that seeding invented a gap before every
-- pre-existing assignment and truncated hours already taught.
--
-- Reset to the school's earliest term start. Hours are still clamped to the scope terms of
-- whichever session is viewed, so an early startedAt widens nothing.
UPDATE "TeacherSubject"
SET "startedAt" = (
  SELECT MIN(t."startDate")
  FROM "Term" t
  JOIN "User" u ON u."schoolId" = t."schoolId"
  WHERE u."id" = "TeacherSubject"."userId"
)
WHERE "endedAt" IS NULL
  AND "createdAt" < '2026-07-30 21:00:00'
  AND (
    SELECT MIN(t2."startDate")
    FROM "Term" t2
    JOIN "User" u2 ON u2."schoolId" = t2."schoolId"
    WHERE u2."id" = "TeacherSubject"."userId"
  ) < "startedAt";

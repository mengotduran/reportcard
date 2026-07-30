-- Corrects the startedAt backfill from add_teacher_subject_history.
--
-- That migration seeded startedAt = createdAt: the day the row happened to be written. But
-- before assignment windows existed an assignment meant "this teacher holds this course",
-- full stop — not "from the day the record was created". Seeding from createdAt invented a
-- gap before every pre-existing assignment and truncated the hours those teachers had
-- already taught.
--
-- Reset to the school's earliest term start, which is what the old data actually meant: held
-- for as long as the records go. Hours are still clamped to the scope terms of whichever
-- session is being viewed, so an early startedAt widens nothing — it only stops the
-- artificial truncation.
--
-- Scoped to rows created BEFORE this migration and never deliberately ended, so any window an
-- admin has since set on purpose is left alone.
UPDATE "TeacherSubject" ts
SET "startedAt" = sub.first_term
FROM (
  SELECT u.id AS user_id, MIN(t."startDate") AS first_term
  FROM "User" u
  JOIN "Term" t ON t."schoolId" = u."schoolId"
  GROUP BY u.id
) sub
WHERE ts."userId" = sub.user_id
  AND ts."endedAt" IS NULL
  AND ts."createdAt" < TIMESTAMP '2026-07-30 21:00:00'
  AND ts."startedAt" > sub.first_term;

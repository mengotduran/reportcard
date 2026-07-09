-- Secondary schools now split each class into sections (A, B, C …), where each
-- section is its own class. Existing single-section classes are migrated to the
-- "… A" format. All references (students, subjects, class-master assignments)
-- key off the class name string, so they are cascaded in lockstep.
--
-- Guard: only classes that don't already end in a " <LETTER>" section suffix are
-- renamed, so re-running is a no-op. Every reference is an exact class-name match
-- (streams are already separate class rows), so a simple equality join is safe.

-- 1) Students
UPDATE "Student" s
SET "classLevel" = s."classLevel" || ' A'
FROM "ClassLevel" c
JOIN "School" sch ON sch."id" = c."schoolId"
WHERE s."schoolId" = c."schoolId"
  AND s."classLevel" = c."name"
  AND sch."type" = 'SECONDARY'
  AND c."name" !~ ' [A-Z]$';

-- 2) Subjects
UPDATE "Subject" sub
SET "classLevel" = sub."classLevel" || ' A'
FROM "ClassLevel" c
JOIN "School" sch ON sch."id" = c."schoolId"
WHERE sub."schoolId" = c."schoolId"
  AND sub."classLevel" = c."name"
  AND sch."type" = 'SECONDARY'
  AND c."name" !~ ' [A-Z]$';

-- 3) Class-master assignments
UPDATE "User" u
SET "masterClassLevel" = u."masterClassLevel" || ' A'
FROM "ClassLevel" c
JOIN "School" sch ON sch."id" = c."schoolId"
WHERE u."schoolId" = c."schoolId"
  AND u."masterClassLevel" = c."name"
  AND sch."type" = 'SECONDARY'
  AND c."name" !~ ' [A-Z]$';

-- 4) The classes themselves (done last so the joins above matched the old names)
UPDATE "ClassLevel" c
SET "name" = c."name" || ' A'
FROM "School" sch
WHERE sch."id" = c."schoolId"
  AND sch."type" = 'SECONDARY'
  AND c."name" !~ ' [A-Z]$';

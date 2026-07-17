-- Who records marks at a school. Defaults to TEACHERS so every existing school keeps
-- behaving exactly as it did; ADMIN_ONLY is opt-in per school (universities that keep
-- marks out of teachers' hands to remove the opportunity to cheat).
CREATE TYPE "MarksEntryMode" AS ENUM ('TEACHERS', 'ADMIN_ONLY');
ALTER TABLE "School" ADD COLUMN "marksEntryMode" "MarksEntryMode" NOT NULL DEFAULT 'TEACHERS';

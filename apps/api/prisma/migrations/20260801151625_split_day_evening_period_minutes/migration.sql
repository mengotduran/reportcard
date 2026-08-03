-- Day and Evening become two fully independent bell schedules: own periods, own breaks,
-- own minutes-per-period. There is no more "whole school" period, so `programme` becomes
-- required, and `periodMinutes` splits into a Day value and an Evening value.

-- 1. Rename the existing school-wide period length to be explicitly the DAY value, and add
--    the new EVENING value. Copied forward from the existing value so a school's absence/
--    coverage counting behaves exactly as before until an admin sets the evening value
--    separately (relevant to universities only, the only school type with an evening sitting).
ALTER TABLE "School" RENAME COLUMN "periodMinutes" TO "dayPeriodMinutes";
ALTER TABLE "School" ADD COLUMN "eveningPeriodMinutes" INTEGER;
UPDATE "School" SET "eveningPeriodMinutes" = "dayPeriodMinutes";

-- 2. Backfill every existing period row (all of which predate the Day/Evening split) by its
--    own clock time: 16:30 or later is Evening, everything before is Day. This is a no-op for
--    every school observed today except one that already runs an evening sitting past 16:30.
UPDATE "TimetablePeriod" SET "programme" = 'EVENING' WHERE "programme" IS NULL AND "startTime" >= '16:30';
UPDATE "TimetablePeriod" SET "programme" = 'DAY' WHERE "programme" IS NULL;

-- 3. No more null/"whole school" going forward — every period explicitly belongs to one sitting.
ALTER TABLE "TimetablePeriod" ALTER COLUMN "programme" SET NOT NULL;
ALTER TABLE "TimetablePeriod" ALTER COLUMN "programme" SET DEFAULT 'DAY';

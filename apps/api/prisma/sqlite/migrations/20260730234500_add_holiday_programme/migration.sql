-- Twin of the Postgres add_holiday_programme migration.
-- Which sitting a closure applies to. NULL = whole school, which is what every existing
-- holiday means, so nothing changes for current data.
ALTER TABLE "SchoolHoliday" ADD COLUMN "programme" TEXT;

-- Birth details for a student. Both optional: existing students keep NULL and print blank.
-- dateOfBirth is TEXT ("YYYY-MM-DD"), not a timestamp: a birth date has no time or zone,
-- and storing it as one shifts the day for anyone west of UTC.
ALTER TABLE "Student" ADD COLUMN "dateOfBirth" TEXT;
ALTER TABLE "Student" ADD COLUMN "placeOfBirth" TEXT;

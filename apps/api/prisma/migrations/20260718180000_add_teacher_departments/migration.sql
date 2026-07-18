-- Departments (secondary) / programmes (university) a teacher is explicitly placed
-- in, independent of subject assignment. Plain text array, not a relation: a
-- university has no real Department row (see department.controller.ts) to point at.
ALTER TABLE "User" ADD COLUMN "departments" TEXT[] NOT NULL DEFAULT '{}';

-- Departments group a secondary school's classes into streams
-- (Grammar / Technical / Commercial). Nullable link on ClassLevel; only
-- SECONDARY schools use it. Existing classes are tagged to a default "Grammar".

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_schoolId_name_key" ON "Department"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN "departmentId" TEXT;

-- AddForeignKey
ALTER TABLE "ClassLevel" ADD CONSTRAINT "ClassLevel_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every SECONDARY school gets a default "Grammar" department, and all
-- its existing classes are assigned to it. Class names are left unchanged so no
-- existing student/subject references (which key off the class name) break.
INSERT INTO "Department" ("id", "schoolId", "name", "order", "isDefault", "createdAt")
SELECT gen_random_uuid(), s."id", 'Grammar', 0, true, CURRENT_TIMESTAMP
FROM "School" s
WHERE s."type" = 'SECONDARY';

UPDATE "ClassLevel" c
SET "departmentId" = d."id"
FROM "Department" d
WHERE d."schoolId" = c."schoolId" AND d."isDefault" = true;

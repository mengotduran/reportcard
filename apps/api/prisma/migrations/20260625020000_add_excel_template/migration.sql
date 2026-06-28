CREATE TABLE "ExcelTemplate" (
  "id"          TEXT        NOT NULL,
  "schoolId"    TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "fileData"    BYTEA       NOT NULL,
  "classLevels" TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExcelTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExcelTemplate"
  ADD CONSTRAINT "ExcelTemplate_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

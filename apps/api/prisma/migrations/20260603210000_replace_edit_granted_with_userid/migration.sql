ALTER TABLE "ReportCard" DROP COLUMN IF EXISTS "marksEditGranted";
ALTER TABLE "ReportCard" DROP COLUMN IF EXISTS "remarksEditGranted";
ALTER TABLE "ReportCard" ADD COLUMN "marksEditGrantedTo" TEXT;
ALTER TABLE "ReportCard" ADD COLUMN "remarksEditGrantedTo" TEXT;

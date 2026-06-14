-- AlterTable
ALTER TABLE "ReportCard" ADD COLUMN     "marksEditGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remarksEditGranted" BOOLEAN NOT NULL DEFAULT false;

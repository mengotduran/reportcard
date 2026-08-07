-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN     "testMaxScore" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "HndRegistrationPayment" ADD COLUMN     "examNumber" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "testMaxScore" INTEGER NOT NULL DEFAULT 30;

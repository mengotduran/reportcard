-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('TUITION', 'REGISTRATION');

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN     "registrationFee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FeePayment" ADD COLUMN     "kind" "FeeKind" NOT NULL DEFAULT 'TUITION';

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "registrationSeparate" BOOLEAN NOT NULL DEFAULT false;

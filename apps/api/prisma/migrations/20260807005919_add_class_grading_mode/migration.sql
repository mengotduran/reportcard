-- CreateEnum
CREATE TYPE "GradingMode" AS ENUM ('NUMERIC', 'COMPETENCY');

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN     "gradingMode" "GradingMode" NOT NULL DEFAULT 'NUMERIC';

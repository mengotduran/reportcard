-- CreateEnum
CREATE TYPE "Programme" AS ENUM ('DAY', 'EVENING');

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN     "programme" "Programme" NOT NULL DEFAULT 'DAY';

-- AlterTable
ALTER TABLE "GuardianInvite" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");


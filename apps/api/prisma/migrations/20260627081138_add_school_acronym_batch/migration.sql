/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `ClassLevel` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `FeePayment` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ReportEntry` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ReportEntry` table. All the data in the column will be lost.
  - You are about to drop the column `accessExpiresAt` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `restrictionNote` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Subject` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TeacherSubject` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Term` table. All the data in the column will be lost.
  - You are about to drop the `SyncCursor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SyncToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SyncTombstone` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ExcelTemplate" DROP CONSTRAINT "ExcelTemplate_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "SyncToken" DROP CONSTRAINT "SyncToken_schoolId_fkey";

-- DropIndex
DROP INDEX "ReportEntry_reportCardId_subjectId_key";

-- AlterTable
ALTER TABLE "ClassLevel" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "ExcelTemplate" ALTER COLUMN "classLevels" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FeePayment" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "ReportEntry" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "School" DROP COLUMN "accessExpiresAt",
DROP COLUMN "restrictionNote",
ADD COLUMN     "acronym" TEXT,
ADD COLUMN     "batch" INTEGER;

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "TeacherSubject" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "Term" DROP COLUMN "updatedAt";

-- DropTable
DROP TABLE "SyncCursor";

-- DropTable
DROP TABLE "SyncToken";

-- DropTable
DROP TABLE "SyncTombstone";

-- AddForeignKey
ALTER TABLE "ExcelTemplate" ADD CONSTRAINT "ExcelTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

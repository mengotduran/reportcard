-- CreateEnum
CREATE TYPE "GuardianRequestStatus" AS ENUM ('PENDING', 'SENT', 'REJECTED');

-- CreateTable
CREATE TABLE "GuardianAccessRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "studentName" TEXT NOT NULL,
    "classLevel" TEXT NOT NULL,
    "parentName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "status" "GuardianRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "GuardianAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuardianAccessRequest_schoolId_status_idx" ON "GuardianAccessRequest"("schoolId", "status");

-- AddForeignKey
ALTER TABLE "GuardianAccessRequest" ADD CONSTRAINT "GuardianAccessRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianAccessRequest" ADD CONSTRAINT "GuardianAccessRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

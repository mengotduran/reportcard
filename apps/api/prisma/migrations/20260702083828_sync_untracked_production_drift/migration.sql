-- Same drift class as the 2026-07-01/02 incident (see DEPLOYMENT_ARCHITECTURE.md
-- section 2a): these fields/table were added to schema.prisma and applied to
-- local dev via `db push` over the following few days of feature work, but
-- NEVER got a tracked migration at all — so they were still missing from
-- production even after that incident's recovery. Caught because it broke
-- login for every user (User.preferredLanguage is selected on every login).
-- Generated from `prisma migrate diff --from-config-datasource ... --to-schema
-- prisma/schema.prisma --script` run directly against production, so this is
-- the exact, verified gap — not hand-guessed.

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN     "hndRegistrationFee" INTEGER;

-- AlterTable
ALTER TABLE "ReportCard" ADD COLUMN     "decision" TEXT;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "repeatThreshold" DOUBLE PRECISION,
ADD COLUMN     "website" TEXT,
ALTER COLUMN "coverImages" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "directLevel2Entry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRepeatingLevel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "printingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLanguage" TEXT NOT NULL DEFAULT 'EN';

-- CreateTable
CREATE TABLE "HndRegistrationPayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HndRegistrationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HndRegistrationPayment_studentId_session_idx" ON "HndRegistrationPayment"("studentId", "session");

-- AddForeignKey
ALTER TABLE "HndRegistrationPayment" ADD CONSTRAINT "HndRegistrationPayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HndRegistrationPayment" ADD CONSTRAINT "HndRegistrationPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

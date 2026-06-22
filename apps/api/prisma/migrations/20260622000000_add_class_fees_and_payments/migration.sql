-- Per-class fee (total per academic session, in XAF)
ALTER TABLE "ClassLevel" ADD COLUMN "feeAmount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing classes to a 150,000 starting fee; admins adjust per class.
UPDATE "ClassLevel" SET "feeAmount" = 150000;

-- Fee payments ledger (installments toward a class fee, scoped per session)
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeePayment_studentId_session_idx" ON "FeePayment"("studentId", "session");

ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PastTermMarksGrant" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT NOT NULL,

    CONSTRAINT "PastTermMarksGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PastTermMarksGrant_schoolId_termId_idx" ON "PastTermMarksGrant"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "PastTermMarksGrant_subjectId_termId_key" ON "PastTermMarksGrant"("subjectId", "termId");

-- AddForeignKey
ALTER TABLE "PastTermMarksGrant" ADD CONSTRAINT "PastTermMarksGrant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastTermMarksGrant" ADD CONSTRAINT "PastTermMarksGrant_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastTermMarksGrant" ADD CONSTRAINT "PastTermMarksGrant_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastTermMarksGrant" ADD CONSTRAINT "PastTermMarksGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

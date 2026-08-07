-- CreateTable
CREATE TABLE "SubjectExclusion" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectExclusion_schoolId_subjectId_idx" ON "SubjectExclusion"("schoolId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectExclusion_subjectId_studentId_key" ON "SubjectExclusion"("subjectId", "studentId");

-- AddForeignKey
ALTER TABLE "SubjectExclusion" ADD CONSTRAINT "SubjectExclusion_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectExclusion" ADD CONSTRAINT "SubjectExclusion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectExclusion" ADD CONSTRAINT "SubjectExclusion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;


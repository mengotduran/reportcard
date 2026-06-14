-- CreateTable
CREATE TABLE "ReportCardTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardTemplate_schoolId_key" ON "ReportCardTemplate"("schoolId");

-- AddForeignKey
ALTER TABLE "ReportCardTemplate" ADD CONSTRAINT "ReportCardTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

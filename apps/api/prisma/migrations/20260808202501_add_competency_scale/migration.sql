-- CreateTable
CREATE TABLE "CompetencyScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "levels" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyScale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyScale_schoolId_key" ON "CompetencyScale"("schoolId");

-- AddForeignKey
ALTER TABLE "CompetencyScale" ADD CONSTRAINT "CompetencyScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

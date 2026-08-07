-- CreateTable
CREATE TABLE "SchoolHoliday" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolHoliday_schoolId_startDate_idx" ON "SchoolHoliday"("schoolId", "startDate");

-- AddForeignKey
ALTER TABLE "SchoolHoliday" ADD CONSTRAINT "SchoolHoliday_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

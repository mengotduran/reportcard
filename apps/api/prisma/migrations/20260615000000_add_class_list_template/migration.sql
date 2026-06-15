-- CreateTable
CREATE TABLE "ClassListTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassListTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassListTemplate_schoolId_key" ON "ClassListTemplate"("schoolId");

-- AddForeignKey
ALTER TABLE "ClassListTemplate" ADD CONSTRAINT "ClassListTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

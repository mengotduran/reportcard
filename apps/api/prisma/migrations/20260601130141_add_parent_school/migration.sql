-- AlterTable
ALTER TABLE "School" ADD COLUMN     "parentSchoolId" TEXT;

-- CreateTable
CREATE TABLE "ParentSchool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentSchool_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_parentSchoolId_fkey" FOREIGN KEY ("parentSchoolId") REFERENCES "ParentSchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PromotionScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "trialMinimum" DOUBLE PRECISION,
    "passLabel" TEXT NOT NULL DEFAULT 'Pass',
    "trialLabel" TEXT NOT NULL DEFAULT 'This student was promoted on trial',
    "repeatLabel" TEXT NOT NULL DEFAULT 'Repeat',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionScale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionScale_schoolId_key" ON "PromotionScale"("schoolId");

-- AddForeignKey
ALTER TABLE "PromotionScale" ADD CONSTRAINT "PromotionScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PromotionScale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "trialMinimum" REAL,
    "passLabel" TEXT NOT NULL DEFAULT 'Pass',
    "trialLabel" TEXT NOT NULL DEFAULT 'This student was promoted on trial',
    "repeatLabel" TEXT NOT NULL DEFAULT 'Repeat',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromotionScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionScale_schoolId_key" ON "PromotionScale"("schoolId");

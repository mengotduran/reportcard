-- AlterTable: per-section language ('EN' | 'FR'). Existing schools default to English.
ALTER TABLE "School" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'EN';

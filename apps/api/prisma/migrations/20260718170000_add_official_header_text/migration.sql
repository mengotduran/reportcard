-- Official-header letterhead text (left/right blocks in the "Official" report card/
-- transcript style), EN+FR per side. Was added to schema.prisma in 086e6c8 but the
-- migration file was never generated, so production never got these columns. Nullable:
-- falls back to the legacy per-template text when unset.
ALTER TABLE "School" ADD COLUMN "officialLeftTextEn" TEXT;
ALTER TABLE "School" ADD COLUMN "officialLeftTextFr" TEXT;
ALTER TABLE "School" ADD COLUMN "officialRightTextEn" TEXT;
ALTER TABLE "School" ADD COLUMN "officialRightTextFr" TEXT;

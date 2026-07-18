-- Official stamp/seal image, printed on OFFICIAL copies only (see the `stamp` section
-- in the report card designer). Nullable: a school without one simply prints no stamp.
ALTER TABLE "School" ADD COLUMN "stamp" TEXT;

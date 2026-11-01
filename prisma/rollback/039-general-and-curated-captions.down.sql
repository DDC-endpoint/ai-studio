-- prisma/rollback/039-general-and-curated-captions.down.sql
-- Reverses 20261102140000_kit_website, 20261102130000_channel_facebook and
-- 20261102120000_caption_kind, in that order, in one transaction. FAILS CLOSED:
-- it refuses while any general caption, Facebook caption, deleted caption or
-- kit website exists, unless the session sets app.allow_caption_loss = on, and
-- then it DELETES them. Take a
-- pg_dump first. 'FACEBOOK' stays in the Channel type once added (Postgres
-- cannot drop an enum value; harmless to the previous image, as 031 §A).
--
--   pg_dump -Fc -U bistec -d <db> > pre-039-rollback.dump
--   docker exec -i ai-studio-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     -c "SET app.allow_caption_loss = 'on'" -f - < prisma/rollback/039-general-and-curated-captions.down.sql
BEGIN;
DO $$
DECLARE g int; f int; d int; w int := 0;
BEGIN
  SELECT count(*) INTO g FROM "DraftCaption" WHERE "kind"::text = 'GENERAL';
  SELECT count(*) INTO f FROM "DraftCaption" WHERE "channel"::text = 'FACEBOOK';
  SELECT count(*) INTO d FROM "DraftCaption" WHERE "deletedAt" IS NOT NULL;
  IF EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'BrandKit' AND column_name = 'website') THEN
    EXECUTE 'SELECT count(*) FROM "BrandKit" WHERE "website" IS NOT NULL' INTO w;
  END IF;
  IF g + f + d + w > 0 AND coalesce(current_setting('app.allow_caption_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION '039 rollback refused: % general captions, % Facebook captions, % deleted captions, % brand kits with a website. Set app.allow_caption_loss = on to delete them (see the header).', g, f, d, w;
  END IF;
END $$;
-- §A kit_website
ALTER TABLE "BrandKit" DROP COLUMN IF EXISTS "website";
-- §B channel_facebook (the value stays)
DELETE FROM "DraftCaption" WHERE "channel"::text = 'FACEBOOK';
-- §C caption_kind
DELETE FROM "DraftCaption" WHERE "kind" = 'GENERAL' OR "deletedAt" IS NOT NULL;
ALTER TABLE "DraftCaption" DROP CONSTRAINT "DraftCaption_general_not_deleted",
  DROP CONSTRAINT "DraftCaption_kind_channel";
DROP INDEX "DraftCaption_draftId_general_key";
DROP INDEX "DraftCaption_draftId_channel_curated_key";
ALTER TABLE "DraftCaption" DROP COLUMN "kind", DROP COLUMN "deletedAt", DROP COLUMN "previous",
  DROP COLUMN "generalHash", ALTER COLUMN "channel" SET NOT NULL;
CREATE UNIQUE INDEX "DraftCaption_draftId_channel_key" ON "DraftCaption"("draftId", "channel");
DROP TYPE "CaptionKind";
DELETE FROM "_prisma_migrations" WHERE "migration_name" IN
  ('20261102140000_kit_website', '20261102130000_channel_facebook', '20261102120000_caption_kind');
COMMIT;

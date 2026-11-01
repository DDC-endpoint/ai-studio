-- 039 D1-D4: the caption kind. Additive; existing rows become CURATED.
CREATE TYPE "CaptionKind" AS ENUM ('GENERAL', 'CURATED');

ALTER TABLE "DraftCaption"
  ADD COLUMN "kind" "CaptionKind" NOT NULL DEFAULT 'CURATED',
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "previous" JSONB,
  ADD COLUMN "generalHash" TEXT,
  ALTER COLUMN "channel" DROP NOT NULL;
-- The default only backfilled the existing rows; every writer names the kind.
ALTER TABLE "DraftCaption" ALTER COLUMN "kind" DROP DEFAULT;

-- Uniqueness is two partial indexes (Prisma does not model them; precedent:
-- Team_name_active_key). A plain unique on (draftId, channel) would admit two
-- general captions, because NULLs are distinct.
DROP INDEX "DraftCaption_draftId_channel_key";
CREATE UNIQUE INDEX "DraftCaption_draftId_general_key"
  ON "DraftCaption"("draftId") WHERE "kind" = 'GENERAL';
CREATE UNIQUE INDEX "DraftCaption_draftId_channel_curated_key"
  ON "DraftCaption"("draftId", "channel") WHERE "kind" = 'CURATED';

ALTER TABLE "DraftCaption" ADD CONSTRAINT "DraftCaption_kind_channel"
  CHECK (("kind" = 'GENERAL' AND "channel" IS NULL) OR ("kind" = 'CURATED' AND "channel" IS NOT NULL));
ALTER TABLE "DraftCaption" ADD CONSTRAINT "DraftCaption_general_not_deleted"
  CHECK ("deletedAt" IS NULL OR "kind" = 'CURATED');

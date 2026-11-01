-- 037 remove_scheduling_publishing: drops scheduled generation and publishing.
-- Manual down script: prisma/rollback/037-remove-scheduling-publishing.down.sql
-- (restores the schema only; no data comes back).

-- 1. Fail-closed precondition (037 D2). Nothing below runs if this raises.
DO $$
DECLARE
  p int;
  t int;
  g int;
  d int;
BEGIN
  SELECT count(*) INTO p FROM "Post";
  SELECT count(*) INTO t FROM "ChannelToken";
  SELECT count(*) INTO g FROM "ScheduledGeneration";
  SELECT count(*) INTO d FROM "Draft" WHERE "status" = 'PUBLISHED';
  IF p + t + g + d > 0 THEN
    RAISE EXCEPTION '037 remove_scheduling_publishing refused: % Post, % ChannelToken, % ScheduledGeneration, % PUBLISHED drafts. Run scripts/clear-publishing-data.mjs first (see docs/deploy.md).', p, t, g, d;
  END IF;
END $$;

-- 2. Drop the tables (their foreign keys go first), then their enums.
ALTER TABLE "ScheduledGeneration" DROP CONSTRAINT "ScheduledGeneration_campaignId_fkey";
ALTER TABLE "ScheduledGeneration" DROP CONSTRAINT "ScheduledGeneration_createdById_fkey";
ALTER TABLE "ScheduledGeneration" DROP CONSTRAINT "ScheduledGeneration_templateId_fkey";
ALTER TABLE "ScheduledGeneration" DROP CONSTRAINT "ScheduledGeneration_briefId_fkey";
ALTER TABLE "ScheduledGeneration" DROP CONSTRAINT "ScheduledGeneration_draftId_fkey";
ALTER TABLE "Post" DROP CONSTRAINT "Post_draftId_fkey";
ALTER TABLE "Post" DROP CONSTRAINT "Post_userId_fkey";

DROP TABLE "ScheduledGeneration";
DROP TABLE "Post";
DROP TABLE "ChannelToken";

DROP TYPE "PostStatus";
DROP TYPE "GenerationStatus";
DROP TYPE "PostGenerationAction";

-- 3. Rebuild DraftStatus without PUBLISHED (the column default is kept).
CREATE TYPE "DraftStatus_new" AS ENUM ('IN_PROGRESS', 'EXPORTED', 'FAILED');
ALTER TABLE "Draft" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Draft" ALTER COLUMN "status" TYPE "DraftStatus_new" USING ("status"::text::"DraftStatus_new");
ALTER TYPE "DraftStatus" RENAME TO "DraftStatus_old";
ALTER TYPE "DraftStatus_new" RENAME TO "DraftStatus";
DROP TYPE "DraftStatus_old";
ALTER TABLE "Draft" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';

-- 4. Heartbeats of the removed loops (only retention remains).
DELETE FROM "WorkerHeartbeat" WHERE "loop" <> 'retention';

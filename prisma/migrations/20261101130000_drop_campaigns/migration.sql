-- 038 drop_campaigns: campaigns become projects. Drops the Campaign tables and Brief.campaignId.
-- Manual down script: prisma/rollback/038-drop-campaigns.down.sql
-- (restores the schema only; no data comes back).

-- 1. Fail-closed precondition (038 D19). Nothing below runs if this raises.
DO $$
DECLARE
  c int;
  b int;
  d int;
  l int;
  r int;
  v int;
BEGIN
  SELECT count(*) INTO c FROM "Campaign";
  SELECT count(*) INTO b FROM "CampaignBriefing";
  SELECT count(*) INTO d FROM "CampaignDocument";
  SELECT count(*) INTO l FROM "ProjectCampaign";
  SELECT count(*) INTO r FROM "Brief" WHERE "campaignId" IS NOT NULL;
  IF c + b + d + l + r > 0 THEN
    RAISE EXCEPTION '038 drop_campaigns refused: % Campaign, % CampaignBriefing, % CampaignDocument, % ProjectCampaign, % briefs with a campaign. Run scripts/clear-campaign-data.mjs first (see docs/deploy.md).', c, b, d, l, r;
  END IF;
  SELECT count(*) INTO v FROM "Brief";
  RAISE NOTICE '038: % posts are now visible to every member of their team (see docs/deploy.md).', v;
END $$;

-- 2. Drop the constraints, the index and the column, then the tables.
-- DropForeignKey
ALTER TABLE "Brief" DROP CONSTRAINT "Brief_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_brandKitId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignBriefing" DROP CONSTRAINT "CampaignBriefing_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "CampaignDocument" DROP CONSTRAINT "CampaignDocument_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectCampaign" DROP CONSTRAINT "ProjectCampaign_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectCampaign" DROP CONSTRAINT "ProjectCampaign_projectId_fkey";

-- DropIndex
DROP INDEX "Brief_campaignId_idx";

-- AlterTable
ALTER TABLE "Brief" DROP COLUMN "campaignId";

-- DropTable
DROP TABLE "Campaign";

-- DropTable
DROP TABLE "CampaignBriefing";

-- DropTable
DROP TABLE "CampaignDocument";

-- DropTable
DROP TABLE "ProjectCampaign";


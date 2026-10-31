-- 038 FR-22: the manual rollback, run only to put back the SCHEMA that
-- 20261101130000_drop_campaigns removed: the Campaign, CampaignDocument,
-- CampaignBriefing and ProjectCampaign tables (with their indexes and foreign
-- keys) and Brief.campaignId. NO DATA COMES BACK: the rows were cleared before
-- the migration ran (scripts/clear-campaign-data.mjs) and the stored document
-- objects were swept. Nothing in the app reads these tables any more. It sits
-- outside prisma/migrations/ on purpose: `migrate deploy` never applies it.
--
--   docker exec -i ai-studio-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/038-drop-campaigns.down.sql

-- AlterTable
ALTER TABLE "Brief" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandKitId" TEXT,
    "defaultTone" TEXT,
    "defaultPostStyle" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDocument" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBriefing" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCampaign" (
    "projectId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "ProjectCampaign_pkey" PRIMARY KEY ("projectId","campaignId")
);

-- CreateIndex
CREATE INDEX "Campaign_teamId_idx" ON "Campaign"("teamId");

-- CreateIndex
CREATE INDEX "CampaignDocument_campaignId_idx" ON "CampaignDocument"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignDocument_teamId_idx" ON "CampaignDocument"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBriefing_campaignId_version_key" ON "CampaignBriefing"("campaignId", "version");

-- CreateIndex
CREATE INDEX "Brief_campaignId_idx" ON "Brief"("campaignId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDocument" ADD CONSTRAINT "CampaignDocument_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBriefing" ADD CONSTRAINT "CampaignBriefing_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCampaign" ADD CONSTRAINT "ProjectCampaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCampaign" ADD CONSTRAINT "ProjectCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;


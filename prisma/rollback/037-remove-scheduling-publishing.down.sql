-- 037 FR-01: the manual rollback, run only to put back the SCHEMA that
-- 20261031120000_remove_scheduling_publishing removed: the Post, ChannelToken
-- and ScheduledGeneration tables (with their indexes and foreign keys), the
-- PostStatus, GenerationStatus and PostGenerationAction enums, and the PUBLISHED
-- value of DraftStatus. NO DATA COMES BACK: the rows (posts, stored channel
-- tokens, scheduled entries) were cleared before the migration ran, and drafts
-- that were PUBLISHED are EXPORTED now. The worker heartbeat rows of the removed
-- loops are not restored either. It sits outside prisma/migrations/ on purpose:
-- `migrate deploy` never applies it.
--
--   docker exec -i ai-studio-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/037-remove-scheduling-publishing.down.sql

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostGenerationAction" AS ENUM ('HOLD', 'SCHEDULE_PUBLISH', 'PUBLISH_NOW');

-- AlterEnum
ALTER TYPE "DraftStatus" ADD VALUE 'PUBLISHED' BEFORE 'FAILED';

-- CreateTable
CREATE TABLE "ScheduledGeneration" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "postStyle" TEXT,
    "channels" "Channel"[],
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'SQUARE',
    "designMode" "DesignMode" NOT NULL,
    "templateId" TEXT,
    "generateAt" TIMESTAMP(3) NOT NULL,
    "postAction" "PostGenerationAction" NOT NULL DEFAULT 'HOLD',
    "publishAt" TIMESTAMP(3),
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "heldReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "briefId" TEXT,
    "draftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "platformId" TEXT,
    "errorReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelToken" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "encryptedMetadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledGeneration_status_generateAt_idx" ON "ScheduledGeneration"("status", "generateAt");

-- CreateIndex
CREATE INDEX "ScheduledGeneration_status_nextRetryAt_idx" ON "ScheduledGeneration"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ScheduledGeneration_campaignId_idx" ON "ScheduledGeneration"("campaignId");

-- CreateIndex
CREATE INDEX "ScheduledGeneration_teamId_idx" ON "ScheduledGeneration"("teamId");

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Post_status_nextRetryAt_idx" ON "Post"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "Post_draftId_idx" ON "Post"("draftId");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Post_teamId_idx" ON "Post"("teamId");

-- CreateIndex
CREATE INDEX "ChannelToken_teamId_idx" ON "ChannelToken"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelToken_teamId_channel_key" ON "ChannelToken"("teamId", "channel");

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BrandKitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un-record the migration, so a later redeploy's boot `migrate deploy`
-- re-applies it instead of seeing it as applied.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261031120000_remove_scheduling_publishing';

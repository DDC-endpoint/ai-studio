-- 038 T2: the manual rollback, run only to remove what 20261101120000_project_inputs added.
-- WARNING: it discards every project briefing and project document row, every post's
-- project assignment (Brief.projectId), every project default post style, and every
-- draft's stored generation-inputs stamp. Schema only: the document objects in the
-- BUCKET_DOCS under projects/<projectId>/ stay (delete them by hand if wanted). The
-- previous image never touches these columns and tables. It sits outside
-- prisma/migrations/ on purpose: `migrate deploy` never applies it.
--
--   docker exec -i ai-studio-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/038-project-inputs.down.sql

ALTER TABLE "Brief" DROP CONSTRAINT IF EXISTS "Brief_projectId_fkey";
DROP INDEX IF EXISTS "Brief_projectId_idx";
ALTER TABLE "Brief" DROP COLUMN IF EXISTS "projectId";

ALTER TABLE "Draft" DROP COLUMN IF EXISTS "generationInputs";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "defaultPostStyle";

DROP TABLE IF EXISTS "ProjectBriefing";
DROP TABLE IF EXISTS "ProjectDocument";

-- Un-record the migration, so a later redeploy's boot `migrate deploy`
-- re-applies it instead of seeing it as applied.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261101120000_project_inputs';

ALTER TABLE "hermes_research_runs" DROP CONSTRAINT IF EXISTS "hermes_research_runs_generation_grant_check";
DROP INDEX IF EXISTS "hermes_research_steps_presentation_asset_id_idx";
ALTER TABLE "hermes_research_steps" DROP CONSTRAINT IF EXISTS "hermes_research_steps_presentation_asset_id_fkey";
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT IF EXISTS "hermes_research_runs_version_scope_fkey";
ALTER TABLE "hermes_research_steps" DROP COLUMN IF EXISTS "presentation_asset_id";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "hermes_research_steps" WHERE "ingestion_task_id" IS NULL OR "artifact_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot roll back Hermes workflow while generation steps exist';
  END IF;
END $$;
ALTER TABLE "hermes_research_steps"
  ALTER COLUMN "ingestion_task_id" SET NOT NULL,
  ALTER COLUMN "artifact_id" SET NOT NULL;
ALTER TABLE "hermes_research_runs"
  DROP COLUMN IF EXISTS "source_claim_ids",
  DROP COLUMN IF EXISTS "source_review_digest",
  DROP COLUMN IF EXISTS "max_agent_tasks",
  DROP COLUMN IF EXISTS "profile",
  DROP COLUMN IF EXISTS "version_id";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260908020000_hermes_research_workflow';

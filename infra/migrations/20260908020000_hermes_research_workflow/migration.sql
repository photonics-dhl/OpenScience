ALTER TABLE "hermes_research_runs"
  ADD COLUMN "version_id" UUID,
  ADD COLUMN "profile" TEXT,
  ADD COLUMN "max_agent_tasks" INTEGER,
  ADD COLUMN "source_review_digest" TEXT,
  ADD COLUMN "source_claim_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE "hermes_research_steps"
  ALTER COLUMN "ingestion_task_id" DROP NOT NULL,
  ALTER COLUMN "artifact_id" DROP NOT NULL,
  ADD COLUMN "presentation_asset_id" UUID;

ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_version_scope_fkey"
  FOREIGN KEY ("version_id", "research_object_id") REFERENCES "versions"("id", "research_object_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hermes_research_steps" ADD CONSTRAINT "hermes_research_steps_presentation_asset_id_fkey"
  FOREIGN KEY ("presentation_asset_id") REFERENCES "presentation_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "hermes_research_steps_presentation_asset_id_idx" ON "hermes_research_steps"("presentation_asset_id");
ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL) OR (profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7));

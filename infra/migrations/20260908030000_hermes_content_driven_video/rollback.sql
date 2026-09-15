DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "hermes_research_runs" WHERE profile = 'content-driven-v1' OR max_agent_tasks = 8) THEN
    RAISE EXCEPTION 'Retain additive grant schema: content-driven run records exist';
  END IF;
END $$;
ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check_legacy"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL) OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7)) NOT VALID;
ALTER TABLE "hermes_research_runs" VALIDATE CONSTRAINT "hermes_research_runs_generation_grant_check_legacy";
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT "hermes_research_runs_generation_grant_check";
ALTER TABLE "hermes_research_runs" RENAME CONSTRAINT "hermes_research_runs_generation_grant_check_legacy" TO "hermes_research_runs_generation_grant_check";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260908030000_hermes_content_driven_video';

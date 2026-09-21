-- Store additive rendering grants without enumerating each future task total.
-- Domain authorization still requires an exact, atomic repair receipt for dynamic grants.
BEGIN;
ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check_render"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-v1' AND max_agent_tasks = 8)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-image-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'visual-narrative-v1' AND max_agent_tasks >= 9)) NOT VALID;
ALTER TABLE "hermes_research_runs" VALIDATE CONSTRAINT "hermes_research_runs_generation_grant_check_render";
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT "hermes_research_runs_generation_grant_check";
ALTER TABLE "hermes_research_runs" RENAME CONSTRAINT "hermes_research_runs_generation_grant_check_render" TO "hermes_research_runs_generation_grant_check";
COMMIT;

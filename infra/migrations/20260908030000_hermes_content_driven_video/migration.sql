ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check_v2"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-v1' AND max_agent_tasks = 8)) NOT VALID;
ALTER TABLE "hermes_research_runs" VALIDATE CONSTRAINT "hermes_research_runs_generation_grant_check_v2";
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT "hermes_research_runs_generation_grant_check";
ALTER TABLE "hermes_research_runs" RENAME CONSTRAINT "hermes_research_runs_generation_grant_check_v2" TO "hermes_research_runs_generation_grant_check";

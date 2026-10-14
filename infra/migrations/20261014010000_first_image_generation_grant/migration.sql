-- First-image and managed style continuations reuse reviewed science with exactly
-- one plan task and one render task. Domain receipt checks still authorize each task.
-- Keep the original grant families and dynamic grants unchanged.
BEGIN;
ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check_two_task"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-v1' AND max_agent_tasks = 8)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-image-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'visual-narrative-v1' AND (max_agent_tasks = 2 OR max_agent_tasks >= 9))) NOT VALID;
ALTER TABLE "hermes_research_runs" VALIDATE CONSTRAINT "hermes_research_runs_generation_grant_check_two_task";
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT "hermes_research_runs_generation_grant_check";
ALTER TABLE "hermes_research_runs" RENAME CONSTRAINT "hermes_research_runs_generation_grant_check_two_task" TO "hermes_research_runs_generation_grant_check";
COMMIT;

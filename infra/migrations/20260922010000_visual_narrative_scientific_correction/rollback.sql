-- Never reduce a paid grant or delete history to roll back. If eleven-task grants
-- exist, retain this additive constraint across application rollback instead.
BEGIN;
LOCK TABLE "hermes_research_runs" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "hermes_research_runs" WHERE profile = 'visual-narrative-v1' AND max_agent_tasks = 11) THEN
    RAISE EXCEPTION 'Retain the expanded constraint: authorized eleven-task runs exist';
  END IF;
END $$;
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT "hermes_research_runs_generation_grant_check";
ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-v1' AND max_agent_tasks = 8)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-image-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'visual-narrative-v1' AND max_agent_tasks = 9));
COMMIT;

-- Never reduce an authorized grant or erase task history to fit old application code.
BEGIN;
LOCK TABLE "hermes_research_runs" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "hermes_research_runs" WHERE profile = 'visual-narrative-v1' AND max_agent_tasks NOT IN (9, 11, 13)) THEN
    RAISE EXCEPTION 'Retain the expanded constraint: dynamic rendering grants exist';
  END IF;
END $$;
ALTER TABLE "hermes_research_runs" DROP CONSTRAINT "hermes_research_runs_generation_grant_check";
ALTER TABLE "hermes_research_runs" ADD CONSTRAINT "hermes_research_runs_generation_grant_check"
  CHECK ((profile IS NULL AND max_agent_tasks IS NULL)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'onchip-field-sampling-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-v1' AND max_agent_tasks = 8)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'content-driven-image-v1' AND max_agent_tasks = 7)
    OR (profile IS NOT NULL AND max_agent_tasks IS NOT NULL AND profile = 'visual-narrative-v1' AND max_agent_tasks IN (9, 11, 13)));
COMMIT;

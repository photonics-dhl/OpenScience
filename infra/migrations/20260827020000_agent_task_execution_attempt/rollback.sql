ALTER TABLE "agent_tasks"
  DROP CONSTRAINT IF EXISTS "agent_tasks_execution_attempt_check",
  DROP COLUMN "execution_attempt";

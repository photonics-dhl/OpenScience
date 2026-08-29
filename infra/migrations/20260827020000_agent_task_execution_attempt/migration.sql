ALTER TABLE "agent_tasks"
  ADD COLUMN "execution_attempt" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "agent_tasks"
  ADD CONSTRAINT "agent_tasks_execution_attempt_check"
  CHECK ("execution_attempt" >= 0);

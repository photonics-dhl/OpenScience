CREATE TABLE "hermes_research_runs" (
  "id" UUID NOT NULL,
  "research_object_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" TEXT NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "error" TEXT,
  "last_reconciled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hermes_research_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hermes_research_runs_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hermes_research_runs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "hermes_research_runs_idempotency_key_key" ON "hermes_research_runs"("idempotency_key");
CREATE INDEX "idx_hermes_research_runs_reconcile" ON "hermes_research_runs"("status", "last_reconciled_at");
CREATE INDEX "idx_hermes_research_runs_scope" ON "hermes_research_runs"("research_object_id", "actor_id");

CREATE TABLE "hermes_research_steps" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "stage" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "ingestion_task_id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "agent_task_id" UUID,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hermes_research_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hermes_research_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "hermes_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hermes_research_steps_ingestion_task_id_fkey" FOREIGN KEY ("ingestion_task_id") REFERENCES "ingestion_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hermes_research_steps_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "hermes_research_steps_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "hermes_research_steps_run_stage_ordinal_key" ON "hermes_research_steps"("run_id", "stage", "ordinal");
CREATE INDEX "hermes_research_steps_ingestion_task_id_idx" ON "hermes_research_steps"("ingestion_task_id");
CREATE INDEX "hermes_research_steps_agent_task_id_idx" ON "hermes_research_steps"("agent_task_id");

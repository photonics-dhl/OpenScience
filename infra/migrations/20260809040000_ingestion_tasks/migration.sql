CREATE TYPE "IngestionTaskState" AS ENUM (
  'queued', 'uploading', 'stored', 'parsing', 'needs_review', 'confirmed', 'written', 'failed_retryable', 'failed_blocked'
);

ALTER TABLE "agent_sessions" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "agent_sessions_idempotency_key_key" ON "agent_sessions"("idempotency_key");
ALTER TABLE "agent_tasks" ADD COLUMN "dispatched_at" TIMESTAMP(3);

CREATE TABLE "ingestion_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "research_object_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "agent_session_id" UUID,
  "idempotency_key" TEXT,
  "request_digest" CHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ingestion_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ingestion_batches_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE,
  CONSTRAINT "ingestion_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "ingestion_batches_agent_session_id_fkey" FOREIGN KEY ("agent_session_id") REFERENCES "agent_sessions"("id") ON DELETE SET NULL
);

CREATE TABLE "ingestion_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "agent_task_id" UUID,
  "state" "IngestionTaskState" NOT NULL DEFAULT 'queued',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ingestion_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ingestion_tasks_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ingestion_batches"("id") ON DELETE CASCADE,
  CONSTRAINT "ingestion_tasks_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT,
  CONSTRAINT "ingestion_tasks_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "ingestion_batches_idempotency_key_key" ON "ingestion_batches"("idempotency_key");
CREATE UNIQUE INDEX "ingestion_batches_agent_session_id_key" ON "ingestion_batches"("agent_session_id");
CREATE INDEX "ingestion_batches_research_object_id_idx" ON "ingestion_batches"("research_object_id");
CREATE UNIQUE INDEX "ingestion_tasks_agent_task_id_key" ON "ingestion_tasks"("agent_task_id");
CREATE UNIQUE INDEX "ingestion_tasks_batch_id_artifact_id_key" ON "ingestion_tasks"("batch_id", "artifact_id");
CREATE INDEX "ingestion_tasks_batch_id_idx" ON "ingestion_tasks"("batch_id");

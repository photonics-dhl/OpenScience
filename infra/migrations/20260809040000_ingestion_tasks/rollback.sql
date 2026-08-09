DROP TABLE IF EXISTS "ingestion_tasks";
DROP TABLE IF EXISTS "ingestion_batches";
DROP TYPE IF EXISTS "IngestionTaskState";
DROP INDEX IF EXISTS "agent_sessions_idempotency_key_key";
ALTER TABLE "agent_sessions" DROP COLUMN IF EXISTS "idempotency_key";
ALTER TABLE "agent_tasks" DROP COLUMN IF EXISTS "dispatched_at";

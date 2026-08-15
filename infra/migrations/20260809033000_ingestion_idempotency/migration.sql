-- Product ingestion: make RO creation and Artifact upload safe to replay after response loss.
ALTER TABLE "research_objects" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "artifacts" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "research_objects_idempotency_key_key"
  ON "research_objects"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "artifacts_idempotency_key_key"
  ON "artifacts"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;

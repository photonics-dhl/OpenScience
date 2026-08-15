DROP INDEX IF EXISTS "artifacts_idempotency_key_key";
DROP INDEX IF EXISTS "research_objects_idempotency_key_key";
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "idempotency_key";
ALTER TABLE "research_objects" DROP COLUMN IF EXISTS "idempotency_key";

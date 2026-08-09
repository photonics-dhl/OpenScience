DROP INDEX IF EXISTS "research_objects_idempotency_key_key";
ALTER TABLE "research_objects" DROP COLUMN IF EXISTS "idempotency_key";

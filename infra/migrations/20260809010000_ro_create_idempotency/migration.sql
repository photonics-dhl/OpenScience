-- Additive, nullable idempotency key for guided RO creation.
ALTER TABLE "research_objects" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "research_objects_idempotency_key_key" ON "research_objects"("idempotency_key");

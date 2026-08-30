ALTER TABLE "notifications" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

CREATE TABLE "external_provider_states" (
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "auth_required_generation" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_provider_states_pkey" PRIMARY KEY ("provider"),
  CONSTRAINT "external_provider_states_provider_check" CHECK ("provider" = 'scansci'),
  CONSTRAINT "external_provider_states_status_check" CHECK ("status" IN ('healthy', 'auth_required')),
  CONSTRAINT "external_provider_states_generation_check" CHECK ("auth_required_generation" >= 0)
);

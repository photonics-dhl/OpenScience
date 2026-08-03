-- P1A-7 migration 6: quota_policies + usage_ledger（配额策略与 AI Credit 账务骨架）
-- 行级限额配置（workspace → user_level → global 三层回退）+ 只追加用量/授予流水。

CREATE TABLE "quota_policies" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_key" TEXT,
    "resource" TEXT NOT NULL,
    "limit_value" BIGINT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "quota_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quota_policies_scope_key_resource_key" UNIQUE ("scope", "scope_key", "resource")
);

CREATE INDEX "quota_policies_resource_idx" ON "quota_policies"("resource");

CREATE TABLE "usage_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "workspace_id" UUID,
    "resource" TEXT NOT NULL,
    "delta" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT,
    "reason" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_ledger_idempotency_key_key" UNIQUE ("idempotency_key")
);

CREATE INDEX "usage_ledger_user_resource_time_idx" ON "usage_ledger"("user_id", "resource", "created_at");
CREATE INDEX "usage_ledger_ws_resource_time_idx" ON "usage_ledger"("workspace_id", "resource", "created_at");
CREATE INDEX "usage_ledger_resource_period_idx" ON "usage_ledger"("resource", "period");

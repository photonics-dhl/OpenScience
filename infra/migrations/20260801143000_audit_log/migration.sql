CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "workspace_id" UUID,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "request_id" TEXT,
    "ip" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_workspace_id_idx" ON "audit_logs"("workspace_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- P1B-7 迁移 11：RO 可见性模型（§4.2 private/invite_only/public + §4.2 扩大显式审批记录 + §17 越权防护）
-- 决策：VisibilityGrant 表（invite_only 指定账户，RO 级独立）；VisibilityRequest 表（扩大变更请求，审批流 Phase 1D）

CREATE TABLE "visibility_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visibility_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visibility_grants_ro_grantee_key" UNIQUE ("research_object_id", "grantee_id"),
    CONSTRAINT "visibility_grants_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visibility_grants_grantee_id_fkey"
      FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visibility_grants_granted_by_fkey"
      FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "visibility_grants_research_object_id_idx" ON "visibility_grants"("research_object_id");

CREATE TABLE "visibility_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "from_visibility" "RoVisibility" NOT NULL,
    "to_visibility" "RoVisibility" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visibility_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visibility_requests_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "visibility_requests_requested_by_fkey"
      FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "visibility_requests_research_object_id_idx" ON "visibility_requests"("research_object_id");

-- P1D-7 迁移 17：审核申诉与 Moderator 队列（§11.3 申诉 + §15 Appeal + §16 appeal.created）
-- additive：一新表，不破坏既有数据。

CREATE TABLE "appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "research_object_id" UUID NOT NULL,
    "ai_review_id" UUID NOT NULL,
    "appellant_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',  -- pending / resolved / rejected
    "moderator_id" UUID,
    "resolution" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appeals_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appeals_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appeals_ai_review_id_fkey" FOREIGN KEY ("ai_review_id") REFERENCES "ai_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appeals_appellant_id_fkey" FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appeals_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "appeals_version_id_idx" ON "appeals"("version_id");
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

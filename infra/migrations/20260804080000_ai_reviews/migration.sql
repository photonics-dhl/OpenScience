-- P1D-5 迁移 16：AI 发布审核记录（§15 AIReview + §11.1 硬阻断 + §11.3 稳定可引用）
-- additive：一新表，不破坏既有数据。

CREATE TABLE "ai_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "research_object_id" UUID NOT NULL,
    "status" TEXT NOT NULL,              -- passed / blocked
    "hard_blocks" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "verdict" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_reviews_version_id_key" UNIQUE ("version_id"),
    CONSTRAINT "ai_reviews_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ai_reviews_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ai_reviews_research_object_id_idx" ON "ai_reviews"("research_object_id");

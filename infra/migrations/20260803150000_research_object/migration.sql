-- P1B-2 迁移 7：ResearchObject / SDFDocument / SDFNode（§15 核心实体 + §4.1 状态机 + §4.2 可见性 + §5.1 六字段）
-- 决策：主键 UUID v4（对齐现有 6 表）；SDFNode 固定六型；visibility 本任务建（private 默认，P1B-7 只加强制）

CREATE TYPE "RoStatus" AS ENUM (
  'draft', 'under_review', 'approved', 'published', 'revised',
  'withdrawn', 'restricted', 'rejected', 'archived'
);
CREATE TYPE "RoVisibility" AS ENUM ('private', 'invite_only', 'public');
CREATE TYPE "SdfNodeType" AS ENUM (
  'problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'
);

CREATE TABLE "research_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RoStatus" NOT NULL DEFAULT 'draft',
    "visibility" "RoVisibility" NOT NULL DEFAULT 'private',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_objects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "research_objects_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "research_objects_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "research_objects_workspace_id_idx" ON "research_objects"("workspace_id");

CREATE TABLE "sdf_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "core_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sdf_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sdf_documents_research_object_id_key" UNIQUE ("research_object_id"),
    CONSTRAINT "sdf_documents_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "sdf_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sdf_document_id" UUID NOT NULL,
    "node_type" "SdfNodeType" NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sdf_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sdf_nodes_sdf_document_id_fkey"
      FOREIGN KEY ("sdf_document_id") REFERENCES "sdf_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sdf_nodes_doc_type_key" UNIQUE ("sdf_document_id", "node_type")
);

CREATE INDEX "sdf_nodes_sdf_document_id_idx" ON "sdf_nodes"("sdf_document_id");

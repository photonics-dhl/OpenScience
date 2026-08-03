-- P1B-3 迁移 8：Blob 内容寻址存储 + Artifact 元数据（§7.2.1 内容寻址 + §7.2.2 元数据 + §13.1 数据库只存元数据/对象键）
-- 决策：Blob.sha256 主键（去重，§7.1）；Artifact.logicalPath 非唯一（同名可多次上传，P1B-4 Version Manifest 再去重）；
--       storage_key 解耦对象存储路径（`blobs/<h2>/<h4>/<sha256>` 分段，避免单目录千万文件）

CREATE TABLE "blobs" (
    "sha256" CHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blobs_pkey" PRIMARY KEY ("sha256")
);

CREATE TABLE "artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logical_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" BIGINT NOT NULL,
    "blob_sha256" CHAR(64) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artifacts_blob_sha256_fkey"
      FOREIGN KEY ("blob_sha256") REFERENCES "blobs"("sha256") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "artifacts_uploaded_by_fkey"
      FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "artifacts_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "artifacts_workspace_id_idx" ON "artifacts"("workspace_id");
CREATE INDEX "artifacts_blob_sha256_idx" ON "artifacts"("blob_sha256");

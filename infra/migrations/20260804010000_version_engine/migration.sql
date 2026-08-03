-- P1B-4 迁移 9：Commit/Manifest 增量版本引擎（§15 Branch/Commit/ChangeSet/Version/VersionManifest + §7.2.3 Manifest 引用 + §7.2.4 复用 Blob + §7.2.5 JSON Patch）
-- 决策：Branch 默认 main（Phase 1C 扩展）；ChangeSet 存单 op（apply 链重建）；Version 仅 draft（P1B-7 发布状态机）；ManifestEntry 存 blobSha256 冗余（重建免 join）

CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "branches_research_object_id_name_key" UNIQUE ("research_object_id", "name"),
    CONSTRAINT "branches_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "branches_research_object_id_idx" ON "branches"("research_object_id");

CREATE TABLE "commits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "parent_commit_id" UUID,
    "message" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commits_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "commits_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "commits_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "commits_parent_commit_id_fkey"
      FOREIGN KEY ("parent_commit_id") REFERENCES "commits"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "commits_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "commits_branch_id_created_at_idx" ON "commits"("branch_id", "created_at");
CREATE INDEX "commits_research_object_id_idx" ON "commits"("research_object_id");

CREATE TABLE "changesets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commit_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changesets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "changesets_commit_id_fkey"
      FOREIGN KEY ("commit_id") REFERENCES "commits"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "changesets_commit_id_idx" ON "changesets"("commit_id");

CREATE TYPE "VersionStatus" AS ENUM ('draft', 'published', 'revised', 'withdrawn');

CREATE TABLE "versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "commit_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "versions_research_object_id_version_no_key" UNIQUE ("research_object_id", "version_no"),
    CONSTRAINT "versions_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "versions_commit_id_fkey"
      FOREIGN KEY ("commit_id") REFERENCES "commits"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "versions_research_object_id_idx" ON "versions"("research_object_id");

CREATE TABLE "version_manifests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "core_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_manifests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "version_manifests_version_id_key" UNIQUE ("version_id"),
    CONSTRAINT "version_manifests_version_id_fkey"
      FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "manifest_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "manifest_id" UUID NOT NULL,
    "logical_path" TEXT NOT NULL,
    "artifact_id" UUID NOT NULL,
    "blob_sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manifest_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "manifest_entries_manifest_id_logical_path_key" UNIQUE ("manifest_id", "logical_path"),
    CONSTRAINT "manifest_entries_manifest_id_fkey"
      FOREIGN KEY ("manifest_id") REFERENCES "version_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "manifest_entries_manifest_id_idx" ON "manifest_entries"("manifest_id");

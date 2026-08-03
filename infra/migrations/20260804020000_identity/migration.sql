-- P1B-6 迁移 10：标识层与时间戳服务（§6.1 公开 ID + §6.2 时间戳/哈希 + §15 Identifier/Publication）
-- 决策：publicId 发布时分配（draft 无）；Identifier/Publication 预留法律免责声明字段；publicVersionId = OSR-YYYY-NNNNNN-vN

ALTER TABLE "research_objects" ADD COLUMN "public_id" TEXT;
ALTER TABLE "versions" ADD COLUMN "public_version_id" TEXT;

CREATE UNIQUE INDEX "research_objects_public_id_key" ON "research_objects"("public_id");
CREATE UNIQUE INDEX "versions_public_version_id_key" ON "versions"("public_version_id");

CREATE TABLE "identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "legal_disclaimer" TEXT,

    CONSTRAINT "identifiers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "identifiers_public_id_key" UNIQUE ("public_id"),
    CONSTRAINT "identifiers_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "public_version_id" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "legal_disclaimer" TEXT,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "publications_public_version_id_key" UNIQUE ("public_version_id"),
    CONSTRAINT "publications_version_id_fkey"
      FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "publications_version_id_idx" ON "publications"("version_id");

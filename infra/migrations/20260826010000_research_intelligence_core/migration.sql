CREATE TYPE "ResearchIdentity" AS ENUM ('reader', 'author', 'reviewer', 'editor', 'data_steward', 'developer', 'student');
CREATE TYPE "ClaimKind" AS ENUM ('core', 'supporting', 'method', 'boundary', 'counter');
CREATE TYPE "ClaimAssessment" AS ENUM ('supported', 'partial', 'disputed', 'missing');
CREATE TYPE "EvidenceKind" AS ENUM ('passage', 'figure', 'table', 'dataset', 'code', 'notebook', 'environment', 'protocol', 'supplement', 'external_source');
CREATE TYPE "ClaimRelation" AS ENUM ('supports', 'contradicts', 'qualifies', 'context');
CREATE TYPE "ExtractionStatus" AS ENUM ('succeeded', 'needs_review', 'blocked', 'failed');
CREATE TYPE "PresentationAssetKind" AS ENUM ('svg', 'chart', 'interactive_html', 'image', 'video');
CREATE TYPE "PresentationAssetStatus" AS ENUM ('draft', 'approved', 'rejected');

CREATE UNIQUE INDEX "research_objects_id_workspace_id_key" ON "research_objects"("id", "workspace_id");
CREATE UNIQUE INDEX "artifacts_id_workspace_id_key" ON "artifacts"("id", "workspace_id");
CREATE UNIQUE INDEX "versions_id_research_object_id_key" ON "versions"("id", "research_object_id");

CREATE TABLE "research_identity_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "identities" "ResearchIdentity"[] NOT NULL,
  "primary_identity" "ResearchIdentity" NOT NULL,
  "disciplines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "methods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "profile_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "research_identity_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "research_identity_profiles_identity_count_check" CHECK (cardinality("identities") BETWEEN 1 AND 7),
  CONSTRAINT "research_identity_profiles_primary_selected_check" CHECK ("primary_identity" = ANY("identities")),
  CONSTRAINT "research_identity_profiles_profile_version_check" CHECK ("profile_version" >= 1),
  CONSTRAINT "research_identity_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "claim_nodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "research_object_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "parent_claim_id" UUID,
  "kind" "ClaimKind" NOT NULL,
  "statement" TEXT NOT NULL,
  "assessment" "ClaimAssessment" NOT NULL,
  "conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "provenance" JSONB NOT NULL,
  "extraction_status" "ExtractionStatus" NOT NULL DEFAULT 'needs_review',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "claim_nodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "claim_nodes_statement_check" CHECK (length(btrim("statement")) > 0),
  CONSTRAINT "claim_nodes_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "claim_nodes_id_ro_version_key" ON "claim_nodes"("id", "research_object_id", "version_id");
ALTER TABLE "claim_nodes" ADD CONSTRAINT "claim_nodes_version_scope_fkey"
  FOREIGN KEY ("version_id", "research_object_id") REFERENCES "versions"("id", "research_object_id") ON DELETE CASCADE;
ALTER TABLE "claim_nodes" ADD CONSTRAINT "claim_nodes_parent_scope_fkey"
  FOREIGN KEY ("parent_claim_id", "research_object_id", "version_id") REFERENCES "claim_nodes"("id", "research_object_id", "version_id") ON DELETE CASCADE;

CREATE TABLE "evidence_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "research_object_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "claim_id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "kind" "EvidenceKind" NOT NULL,
  "title" TEXT NOT NULL,
  "exact_quote" TEXT,
  "relation" "ClaimRelation" NOT NULL,
  "locator" JSONB NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "extraction_confidence" DOUBLE PRECISION,
  "extraction_status" "ExtractionStatus" NOT NULL DEFAULT 'needs_review',
  "verified_by_user_id" UUID,
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidence_records_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "evidence_records_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT "evidence_records_confidence_check" CHECK ("extraction_confidence" IS NULL OR ("extraction_confidence" >= 0 AND "extraction_confidence" <= 1)),
  CONSTRAINT "evidence_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "evidence_records_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "evidence_records_version_scope_fkey" FOREIGN KEY ("version_id", "research_object_id") REFERENCES "versions"("id", "research_object_id") ON DELETE CASCADE,
  CONSTRAINT "evidence_records_research_object_workspace_fkey" FOREIGN KEY ("research_object_id", "workspace_id") REFERENCES "research_objects"("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "evidence_records_claim_scope_fkey" FOREIGN KEY ("claim_id", "research_object_id", "version_id") REFERENCES "claim_nodes"("id", "research_object_id", "version_id") ON DELETE CASCADE,
  CONSTRAINT "evidence_records_artifact_workspace_fkey" FOREIGN KEY ("artifact_id", "workspace_id") REFERENCES "artifacts"("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "presentation_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "research_object_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "kind" "PresentationAssetKind" NOT NULL,
  "object_key" TEXT NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "generator" TEXT NOT NULL,
  "generator_version" TEXT NOT NULL,
  "prompt_hash" CHAR(64),
  "status" "PresentationAssetStatus" NOT NULL DEFAULT 'draft',
  "label" TEXT NOT NULL DEFAULT 'presentation_not_evidence',
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presentation_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "presentation_assets_object_key_check" CHECK (length(btrim("object_key")) > 0),
  CONSTRAINT "presentation_assets_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT "presentation_assets_prompt_hash_check" CHECK ("prompt_hash" IS NULL OR "prompt_hash" ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT "presentation_assets_label_check" CHECK ("label" = 'presentation_not_evidence'),
  CONSTRAINT "presentation_assets_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE,
  CONSTRAINT "presentation_assets_version_scope_fkey" FOREIGN KEY ("version_id", "research_object_id") REFERENCES "versions"("id", "research_object_id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "presentation_assets_id_ro_version_key" ON "presentation_assets"("id", "research_object_id", "version_id");

CREATE TABLE "presentation_asset_claims" (
  "presentation_asset_id" UUID NOT NULL,
  "claim_id" UUID NOT NULL,
  "research_object_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  CONSTRAINT "presentation_asset_claims_pkey" PRIMARY KEY ("presentation_asset_id", "claim_id"),
  CONSTRAINT "presentation_asset_claims_asset_scope_fkey" FOREIGN KEY ("presentation_asset_id", "research_object_id", "version_id") REFERENCES "presentation_assets"("id", "research_object_id", "version_id") ON DELETE CASCADE,
  CONSTRAINT "presentation_asset_claims_claim_scope_fkey" FOREIGN KEY ("claim_id", "research_object_id", "version_id") REFERENCES "claim_nodes"("id", "research_object_id", "version_id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "research_identity_profiles_user_id_key" ON "research_identity_profiles"("user_id");
CREATE INDEX "claim_nodes_ro_version_kind_idx" ON "claim_nodes"("research_object_id", "version_id", "kind");
CREATE INDEX "claim_nodes_parent_claim_id_idx" ON "claim_nodes"("parent_claim_id");
CREATE INDEX "evidence_records_ro_version_relation_idx" ON "evidence_records"("research_object_id", "version_id", "relation");
CREATE INDEX "evidence_records_claim_id_idx" ON "evidence_records"("claim_id");
CREATE INDEX "evidence_records_artifact_hash_idx" ON "evidence_records"("artifact_id", "content_hash");
CREATE INDEX "evidence_records_verified_by_user_id_idx" ON "evidence_records"("verified_by_user_id");
CREATE INDEX "presentation_assets_ro_version_status_idx" ON "presentation_assets"("research_object_id", "version_id", "status");
CREATE INDEX "presentation_assets_content_hash_idx" ON "presentation_assets"("content_hash");
CREATE INDEX "presentation_asset_claims_claim_id_idx" ON "presentation_asset_claims"("claim_id");

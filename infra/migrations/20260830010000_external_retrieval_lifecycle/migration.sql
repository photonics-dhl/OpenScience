CREATE TYPE "ExternalSourceProvider" AS ENUM ('semantic_scholar', 'tavily', 'scansci');
CREATE TYPE "SourceRightsBasis" AS ENUM ('open_access', 'institutional_access', 'public_domain', 'self_authored', 'unknown', 'prohibited');
CREATE TYPE "SourceDownloadPolicy" AS ENUM ('downloadable', 'authorized_user_only', 'source_link_only', 'blocked');
CREATE TYPE "TemporaryDocumentState" AS ENUM ('staging', 'active', 'deleting', 'deleted', 'cleanup_failed');

CREATE TABLE "external_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "provider" "ExternalSourceProvider" NOT NULL,
  "provider_record_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "abstract" TEXT,
  "authors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "year" INTEGER,
  "venue" TEXT,
  "citation_count" INTEGER,
  "doi" TEXT,
  "arxiv_id" TEXT,
  "open_access_url" TEXT,
  "open_access_status" TEXT,
  "open_access_license" TEXT,
  "query_fingerprint" CHAR(64) NOT NULL,
  "retrieved_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_sources_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 1000),
  CONSTRAINT "external_sources_source_url_check" CHECK ("source_url" ~ '^https://'),
  CONSTRAINT "external_sources_query_fingerprint_check" CHECK ("query_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "external_sources_year_check" CHECK ("year" IS NULL OR "year" BETWEEN 1000 AND 3000),
  CONSTRAINT "external_sources_citation_count_check" CHECK ("citation_count" IS NULL OR "citation_count" >= 0),
  CONSTRAINT "external_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CONSTRAINT "external_sources_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "external_sources_id_workspace_id_key" ON "external_sources"("id", "workspace_id");
CREATE UNIQUE INDEX "external_sources_provider_record_key" ON "external_sources"("workspace_id", "provider", "provider_record_id");
CREATE INDEX "external_sources_workspace_retrieved_idx" ON "external_sources"("workspace_id", "retrieved_at");

CREATE TABLE "source_rights_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_task_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "external_source_id" UUID NOT NULL,
  "basis" "SourceRightsBasis" NOT NULL,
  "cache_allowed" BOOLEAN NOT NULL,
  "download_policy" "SourceDownloadPolicy" NOT NULL,
  "reason_code" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "content_hash" CHAR(64),
  "subject_user_id" UUID,
  "valid_until" TIMESTAMPTZ,
  "checker_version" TEXT NOT NULL,
  "decided_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_rights_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "source_rights_decisions_reason_code_check" CHECK ("reason_code" ~ '^[a-z0-9_]{1,80}$'),
  CONSTRAINT "source_rights_decisions_checker_version_check" CHECK (length(btrim("checker_version")) BETWEEN 1 AND 100),
  CONSTRAINT "source_rights_decisions_evidence_size_check" CHECK (pg_column_size("evidence") <= 4096),
  CONSTRAINT "source_rights_decisions_content_hash_check" CHECK ("content_hash" IS NULL OR "content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "source_rights_decisions_subject_check" CHECK (
    ("basis" = 'institutional_access' AND "subject_user_id" IS NOT NULL AND "valid_until" IS NOT NULL AND "valid_until" > "decided_at") OR
    ("basis" <> 'institutional_access' AND "subject_user_id" IS NULL AND "valid_until" IS NULL)
  ),
  CONSTRAINT "source_rights_decisions_policy_check" CHECK (
    ("basis" = 'institutional_access' AND "cache_allowed" AND "download_policy" = 'authorized_user_only') OR
    ("basis" <> 'institutional_access' AND "cache_allowed" AND "download_policy" = 'downloadable') OR
    (NOT "cache_allowed" AND "download_policy" IN ('source_link_only', 'blocked'))
  ),
  CONSTRAINT "source_rights_decisions_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE RESTRICT,
  CONSTRAINT "source_rights_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CONSTRAINT "source_rights_decisions_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "source_rights_decisions_source_workspace_fkey" FOREIGN KEY ("external_source_id", "workspace_id") REFERENCES "external_sources"("id", "workspace_id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "source_rights_decisions_scope_key" ON "source_rights_decisions"("id", "external_source_id", "workspace_id");
CREATE UNIQUE INDEX "source_rights_decisions_task_source_key" ON "source_rights_decisions"("agent_task_id", "external_source_id");
CREATE INDEX "source_rights_decisions_source_decided_idx" ON "source_rights_decisions"("external_source_id", "decided_at");

CREATE TABLE "temporary_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agent_task_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "external_source_id" UUID NOT NULL,
  "rights_decision_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "state" "TemporaryDocumentState" NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ,
  "cleanup_owner" TEXT,
  "cleanup_lease_until" TIMESTAMPTZ,
  "cleanup_fence_token" UUID,
  "cleanup_attempts" INTEGER NOT NULL DEFAULT 0,
  "cleanup_retry_at" TIMESTAMPTZ,
  "last_error_code" TEXT,
  "parser_provenance" JSONB,
  "locator" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "temporary_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "temporary_documents_object_key_check" CHECK ("object_key" = 'hermes-cache/' || "workspace_id"::text || '/' || "id"::text || '/' || btrim("content_hash")),
  CONSTRAINT "temporary_documents_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "temporary_documents_mime_type_check" CHECK ("mime_type" IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  CONSTRAINT "temporary_documents_size_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "temporary_documents_expiry_check" CHECK ("expires_at" = "created_at" + INTERVAL '72 hours'),
  CONSTRAINT "temporary_documents_cleanup_attempts_check" CHECK ("cleanup_attempts" >= 0),
  CONSTRAINT "temporary_documents_parser_provenance_size_check" CHECK ("parser_provenance" IS NULL OR pg_column_size("parser_provenance") <= 262144),
  CONSTRAINT "temporary_documents_locator_size_check" CHECK ("locator" IS NULL OR pg_column_size("locator") <= 262144),
  CONSTRAINT "temporary_documents_state_check" CHECK (
    ("state" IN ('staging', 'active') AND "deleted_at" IS NULL AND "cleanup_owner" IS NULL AND "cleanup_lease_until" IS NULL AND "cleanup_fence_token" IS NULL AND "cleanup_retry_at" IS NULL) OR
    ("state" = 'deleting' AND "deleted_at" IS NULL AND "cleanup_owner" IS NOT NULL AND "cleanup_lease_until" IS NOT NULL AND "cleanup_fence_token" IS NOT NULL AND "cleanup_retry_at" IS NULL) OR
    ("state" = 'cleanup_failed' AND "deleted_at" IS NULL AND "cleanup_owner" IS NULL AND "cleanup_lease_until" IS NULL AND "cleanup_fence_token" IS NULL AND "cleanup_retry_at" IS NOT NULL) OR
    ("state" = 'deleted' AND "deleted_at" IS NOT NULL AND "cleanup_owner" IS NULL AND "cleanup_lease_until" IS NULL AND "cleanup_fence_token" IS NULL AND "cleanup_retry_at" IS NULL)
  ),
  CONSTRAINT "temporary_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  CONSTRAINT "temporary_documents_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE RESTRICT,
  CONSTRAINT "temporary_documents_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "temporary_documents_source_workspace_fkey" FOREIGN KEY ("external_source_id", "workspace_id") REFERENCES "external_sources"("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "temporary_documents_rights_scope_fkey" FOREIGN KEY ("rights_decision_id", "external_source_id", "workspace_id") REFERENCES "source_rights_decisions"("id", "external_source_id", "workspace_id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "temporary_documents_object_key_key" ON "temporary_documents"("object_key");
CREATE UNIQUE INDEX "temporary_documents_agent_task_id_key" ON "temporary_documents"("agent_task_id");
CREATE UNIQUE INDEX "temporary_documents_id_workspace_id_key" ON "temporary_documents"("id", "workspace_id");
CREATE INDEX "temporary_documents_expiry_idx" ON "temporary_documents"("workspace_id", "state", "expires_at");
CREATE INDEX "temporary_documents_cleanup_retry_idx" ON "temporary_documents"("state", "cleanup_retry_at");

CREATE TABLE "temporary_document_accesses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "temporary_document_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "signing_key_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "temporary_document_accesses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "temporary_document_accesses_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "temporary_document_accesses_signing_key_check" CHECK ("signing_key_id" ~ '^[a-zA-Z0-9_-]{1,40}$'),
  CONSTRAINT "temporary_document_accesses_expiry_check" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '10 minutes'),
  CONSTRAINT "temporary_document_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "temporary_document_accesses_document_workspace_fkey" FOREIGN KEY ("temporary_document_id", "workspace_id") REFERENCES "temporary_documents"("id", "workspace_id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "temporary_document_accesses_token_hash_key" ON "temporary_document_accesses"("token_hash");
CREATE INDEX "temporary_document_accesses_document_user_expiry_idx" ON "temporary_document_accesses"("temporary_document_id", "user_id", "expires_at");

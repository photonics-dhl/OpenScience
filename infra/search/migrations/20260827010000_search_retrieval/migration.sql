CREATE TABLE "search_model_versions" (
  "id" UUID NOT NULL,
  "provider" VARCHAR(64) NOT NULL,
  "model" VARCHAR(128) NOT NULL,
  "revision" VARCHAR(128) NOT NULL,
  "dimension" INTEGER NOT NULL,
  "source_sha256" CHAR(64) NOT NULL,
  "package_freeze_sha256" CHAR(64) NOT NULL,
  "model_manifest_sha256" CHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'candidate',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retired_at" TIMESTAMP(3),
  CONSTRAINT "search_model_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_model_versions_dimension_check" CHECK ("dimension" = 1024),
  CONSTRAINT "search_model_versions_source_hash_check" CHECK ("source_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_model_versions_package_hash_check" CHECK ("package_freeze_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_model_versions_manifest_hash_check" CHECK ("model_manifest_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_model_versions_status_check" CHECK ("status" IN ('candidate', 'active', 'retired'))
);

CREATE UNIQUE INDEX "search_model_versions_identity_key"
  ON "search_model_versions" ("provider", "model", "revision");

CREATE TABLE "search_chunks" (
  "id" CHAR(64) NOT NULL,
  "workspace_id" UUID NOT NULL,
  "research_object_id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "source_version_id" UUID,
  "source_version_no" INTEGER,
  "index_task_id" UUID,
  "content_hash" CHAR(64) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "language" VARCHAR(16) NOT NULL,
  "text" TEXT NOT NULL,
  "token_count" INTEGER NOT NULL,
  "locators" JSONB NOT NULL,
  "claim_ids" JSONB NOT NULL,
  "lexical_terms" JSONB NOT NULL,
  "term_frequencies" JSONB NOT NULL,
  "lexical_text" TEXT NOT NULL,
  "search_vector" TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, "lexical_text")) STORED,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_chunks_id_check" CHECK ("id" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_chunks_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_chunks_source_version_check" CHECK (
    ("source_version_id" IS NULL AND "source_version_no" IS NULL)
    OR ("source_version_id" IS NOT NULL AND "source_version_no" >= 1)
  ),
  CONSTRAINT "search_chunks_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "search_chunks_text_check" CHECK (char_length("text") BETWEEN 1 AND 65536),
  CONSTRAINT "search_chunks_token_count_check" CHECK ("token_count" BETWEEN 1 AND 1024),
  CONSTRAINT "search_chunks_locators_check" CHECK (
    jsonb_typeof("locators") = 'array'
    AND jsonb_array_length("locators") BETWEEN 1 AND 1024
  ),
  CONSTRAINT "search_chunks_claim_ids_check" CHECK (jsonb_typeof("claim_ids") = 'array'),
  CONSTRAINT "search_chunks_lexical_terms_check" CHECK (jsonb_typeof("lexical_terms") = 'array'),
  CONSTRAINT "search_chunks_term_frequencies_check" CHECK (jsonb_typeof("term_frequencies") = 'object')
);

CREATE UNIQUE INDEX "search_chunks_workspace_id_id_key"
  ON "search_chunks" ("workspace_id", "id");
CREATE UNIQUE INDEX "search_chunks_generation_ordinal_key"
  ON "search_chunks" ("workspace_id", "index_task_id", "ordinal");
CREATE INDEX "search_chunks_workspace_ro_active_idx"
  ON "search_chunks" ("workspace_id", "research_object_id", "active");
CREATE INDEX "search_chunks_workspace_artifact_hash_idx"
  ON "search_chunks" ("workspace_id", "artifact_id", "content_hash");
CREATE INDEX "search_chunks_search_vector_idx"
  ON "search_chunks" USING GIN ("search_vector");

CREATE TABLE "search_embeddings" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "chunk_id" CHAR(64) NOT NULL,
  "model_version_id" UUID NOT NULL,
  "dimension" INTEGER NOT NULL,
  "vector" BYTEA NOT NULL,
  "vector_sha256" CHAR(64) NOT NULL,
  "norm" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_embeddings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_embeddings_dimension_check" CHECK ("dimension" = 1024),
  CONSTRAINT "search_embeddings_vector_size_check" CHECK (octet_length("vector") = 4096),
  CONSTRAINT "search_embeddings_vector_hash_check" CHECK ("vector_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_embeddings_norm_check" CHECK ("norm" BETWEEN 0.999 AND 1.001),
  CONSTRAINT "search_embeddings_chunk_fkey" FOREIGN KEY ("workspace_id", "chunk_id")
    REFERENCES "search_chunks" ("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "search_embeddings_model_fkey" FOREIGN KEY ("model_version_id")
    REFERENCES "search_model_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "search_embeddings_chunk_model_key"
  ON "search_embeddings" ("workspace_id", "chunk_id", "model_version_id");
CREATE INDEX "search_embeddings_workspace_model_idx"
  ON "search_embeddings" ("workspace_id", "model_version_id");

CREATE TABLE "search_index_tasks" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "research_object_id" UUID NOT NULL,
  "artifact_id" UUID NOT NULL,
  "source_version_id" UUID NOT NULL,
  "source_version_no" INTEGER NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "model_version_id" UUID NOT NULL,
  "source_generation_sha256" CHAR(64) NOT NULL,
  "source_created_at" TIMESTAMP(3) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(64),
  "lease_token" CHAR(64),
  "fence_owner_task_id" UUID,
  "fence_owner_created_at" TIMESTAMP(3),
  "fence_owner_attempt" INTEGER,
  "lease_expires_at" TIMESTAMP(3),
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "search_index_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_index_tasks_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_index_tasks_source_version_no_check" CHECK ("source_version_no" >= 1),
  CONSTRAINT "search_index_tasks_source_generation_hash_check" CHECK ("source_generation_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_index_tasks_lease_token_check" CHECK ("lease_token" IS NULL OR "lease_token" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_index_tasks_fence_owner_check" CHECK (
    ("fence_owner_task_id" IS NULL AND "fence_owner_created_at" IS NULL AND "fence_owner_attempt" IS NULL)
    OR ("fence_owner_task_id" IS NOT NULL AND "fence_owner_created_at" IS NOT NULL AND "fence_owner_attempt" >= 1)
  ),
  CONSTRAINT "search_index_tasks_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'needs_review', 'failed')),
  CONSTRAINT "search_index_tasks_attempt_check" CHECK ("attempt_count" BETWEEN 0 AND 3),
  CONSTRAINT "search_index_tasks_model_fkey" FOREIGN KEY ("model_version_id")
    REFERENCES "search_model_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "search_index_tasks_generation_model_key"
  ON "search_index_tasks" (
    "workspace_id", "research_object_id", "artifact_id", "source_version_id",
    "content_hash", "model_version_id", "source_generation_sha256"
  );
CREATE INDEX "search_index_tasks_status_created_idx"
  ON "search_index_tasks" ("status", "created_at");
CREATE INDEX "search_index_tasks_workspace_ro_idx"
  ON "search_index_tasks" ("workspace_id", "research_object_id");
CREATE INDEX "search_index_tasks_current_idx"
  ON "search_index_tasks" ("workspace_id", "research_object_id", "artifact_id", "is_current");
CREATE UNIQUE INDEX "search_index_tasks_one_current_key"
  ON "search_index_tasks" ("workspace_id", "research_object_id", "artifact_id") WHERE "is_current" = true;

ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_index_task_fkey"
  FOREIGN KEY ("index_task_id") REFERENCES "search_index_tasks" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "search_query_metrics" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "query_hash" CHAR(64) NOT NULL,
  "lexical_available" BOOLEAN NOT NULL,
  "dense_available" BOOLEAN NOT NULL,
  "result_count" INTEGER NOT NULL,
  "lexical_latency_ms" INTEGER,
  "dense_latency_ms" INTEGER,
  "total_latency_ms" INTEGER NOT NULL,
  "error_code" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_query_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "search_query_metrics_hash_check" CHECK ("query_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "search_query_metrics_result_count_check" CHECK ("result_count" BETWEEN 0 AND 100),
  CONSTRAINT "search_query_metrics_lexical_latency_check" CHECK ("lexical_latency_ms" IS NULL OR "lexical_latency_ms" >= 0),
  CONSTRAINT "search_query_metrics_dense_latency_check" CHECK ("dense_latency_ms" IS NULL OR "dense_latency_ms" >= 0),
  CONSTRAINT "search_query_metrics_total_latency_check" CHECK ("total_latency_ms" >= 0)
);

CREATE INDEX "search_query_metrics_workspace_created_idx"
  ON "search_query_metrics" ("workspace_id", "created_at");

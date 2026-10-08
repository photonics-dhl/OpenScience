ALTER TABLE "journal_articles" ADD COLUMN "working_research_object_id" UUID;
CREATE UNIQUE INDEX "journal_articles_working_research_object_id_key" ON "journal_articles"("working_research_object_id");
ALTER TABLE "journal_articles" ADD CONSTRAINT "journal_articles_working_research_object_id_fkey" FOREIGN KEY ("working_research_object_id") REFERENCES "research_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shared ingestion uses the existing journal ledger and concurrency slot, but
-- execution/leases belong to the common AgentTask pipeline.
ALTER TABLE "journal_jobs" DROP CONSTRAINT "journal_jobs_kind_check";
ALTER TABLE "journal_jobs" ADD CONSTRAINT "journal_jobs_kind_check"
  CHECK ((kind IN ('generate', 'shared_ingestion') AND grant_id IS NOT NULL)
    OR (kind = 'source_parse' AND grant_id IS NULL));
ALTER TABLE "journal_jobs" DROP CONSTRAINT "journal_jobs_lease_check";
ALTER TABLE "journal_jobs" ADD CONSTRAINT "journal_jobs_lease_check"
  CHECK ((kind = 'shared_ingestion' AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (kind <> 'shared_ingestion' AND
      ((state = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (state <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL))));

CREATE TABLE "journal_shared_bindings" (
  "article_id" UUID NOT NULL PRIMARY KEY,
  "source_artifact_id" UUID,
  "source_blob_sha256" CHAR(64),
  "source_digest" CHAR(64),
  "source_revision" INTEGER,
  "actor_id" UUID,
  "ingestion_task_id" UUID,
  "hermes_run_id" UUID,
  "confirmed_version_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "journal_shared_bindings_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "journal_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

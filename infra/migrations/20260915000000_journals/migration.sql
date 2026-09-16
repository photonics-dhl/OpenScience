-- CreateEnum
CREATE TYPE "JournalApplicationStatus" AS ENUM ('draft', 'submitted', 'needs_information', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "JournalIdentifierType" AS ENUM ('print', 'electronic');

-- CreateEnum
CREATE TYPE "JournalOperationalState" AS ENUM ('active', 'paused', 'closed', 'reverification');

-- CreateEnum
CREATE TYPE "JournalServiceRequestStatus" AS ENUM ('submitted', 'quoted', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "journal_works" (
    "id" UUID NOT NULL,
    "doi" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_articles" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "research_object_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "source" JSONB NOT NULL,
    "rights" JSONB NOT NULL,
    "draft" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "directory_visible" BOOLEAN NOT NULL DEFAULT false,
    "content_state" TEXT NOT NULL DEFAULT 'active',
    "review_state" TEXT NOT NULL DEFAULT 'draft',
    "reviewed_revision" INTEGER,
    "reviewed_digest" TEXT,
    "reviewed_by" UUID,
    "assigned_reviewer_id" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_jobs" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "grant_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'generate',
    "requested_by" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "retry_of" UUID,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL,
    "source_digest" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_releases" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "request_key" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_ledger" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "grant_id" UUID NOT NULL,
    "job_id" UUID,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "event_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_metrics" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "journal_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_applications" (
    "id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "name_zh" TEXT,
    "name_en" TEXT,
    "p_issn" TEXT,
    "e_issn" TEXT,
    "website_url" TEXT,
    "publisher_name" TEXT,
    "sponsor_name" TEXT,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "logo_url" TEXT,
    "applicant_name" TEXT,
    "applicant_title" TEXT,
    "applicant_email" CITEXT,
    "representation_evidence" TEXT,
    "planned_article_count" INTEGER,
    "requested_services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rights_declaration" TEXT,
    "rights_declaration_version" TEXT,
    "status" "JournalApplicationStatus" NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "submission_key" TEXT,
    "review_reason" TEXT,
    "internal_notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "journal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_zh" TEXT,
    "name_en" TEXT,
    "website_url" TEXT NOT NULL,
    "publisher_name" TEXT NOT NULL,
    "sponsor_name" TEXT,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "logo_url" TEXT,
    "operational_state" "JournalOperationalState" NOT NULL DEFAULT 'active',
    "homepage_published" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "directory_limit" INTEGER NOT NULL DEFAULT 1000,
    "storage_limit_bytes" BIGINT NOT NULL DEFAULT 2147483648,
    "max_running_jobs" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_identifiers" (
    "id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "type" "JournalIdentifierType" NOT NULL,
    "application_id" UUID,
    "journal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_grants" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "expired" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "grant_key" TEXT NOT NULL,
    "reason" TEXT,
    "service_request_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_service_requests" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "annual_volume" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "figure_scale" TEXT NOT NULL,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "request_key" TEXT NOT NULL,
    "status" "JournalServiceRequestStatus" NOT NULL DEFAULT 'submitted',
    "review_notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_events" (
    "id" UUID NOT NULL,
    "journal_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_works_doi_key" ON "journal_works"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "journal_articles_research_object_id_key" ON "journal_articles"("research_object_id");

-- CreateIndex
CREATE INDEX "journal_articles_journal_id_directory_visible_created_at_idx" ON "journal_articles"("journal_id", "directory_visible", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_articles_journal_id_work_id_key" ON "journal_articles"("journal_id", "work_id");

-- CreateIndex
CREATE INDEX "journal_jobs_state_created_at_idx" ON "journal_jobs"("state", "created_at");

-- CreateIndex
CREATE INDEX "journal_jobs_journal_id_state_idx" ON "journal_jobs"("journal_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "journal_jobs_journal_id_request_key_key" ON "journal_jobs"("journal_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_releases_version_id_key" ON "journal_releases"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_releases_article_id_revision_key" ON "journal_releases"("article_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "journal_releases_article_id_request_key_key" ON "journal_releases"("article_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_ledger_event_key_key" ON "journal_ledger"("event_key");

-- CreateIndex
CREATE INDEX "journal_ledger_journal_id_created_at_idx" ON "journal_ledger"("journal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_metrics_journal_id_day_kind_key" ON "journal_metrics"("journal_id", "day", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "journal_applications_submission_key_key" ON "journal_applications"("submission_key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_applications_journal_id_key" ON "journal_applications"("journal_id");

-- CreateIndex
CREATE INDEX "journal_applications_applicant_id_status_idx" ON "journal_applications"("applicant_id", "status");

-- CreateIndex
CREATE INDEX "journal_applications_status_submitted_at_idx" ON "journal_applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "journals_workspace_id_key" ON "journals"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "journals_slug_key" ON "journals"("slug");

-- CreateIndex
CREATE INDEX "journals_operational_state_homepage_published_idx" ON "journals"("operational_state", "homepage_published");

-- CreateIndex
CREATE UNIQUE INDEX "journal_identifiers_value_key" ON "journal_identifiers"("value");

-- CreateIndex
CREATE INDEX "journal_identifiers_application_id_idx" ON "journal_identifiers"("application_id");

-- CreateIndex
CREATE INDEX "journal_identifiers_journal_id_idx" ON "journal_identifiers"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_grants_grant_key_key" ON "journal_grants"("grant_key");

-- CreateIndex
CREATE INDEX "journal_grants_journal_id_expires_at_idx" ON "journal_grants"("journal_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_service_requests_request_key_key" ON "journal_service_requests"("request_key");

-- CreateIndex
CREATE INDEX "journal_service_requests_journal_id_status_idx" ON "journal_service_requests"("journal_id", "status");

-- CreateIndex
CREATE INDEX "journal_events_journal_id_created_at_idx" ON "journal_events"("journal_id", "created_at");

-- CreateIndex
CREATE INDEX "journal_events_actor_id_created_at_idx" ON "journal_events"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "journal_articles" ADD CONSTRAINT "journal_articles_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_articles" ADD CONSTRAINT "journal_articles_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "journal_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_articles" ADD CONSTRAINT "journal_articles_research_object_id_fkey" FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_jobs" ADD CONSTRAINT "journal_jobs_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_jobs" ADD CONSTRAINT "journal_jobs_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "journal_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_jobs" ADD CONSTRAINT "journal_jobs_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "journal_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_releases" ADD CONSTRAINT "journal_releases_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "journal_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_releases" ADD CONSTRAINT "journal_releases_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_ledger" ADD CONSTRAINT "journal_ledger_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_ledger" ADD CONSTRAINT "journal_ledger_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "journal_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_ledger" ADD CONSTRAINT "journal_ledger_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "journal_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_metrics" ADD CONSTRAINT "journal_metrics_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_applications" ADD CONSTRAINT "journal_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_applications" ADD CONSTRAINT "journal_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_applications" ADD CONSTRAINT "journal_applications_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_identifiers" ADD CONSTRAINT "journal_identifiers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "journal_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_identifiers" ADD CONSTRAINT "journal_identifiers_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_grants" ADD CONSTRAINT "journal_grants_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_grants" ADD CONSTRAINT "journal_grants_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "journal_service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_service_requests" ADD CONSTRAINT "journal_service_requests_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_service_requests" ADD CONSTRAINT "journal_service_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_service_requests" ADD CONSTRAINT "journal_service_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_events" ADD CONSTRAINT "journal_events_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_events" ADD CONSTRAINT "journal_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Database constraints that cannot be expressed in Prisma 5.
-- Append this SQL to the journal migration after generating the structural diff.
ALTER TABLE journal_grants ADD CONSTRAINT journal_grants_balance_check
  CHECK (remaining >= 0 AND reserved >= 0 AND reserved <= remaining AND consumed >= 0 AND expired >= 0);
ALTER TABLE journals ADD CONSTRAINT journals_capacity_check
  CHECK (directory_limit > 0 AND storage_limit_bytes > 0 AND max_running_jobs BETWEEN 1 AND 20);
ALTER TABLE journal_articles ADD CONSTRAINT journal_articles_state_check
  CHECK (content_state IN ('active', 'restricted', 'withdrawn') AND review_state IN ('draft', 'submitted', 'approved', 'changes_requested'));
ALTER TABLE journal_articles ADD CONSTRAINT journal_articles_review_check
  CHECK (review_state <> 'approved' OR (reviewed_revision = revision AND reviewed_by IS NOT NULL AND reviewed_digest IS NOT NULL));
ALTER TABLE journal_jobs ADD CONSTRAINT journal_jobs_kind_check
  CHECK ((kind = 'generate' AND grant_id IS NOT NULL) OR (kind = 'source_parse' AND grant_id IS NULL));
ALTER TABLE journal_jobs ADD CONSTRAINT journal_jobs_state_check
  CHECK (state IN ('staging', 'pending', 'running', 'succeeded', 'failed', 'cancelled'));
ALTER TABLE journal_jobs ADD CONSTRAINT journal_jobs_lease_check
  CHECK ((state = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (state <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL));
ALTER TABLE journal_ledger ADD CONSTRAINT journal_ledger_entry_check
  CHECK ((kind IN ('grant', 'reserve', 'consume', 'release', 'expire') AND amount > 0) OR (kind = 'adjustment' AND amount <> 0));

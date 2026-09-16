-- DropForeignKey
ALTER TABLE "journal_articles" DROP CONSTRAINT "journal_articles_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_articles" DROP CONSTRAINT "journal_articles_work_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_articles" DROP CONSTRAINT "journal_articles_research_object_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_jobs" DROP CONSTRAINT "journal_jobs_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_jobs" DROP CONSTRAINT "journal_jobs_article_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_jobs" DROP CONSTRAINT "journal_jobs_grant_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_releases" DROP CONSTRAINT "journal_releases_article_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_releases" DROP CONSTRAINT "journal_releases_version_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_ledger" DROP CONSTRAINT "journal_ledger_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_ledger" DROP CONSTRAINT "journal_ledger_grant_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_ledger" DROP CONSTRAINT "journal_ledger_job_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_metrics" DROP CONSTRAINT "journal_metrics_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_applications" DROP CONSTRAINT "journal_applications_applicant_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_applications" DROP CONSTRAINT "journal_applications_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "journal_applications" DROP CONSTRAINT "journal_applications_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journals" DROP CONSTRAINT "journals_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_identifiers" DROP CONSTRAINT "journal_identifiers_application_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_identifiers" DROP CONSTRAINT "journal_identifiers_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_grants" DROP CONSTRAINT "journal_grants_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_grants" DROP CONSTRAINT "journal_grants_service_request_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_service_requests" DROP CONSTRAINT "journal_service_requests_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_service_requests" DROP CONSTRAINT "journal_service_requests_requester_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_service_requests" DROP CONSTRAINT "journal_service_requests_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "journal_events" DROP CONSTRAINT "journal_events_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_events" DROP CONSTRAINT "journal_events_actor_id_fkey";

-- DropTable
DROP TABLE "journal_works";

-- DropTable
DROP TABLE "journal_articles";

-- DropTable
DROP TABLE "journal_jobs";

-- DropTable
DROP TABLE "journal_releases";

-- DropTable
DROP TABLE "journal_ledger";

-- DropTable
DROP TABLE "journal_metrics";

-- DropTable
DROP TABLE "journal_applications";

-- DropTable
DROP TABLE "journals";

-- DropTable
DROP TABLE "journal_identifiers";

-- DropTable
DROP TABLE "journal_grants";

-- DropTable
DROP TABLE "journal_service_requests";

-- DropTable
DROP TABLE "journal_events";

-- DropEnum
DROP TYPE "JournalApplicationStatus";

-- DropEnum
DROP TYPE "JournalIdentifierType";

-- DropEnum
DROP TYPE "JournalOperationalState";

-- DropEnum
DROP TYPE "JournalServiceRequestStatus";

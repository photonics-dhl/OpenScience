-- P1C-1 迁移 12：协作域数据模型（§15 实体 MUST + §8.2 PR 声明 + §3.4 CRediT + §6.3 三类许可）
-- 决策：PR 声明内联；Comment 三可空外键多态；CreditRole 14 项；License 标准字符串；Notification payload Json

CREATE TYPE "IssueKind" AS ENUM ('question', 'method_repro', 'failure', 'bug_report', 'suggestion');
CREATE TYPE "ReviewVerdict" AS ENUM ('approve', 'request_changes', 'comment');
CREATE TYPE "CreditRole" AS ENUM (
  'conceptualization', 'methodology', 'software', 'validation', 'data_curation',
  'visualization', 'writing', 'supervision', 'investigation', 'resources',
  'project_administration', 'funding_acquisition'
);

CREATE TABLE "fork_relations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "forked_ro_id" UUID NOT NULL,
    "source_ro_id" UUID NOT NULL,
    "source_version_id" UUID NOT NULL,
    "source_content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fork_relations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fork_relations_forked_ro_id_key" UNIQUE ("forked_ro_id"),
    CONSTRAINT "fork_relations_forked_ro_id_fkey"
      FOREIGN KEY ("forked_ro_id") REFERENCES "research_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fork_relations_source_ro_id_fkey"
      FOREIGN KEY ("source_ro_id") REFERENCES "research_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fork_relations_source_version_id_fkey"
      FOREIGN KEY ("source_version_id") REFERENCES "versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "fork_relations_source_ro_id_idx" ON "fork_relations"("source_ro_id");

CREATE TABLE "issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "kind" "IssueKind" NOT NULL DEFAULT 'question',
    "status" TEXT NOT NULL DEFAULT 'open',
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issues_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "issues_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "issues_research_object_id_idx" ON "issues"("research_object_id");

CREATE TABLE "pull_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "source_branch_id" UUID NOT NULL,
    "target_branch_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "changed_sdf_fields" JSONB NOT NULL,
    "changed_files" JSONB NOT NULL,
    "changes_method" BOOLEAN NOT NULL,
    "changes_data" BOOLEAN NOT NULL,
    "changes_conclusion" BOOLEAN NOT NULL,
    "new_contributors" JSONB NOT NULL,
    "data_license" TEXT NOT NULL,
    "code_license" TEXT NOT NULL,
    "conflict_of_interest" TEXT NOT NULL,
    "auto_checks" JSONB NOT NULL DEFAULT '{}',
    "requests_release" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pull_requests_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pull_requests_source_branch_id_fkey"
      FOREIGN KEY ("source_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pull_requests_target_branch_id_fkey"
      FOREIGN KEY ("target_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pull_requests_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "pull_requests_research_object_id_idx" ON "pull_requests"("research_object_id");
CREATE INDEX "pull_requests_source_branch_id_idx" ON "pull_requests"("source_branch_id");

CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pr_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "verdict" "ReviewVerdict" NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_pr_id_fkey"
      FOREIGN KEY ("pr_id") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reviews_reviewer_id_fkey"
      FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reviews_pr_id_idx" ON "reviews"("pr_id");

CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "issue_id" UUID,
    "pr_id" UUID,
    "review_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comments_issue_id_fkey"
      FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_pr_id_fkey"
      FOREIGN KEY ("pr_id") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_review_id_fkey"
      FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "comments_issue_id_idx" ON "comments"("issue_id");
CREATE INDEX "comments_pr_id_idx" ON "comments"("pr_id");
CREATE INDEX "comments_review_id_idx" ON "comments"("review_id");

CREATE TABLE "authors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_corresponding" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "authors_ro_user_key" UNIQUE ("research_object_id", "user_id"),
    CONSTRAINT "authors_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "authors_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "authors_research_object_id_idx" ON "authors"("research_object_id");

CREATE TABLE "contributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credit_role" "CreditRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contributions_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contributions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "contributions_research_object_id_idx" ON "contributions"("research_object_id");

CREATE TABLE "license_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_object_id" UUID NOT NULL,
    "version_id" UUID,
    "license_type" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "license_assignments_ro_version_type_key" UNIQUE ("research_object_id", "version_id", "license_type"),
    CONSTRAINT "license_assignments_research_object_id_fkey"
      FOREIGN KEY ("research_object_id") REFERENCES "research_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "license_assignments_version_id_fkey"
      FOREIGN KEY ("version_id") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "license_assignments_research_object_id_idx" ON "license_assignments"("research_object_id");

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

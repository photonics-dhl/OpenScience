CREATE TYPE "IdentityCredentialType" AS ENUM ('orcid', 'institution_email');
CREATE TYPE "IdentityCredentialStatus" AS ENUM ('verified', 'revoked');
CREATE TYPE "AuthorizationScopeType" AS ENUM ('platform', 'workspace', 'research_object', 'journal', 'organization', 'review_assignment');
CREATE TYPE "ScopedRoleStatus" AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE "identity_credentials" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "IdentityCredentialType" NOT NULL,
  "status" "IdentityCredentialStatus" NOT NULL DEFAULT 'verified',
  "external_id" TEXT NOT NULL,
  "display_label" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "identity_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "identity_credentials_type_external_id_key" ON "identity_credentials"("type", "external_id");
CREATE UNIQUE INDEX "identity_credentials_user_id_type_key" ON "identity_credentials"("user_id", "type");
CREATE INDEX "identity_credentials_user_id_status_idx" ON "identity_credentials"("user_id", "status");

CREATE TABLE "institution_email_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "email" CITEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_sent_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_email_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_email_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "institution_email_challenges_user_id_created_at_idx" ON "institution_email_challenges"("user_id", "created_at");
CREATE INDEX "institution_email_challenges_email_consumed_at_idx" ON "institution_email_challenges"("email", "consumed_at");
CREATE UNIQUE INDEX "institution_email_challenges_one_active_per_user" ON "institution_email_challenges"("user_id") WHERE "consumed_at" IS NULL;

CREATE TABLE "scoped_role_assignments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "scope_type" "AuthorizationScopeType" NOT NULL,
  "scope_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" "ScopedRoleStatus" NOT NULL DEFAULT 'active',
  "granted_by_user_id" UUID,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scoped_role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scoped_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scoped_role_assignments_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "scoped_role_assignments_scope_id_check" CHECK (length(trim("scope_id")) > 0),
  CONSTRAINT "scoped_role_assignments_role_check" CHECK (length(trim("role")) > 0),
  CONSTRAINT "scoped_role_assignments_expiry_check" CHECK ("expires_at" IS NULL OR "expires_at" > "starts_at")
);

CREATE UNIQUE INDEX "scoped_role_assignments_user_scope_role_key" ON "scoped_role_assignments"("user_id", "scope_type", "scope_id", "role");
CREATE INDEX "scoped_role_assignments_scope_status_idx" ON "scoped_role_assignments"("scope_type", "scope_id", "status");
CREATE INDEX "scoped_role_assignments_user_status_idx" ON "scoped_role_assignments"("user_id", "status");

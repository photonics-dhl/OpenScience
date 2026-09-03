ALTER TABLE "institution_email_challenges" DROP CONSTRAINT IF EXISTS "institution_email_challenges_research_organization_id_fkey";
ALTER TABLE "identity_credentials" DROP CONSTRAINT IF EXISTS "identity_credentials_research_organization_id_fkey";
ALTER TABLE "institution_email_challenges" DROP COLUMN IF EXISTS "research_organization_id";
ALTER TABLE "identity_credentials" DROP COLUMN IF EXISTS "research_organization_id";
DROP TABLE IF EXISTS "research_organizations";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260902010000_ror_institution_directory';

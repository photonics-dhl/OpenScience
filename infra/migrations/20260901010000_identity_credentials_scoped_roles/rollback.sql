DROP TABLE IF EXISTS "scoped_role_assignments";
DROP TABLE IF EXISTS "institution_email_challenges";
DROP TABLE IF EXISTS "identity_credentials";
DROP TYPE IF EXISTS "ScopedRoleStatus";
DROP TYPE IF EXISTS "AuthorizationScopeType";
DROP TYPE IF EXISTS "IdentityCredentialStatus";
DROP TYPE IF EXISTS "IdentityCredentialType";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260901010000_identity_credentials_scoped_roles';

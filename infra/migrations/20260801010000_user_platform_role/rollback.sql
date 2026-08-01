-- Compensation rollback for 20260801010000_user_platform_role.
ALTER TABLE "users" DROP COLUMN IF EXISTS "platform_role";
DROP TYPE IF EXISTS "PlatformRole";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260801010000_user_platform_role';

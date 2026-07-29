-- Compensation rollback for 20260728010000_auth_baseline.
-- 注意：不 DROP EXTENSION citext —— extension 可能被同库其他对象依赖，删除影响面不可控。
DROP TABLE IF EXISTS "mail_outbox";
DROP TABLE IF EXISTS "email_verifications";
DROP TABLE IF EXISTS "invitations";
DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "UserStatus";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260728010000_auth_baseline';

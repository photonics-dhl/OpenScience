DROP TABLE IF EXISTS "external_provider_states";
DROP INDEX IF EXISTS "notifications_idempotency_key_key";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "idempotency_key";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260830020000_scansci_provider_state';

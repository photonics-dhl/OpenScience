-- Compensation rollback for 20260803000000_quota_usage.
DROP TABLE IF EXISTS "usage_ledger";
DROP TABLE IF EXISTS "quota_policies";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260803000000_quota_usage';

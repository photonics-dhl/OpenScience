-- Compensation rollback for 20260801143000_audit_log.
DROP TABLE IF EXISTS "audit_logs";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260801143000_audit_log';

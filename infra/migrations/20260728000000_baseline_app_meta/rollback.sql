-- Compensation rollback for 20260728000000_baseline_app_meta.
-- Prisma 仅前向迁移；本文件为人工/测试执行的回滚补偿（database-migration skill 第 2 条）。
DROP TABLE IF EXISTS "app_meta";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260728000000_baseline_app_meta';

-- P1D-8 回滚：发布状态机扩展 + parentVersion 链（迁移 18）
ALTER TABLE "versions" DROP CONSTRAINT IF EXISTS "versions_parent_version_id_fkey";
DROP INDEX IF EXISTS "versions_parent_version_id_idx";
ALTER TABLE "versions" DROP COLUMN IF EXISTS "parent_version_id";

-- PG 不允许直接删枚举值（ALTER TYPE DROP VALUE 仅 PG13+ 且需无使用）；回滚登记：状态列保持 8 值，
-- 应用层新值不可用即可（重构枚举需新建类型，重量级，登记为回滚限制）。

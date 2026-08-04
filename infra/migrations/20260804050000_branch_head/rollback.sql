-- P1C-2 回滚：分支起点锚点列（迁移 13）
ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_head_commit_id_fkey";
DROP INDEX IF EXISTS "branches_head_commit_id_idx";
ALTER TABLE "branches" DROP COLUMN IF EXISTS "head_commit_id";

-- P1C-6 回滚：PR 幂等键（迁移 14）
DROP INDEX IF EXISTS "pull_requests_idempotency_key_key";
ALTER TABLE "pull_requests" DROP COLUMN IF EXISTS "idempotency_key";

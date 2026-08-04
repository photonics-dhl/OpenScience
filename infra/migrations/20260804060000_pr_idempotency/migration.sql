-- P1C-6 迁移 14：PR 幂等键（§16 幂等防重复提交）
-- additive：加可空列 + 唯一索引（null 可多行），不破坏既有数据。

ALTER TABLE "pull_requests" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "pull_requests_idempotency_key_key" ON "pull_requests"("idempotency_key");

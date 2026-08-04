-- P1D-8 迁移 18：发布状态机扩展 + parentVersion 链（§4.1 状态机 + §2.2-3 增量版本）
-- additive：枚举加值 + 可空列 + 自引用 FK，不破坏既有数据。
-- 注意：ALTER TYPE ADD VALUE 不能在事务内执行（migrate-cli 逐条执行，OK）。

ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'restricted';

ALTER TABLE "versions" ADD COLUMN "parent_version_id" UUID;

ALTER TABLE "versions"
    ADD CONSTRAINT "versions_parent_version_id_fkey"
      FOREIGN KEY ("parent_version_id") REFERENCES "versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "versions_parent_version_id_idx" ON "versions"("parent_version_id");

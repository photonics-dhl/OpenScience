-- P1C-2 迁移 13：分支起点锚点（§8 Branch 语义 + §21.2 步骤 11 Fork 后建分支前置）
-- 决策（design gate Q3）：headCommitId 可选，校验同 RO，落 branch.head_commit_id 作链锚点；
-- 新分支首个 commit 的 parentCommitId 取该锚点（createCommit 分支无既有 commit 时回退 head_commit_id）。
-- additive：仅加可空列 + 外键，不破坏既有数据。

ALTER TABLE "branches" ADD COLUMN "head_commit_id" UUID;

ALTER TABLE "branches"
    ADD CONSTRAINT "branches_head_commit_id_fkey"
      FOREIGN KEY ("head_commit_id") REFERENCES "commits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "branches_head_commit_id_idx" ON "branches"("head_commit_id");

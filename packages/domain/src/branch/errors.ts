export type BranchErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NAME_EXISTS' // @@unique([roId, name]) 冲突（§16 幂等：重发同 key → 拒绝而非重复建）
  | 'DEFAULT_BRANCH' // 主分支禁删
  | 'BRANCH_HAS_COMMITS' // 有 Commit 的分支禁删（§3.4 不可抹除）
  | 'BRANCH_IN_USE' // 被 PR 引用的分支禁删（§8.2）
  | 'CROSS_RO_COMMIT'; // headCommitId 不属于同一 RO

export class BranchError extends Error {
  constructor(
    readonly code: BranchErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

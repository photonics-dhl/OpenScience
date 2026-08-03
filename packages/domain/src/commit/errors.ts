export type CommitErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONCURRENT_UPDATE' // 乐观锁冲突（§16）
  | 'VERSION_PUBLISHED' // 公开版本不可修改（§2.2.3）
  | 'DUPLICATE_IDEMPOTENCY_KEY'; // §16 幂等键重复

export class CommitError extends Error {
  constructor(
    readonly code: CommitErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

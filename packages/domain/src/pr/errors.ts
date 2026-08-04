export type PrErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'INHERITANCE_VIOLATION' // 许可继承校验不通过（§6.3/§8.2）
  | 'CROSS_RO_BRANCH' // 源/目标分支不属于同一 RO
  | 'DUPLICATE_IDEMPOTENCY_KEY'; // 幂等键冲突（§16）

export class PrError extends Error {
  constructor(
    readonly code: PrErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

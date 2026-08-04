export type AgentErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_CREDIT' // AI Credit 配额不足（§9.1 + §2.4-7）
  | 'DUPLICATE_IDEMPOTENCY_KEY' // §16 幂等键
  | 'ILLEGAL_TRANSITION'; // 任务状态机非法迁移

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

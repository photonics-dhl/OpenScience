export type PublishErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'REVIEW_NOT_PASSED' // AI 审核未通过（P1D-5）
  | 'LICENSE_MISSING' // 三类许可未选齐（§6.3）
  | 'R3_CONFIRMATION_REQUIRED' // 发布确认需 R3 审批（§9.4）
  | 'ALREADY_PUBLISHED' // 幂等：已发布
  | 'ILLEGAL_TRANSITION'; // 状态机非法迁移（§4.1）

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

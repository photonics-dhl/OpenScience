export type ReviewErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'PR_NOT_OPEN' // 仅 open 状态可 Review/Merge（§8.3）
  | 'HIGH_RISK_CONFIRMATION_REQUIRED'; // 高风险需显式确认（§8.3）

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

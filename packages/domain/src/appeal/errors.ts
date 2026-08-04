export type AppealErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'REVIEW_NOT_BLOCKED' // §11.3：仅审核失败（blocked）后可申诉
  | 'ALREADY_PENDING'; // 同 version 未决申诉去重

export class AppealError extends Error {
  constructor(
    readonly code: AppealErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

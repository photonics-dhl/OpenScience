export type ApprovalErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ILLEGAL_TRANSITION'
  | 'ALREADY_PROCESSED'; // 同批已批准/拒绝（§9.4 不重复弹窗）

export class ApprovalError extends Error {
  constructor(
    readonly code: ApprovalErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

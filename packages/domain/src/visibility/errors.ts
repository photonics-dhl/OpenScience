export type VisibilityErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'REQUEST_PENDING'; // 扩大可见性已请求，待审批（§4.2）

export class VisibilityError extends Error {
  constructor(
    readonly code: VisibilityErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

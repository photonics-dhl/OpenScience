export type IssueErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'COMMENT_TARGET_INVALID' // 三 FK 全空或多选
  | 'CROSS_RO_COMMENT'; // Comment 归属跨 RO

export class IssueError extends Error {
  constructor(
    readonly code: IssueErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

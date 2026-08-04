export type AuthorErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'MULTIPLE_CORRESPONDING' // 通讯作者至多一人（§3.4）

export class AuthorError extends Error {
  constructor(
    readonly code: AuthorErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export type ResearchObjectErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONCURRENT_UPDATE'; // 乐观锁冲突（§16）

export class ResearchObjectError extends Error {
  constructor(
    readonly code: ResearchObjectErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

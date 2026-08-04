export type LicenseErrorCode =
  | 'RESEARCH_OBJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'VERSION_PUBLISHED' // 已公开版本许可只读（§6.3）
  | 'INVALID_LICENSE_ID'; // 目录外标识

export class LicenseError extends Error {
  constructor(
    readonly code: LicenseErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

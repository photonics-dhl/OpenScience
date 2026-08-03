export type ArtifactErrorCode =
  | 'ARTIFACT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'FILE_TOO_LARGE' // 超配额（§13.3）
  | 'MALICIOUS_FILE'; // 病毒扫描不通过（§17）

export class ArtifactError extends Error {
  constructor(
    readonly code: ArtifactErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export type ClaimEvidenceErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'VERSION_IMMUTABLE'
  | 'CONCURRENT_UPDATE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'LOCATOR_MISMATCH'
  | 'ORIGINAL_MISSING'
  | 'DEPENDENT_RECORDS';

export class ClaimEvidenceError extends Error {
  constructor(
    public readonly code: ClaimEvidenceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ClaimEvidenceError';
  }
}

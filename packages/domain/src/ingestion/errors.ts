export type IngestionErrorCode =
  | 'INGESTION_NOT_FOUND'
  | 'PROCESSING_CONSENT_REQUIRED'
  | 'UNSUPPORTED_INGESTION_FORMAT'
  | 'INGESTION_NOT_RETRYABLE'
  | 'VALIDATION_ERROR';

export class IngestionError extends Error {
  constructor(readonly code: IngestionErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export type PresentationAssetErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'SOURCE_CLAIM_INVALID' | 'ADMIN_REQUIRED' | 'VALIDATION_ERROR' | 'ILLEGAL_TRANSITION' | 'CONCURRENT_UPDATE';

export class PresentationAssetError extends Error {
  constructor(readonly code: PresentationAssetErrorCode, message: string) {
    super(message);
    this.name = 'PresentationAssetError';
  }
}

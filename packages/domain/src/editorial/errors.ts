export type EditorialErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VERSION_NOT_PUBLIC'
  | 'DUPLICATE_SELECTION'
  | 'INVALID_MEDIA'
  | 'ILLEGAL_TRANSITION'
  | 'IMMUTABLE_SELECTION';

export class EditorialError extends Error {
  constructor(public readonly code: EditorialErrorCode, message: string) {
    super(message);
    this.name = 'EditorialError';
  }
}

export class TrashError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'CLEANUP_PENDING', message: string) {
    super(message);
    this.name = 'TrashError';
  }
}

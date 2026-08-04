export type NotificationErrorCode =
  | 'NOTIFICATION_NOT_FOUND'
  | 'FORBIDDEN';

export class NotificationError extends Error {
  constructor(
    readonly code: NotificationErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

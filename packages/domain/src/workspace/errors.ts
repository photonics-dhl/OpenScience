export type WorkspaceErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'FORBIDDEN'
  | 'ALREADY_MEMBER'
  | 'INVITATION_PENDING_EXISTS'
  | 'LAST_OWNER'
  | 'PERSONAL_WORKSPACE'
  | 'WORKSPACE_ARCHIVED'
  | 'VALIDATION_ERROR';

export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

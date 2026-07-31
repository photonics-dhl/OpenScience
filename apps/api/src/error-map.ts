import { AuthError, type AuthErrorCode } from '@openscience/auth';
import { WorkspaceError, type WorkspaceErrorCode } from '@openscience/domain';

const AUTH_ERROR_HTTP: Record<AuthErrorCode, number> = {
  INVITATION_INVALID: 400,
  EMAIL_ALREADY_REGISTERED: 409,
  CODE_INVALID: 400,
  CODE_EXPIRED: 410,
  CODE_LOCKED: 429,
  RESEND_COOLDOWN: 429,
  CREDENTIALS_INVALID: 401,
  ACCOUNT_NOT_ACTIVE: 403,
  SESSION_INVALID: 401,
};

const WORKSPACE_ERROR_HTTP: Record<WorkspaceErrorCode, number> = {
  WORKSPACE_NOT_FOUND: 404,
  FORBIDDEN: 403,
  ALREADY_MEMBER: 409,
  INVITATION_PENDING_EXISTS: 409,
  LAST_OWNER: 409,
  PERSONAL_WORKSPACE: 409,
  WORKSPACE_ARCHIVED: 409,
  VALIDATION_ERROR: 400,
};

export interface ErrorBody {
  error: { code: string; message: string };
}

/** 统一错误映射（2.6 扩展为全局标准前的最小版：/auth + /workspaces）。 */
export function httpStatusForError(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AuthError) {
    return { status: AUTH_ERROR_HTTP[err.code], body: { error: { code: err.code, message: err.message } } };
  }
  if (err instanceof WorkspaceError) {
    return { status: WORKSPACE_ERROR_HTTP[err.code], body: { error: { code: err.code, message: err.message } } };
  }
  if ((err as { name?: string })?.name === 'ZodError') {
    return { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: '请求参数不合法' } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: '内部错误' } } };
}

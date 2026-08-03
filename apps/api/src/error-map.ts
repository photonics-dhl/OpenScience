import { AuthError, type AuthErrorCode } from '@openscience/auth';
import { UsageError, WorkspaceError, type WorkspaceErrorCode } from '@openscience/domain';
import { buildErrorBody, type ErrorBody } from '@openscience/observability';

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

const USAGE_ERROR_HTTP: Record<UsageError['code'], number> = {
  DUPLICATE_IDEMPOTENCY_KEY: 409,
  VALIDATION_ERROR: 400,
};

export type { ErrorBody };

/** 统一错误映射（2.6 扩展为全局标准前的最小版：/auth + /workspaces + /usage）；requestId 三方串联（Spec §17）。 */
export function httpStatusForError(err: unknown, requestId?: string): { status: number; body: ErrorBody } {
  if (err instanceof AuthError) {
    return { status: AUTH_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof WorkspaceError) {
    return { status: WORKSPACE_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof UsageError) {
    return { status: USAGE_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if ((err as { name?: string })?.name === 'ZodError') {
    return { status: 400, body: buildErrorBody('VALIDATION_ERROR', '请求参数不合法', requestId) };
  }
  return { status: 500, body: buildErrorBody('INTERNAL', '内部错误', requestId) };
}

import { AuthError, type AuthErrorCode } from '@openscience/auth';
import { ArtifactError, BranchError, CommitError, ForkError, IssueError, LicenseError, ResearchObjectError, UsageError, VisibilityError, WorkspaceError, type WorkspaceErrorCode } from '@openscience/domain';
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

const RESEARCH_OBJECT_ERROR_HTTP: Record<ResearchObjectError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  CONCURRENT_UPDATE: 409, // 乐观锁冲突（§16）
};

const ARTIFACT_ERROR_HTTP: Record<ArtifactError['code'], number> = {
  ARTIFACT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  FILE_TOO_LARGE: 413, // 超配额（§13.3）
  MALICIOUS_FILE: 451, // 病毒扫描不通过（§17，P1B-8 实装）
};

const COMMIT_ERROR_HTTP: Record<CommitError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  CONCURRENT_UPDATE: 409, // 乐观锁冲突（§16）
  VERSION_PUBLISHED: 409, // 公开版本不可修改（§2.2.3）
  DUPLICATE_IDEMPOTENCY_KEY: 409, // §16 幂等键重复
};

const VISIBILITY_ERROR_HTTP: Record<VisibilityError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  REQUEST_PENDING: 409, // 扩大可见性已请求待审批（§4.2）
};

const BRANCH_ERROR_HTTP: Record<BranchError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  NAME_EXISTS: 409, // §16 幂等：同名分支冲突
  DEFAULT_BRANCH: 403, // 主分支禁删
  BRANCH_HAS_COMMITS: 403, // 有 Commit 禁删（§3.4）
  BRANCH_IN_USE: 403, // 被 PR 引用禁删（§8.2）
  CROSS_RO_COMMIT: 400, // 起点 Commit 跨 RO
};

const ISSUE_ERROR_HTTP: Record<IssueError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  COMMENT_TARGET_INVALID: 400, // 评论目标缺失/多选
  CROSS_RO_COMMENT: 400, // 评论归属跨 RO
};

const LICENSE_ERROR_HTTP: Record<LicenseError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  VERSION_PUBLISHED: 409, // 已公开版本许可只读（§6.3）
  INVALID_LICENSE_ID: 400, // 目录外标识
};

const FORK_ERROR_HTTP: Record<ForkError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  SOURCE_NOT_PUBLIC: 404, // 非 public 源不泄露（§4.2 + §17）
  VERSION_NO_MANIFEST: 409, // 源无可复刻版本
  INHERITANCE_VIOLATION: 409, // 许可继承校验不通过（§6.3）
  ALREADY_FORKED: 409, // 一 RO 至多一个来源（§8.1）
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
  if (err instanceof ResearchObjectError) {
    return { status: RESEARCH_OBJECT_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ArtifactError) {
    return { status: ARTIFACT_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof CommitError) {
    return { status: COMMIT_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof VisibilityError) {
    return { status: VISIBILITY_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof BranchError) {
    return { status: BRANCH_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof IssueError) {
    return { status: ISSUE_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof LicenseError) {
    return { status: LICENSE_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ForkError) {
    return { status: FORK_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  // @fastify/csrf-protection 校验失败：403 而非 500（FastifyError.code = FST_CSRF_INVALID_TOKEN / FST_CSRF_MISSING_SECRET）
  if (typeof (err as { code?: unknown }).code === 'string' && (err as { code: string }).code.startsWith('FST_CSRF')) {
    return { status: 403, body: buildErrorBody('CSRF_INVALID', 'CSRF token 校验失败', requestId) };
  }
  if ((err as { name?: string })?.name === 'ZodError') {
    return { status: 400, body: buildErrorBody('VALIDATION_ERROR', '请求参数不合法', requestId) };
  }
  return { status: 500, body: buildErrorBody('INTERNAL', '内部错误', requestId) };
}

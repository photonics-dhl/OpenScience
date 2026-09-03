import { AuthError, type AuthErrorCode } from '@openscience/auth';
import { AgentError, AppealError, ApprovalError, ArtifactError, AuthorError, BranchError, ClaimEvidenceError, CommitError, EditorialError, ForkError, IngestionError, IssueError, LicenseError, NotificationError, PrError, PublicEvidenceSourceError, PublishError, ReadingPreferenceError, ResearchIdentityProfileError, ResearchIntelligenceValidationError, ResearchObjectError, ReviewError, UsageError, VisibilityError, WorkspaceError, type ReadingPreferenceErrorCode, type ResearchIdentityProfileErrorCode, type WorkspaceErrorCode } from '@openscience/domain';
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
  VERIFICATION_DELIVERY_FAILED: 503,
  ORCID_NOT_CONFIGURED: 503,
  ORCID_AUTHORIZATION_FAILED: 400,
  CREDENTIAL_ALREADY_LINKED: 409,
  INSTITUTION_DOMAIN_NOT_ALLOWED: 400,
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

const PR_ERROR_HTTP: Record<PrError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  INHERITANCE_VIOLATION: 409, // 许可继承校验不通过（§6.3/§8.2）
  CROSS_RO_BRANCH: 400, // 分支跨 RO
  DUPLICATE_IDEMPOTENCY_KEY: 409, // §16 幂等键重复
};

const AUTHOR_ERROR_HTTP: Record<AuthorError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  MULTIPLE_CORRESPONDING: 409, // 通讯作者至多一人（§3.4）
};

const REVIEW_ERROR_HTTP: Record<ReviewError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  PR_NOT_OPEN: 409, // 仅 open 可 Review/Merge（§8.3）
  HIGH_RISK_CONFIRMATION_REQUIRED: 409, // 高风险需显式确认（§8.3）
};

const NOTIFICATION_ERROR_HTTP: Record<NotificationError['code'], number> = {
  NOTIFICATION_NOT_FOUND: 404,
  FORBIDDEN: 403,
};

const AGENT_ERROR_HTTP: Record<AgentError['code'], number> = {
  RESEARCH_OBJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  INSUFFICIENT_CREDIT: 409, // AI Credit 不足（§9.1 + §2.4-7）
  DUPLICATE_IDEMPOTENCY_KEY: 409, // §16 幂等键重复
  ILLEGAL_TRANSITION: 409, // 任务状态机非法迁移
};

const INGESTION_ERROR_HTTP: Record<IngestionError['code'], number> = {
  INGESTION_NOT_FOUND: 404,
  PROCESSING_CONSENT_REQUIRED: 400,
  UNSUPPORTED_INGESTION_FORMAT: 415,
  INGESTION_NOT_RETRYABLE: 409,
  FILE_TOO_LARGE: 413,
  INGESTION_BUSY: 429,
  VALIDATION_ERROR: 400,
};

const APPROVAL_ERROR_HTTP: Record<ApprovalError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  ILLEGAL_TRANSITION: 409,
  ALREADY_PROCESSED: 409,
};

const APPEAL_ERROR_HTTP: Record<AppealError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  REVIEW_NOT_BLOCKED: 409, // §11.3 仅 blocked 后可申诉
  ALREADY_PENDING: 409, // 同版本未决申诉
};

const PUBLISH_ERROR_HTTP: Record<PublishError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  REVIEW_NOT_PASSED: 409, // AI 审核未通过（§2.3-4）
  LICENSE_MISSING: 409, // 许可未选（§6.3）
  R3_CONFIRMATION_REQUIRED: 409, // R3 审批（§9.4）
  ALREADY_PUBLISHED: 409,
  ILLEGAL_TRANSITION: 409,
};

const EDITORIAL_ERROR_HTTP: Record<EditorialError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VERSION_NOT_PUBLIC: 409,
  DUPLICATE_SELECTION: 409,
  INVALID_MEDIA: 400,
  ILLEGAL_TRANSITION: 409,
  IMMUTABLE_SELECTION: 409,
};

const RESEARCH_IDENTITY_ERROR_HTTP: Record<ResearchIdentityProfileErrorCode, number> = {
  INVALID_PROFILE_STATE: 400,
  INVALID_PROFILE_PATCH: 400,
  PROFILE_VERSION_CONFLICT: 409,
  INVALID_INTEREST_SIGNAL: 400,
};

const READING_PREFERENCE_ERROR_HTTP: Record<ReadingPreferenceErrorCode, number> = {
  PREFERENCE_VERSION_CONFLICT: 409,
  INVALID_READING_PREFERENCE: 400,
};

const CLAIM_EVIDENCE_ERROR_HTTP: Record<ClaimEvidenceError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  VERSION_IMMUTABLE: 409,
  CONCURRENT_UPDATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  LOCATOR_MISMATCH: 409,
  ORIGINAL_MISSING: 409,
  DEPENDENT_RECORDS: 409,
};

export type { ErrorBody };

/** 统一错误映射（2.6 扩展为全局标准前的最小版：/auth + /workspaces + /usage）；requestId 三方串联（Spec §17）。 */
export function httpStatusForError(err: unknown, requestId?: string): { status: number; body: ErrorBody } {
  if (err instanceof PublicEvidenceSourceError) {
    return { status: err.code === 'SOURCE_UNAVAILABLE' ? 503 : 404, body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ReadingPreferenceError) {
    return { status: READING_PREFERENCE_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ClaimEvidenceError) {
    return { status: CLAIM_EVIDENCE_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ResearchIntelligenceValidationError) {
    return { status: 400, body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ResearchIdentityProfileError) {
    return { status: RESEARCH_IDENTITY_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof EditorialError) {
    return { status: EDITORIAL_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
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
  if (err instanceof PrError) {
    return { status: PR_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof AuthorError) {
    return { status: AUTHOR_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ReviewError) {
    return { status: REVIEW_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof NotificationError) {
    return { status: NOTIFICATION_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof AgentError) {
    return { status: AGENT_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof IngestionError) {
    return { status: INGESTION_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof ApprovalError) {
    return { status: APPROVAL_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof AppealError) {
    return { status: APPEAL_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  if (err instanceof PublishError) {
    return { status: PUBLISH_ERROR_HTTP[err.code], body: buildErrorBody(err.code, err.message, requestId) };
  }
  // @fastify/csrf-protection 校验失败：403 而非 500（FastifyError.code = FST_CSRF_INVALID_TOKEN / FST_CSRF_MISSING_SECRET）
  if (typeof (err as { code?: unknown }).code === 'string' && (err as { code: string }).code.startsWith('FST_CSRF')) {
    return { status: 403, body: buildErrorBody('CSRF_INVALID', 'CSRF token 校验失败', requestId) };
  }
  if (['FST_REQ_FILE_TOO_LARGE', 'FST_REQ_PARTS_LIMIT', 'FST_REQ_FIELDS_LIMIT', 'FST_ERR_CTP_BODY_TOO_LARGE'].includes(String((err as { code?: unknown }).code))) {
    return { status: 413, body: buildErrorBody('FILE_TOO_LARGE', '上传内容超过限制', requestId) };
  }
  if ((err as { name?: string })?.name === 'ZodError') {
    return { status: 400, body: buildErrorBody('VALIDATION_ERROR', '请求参数不合法', requestId) };
  }
  return { status: 500, body: buildErrorBody('INTERNAL', '内部错误', requestId) };
}

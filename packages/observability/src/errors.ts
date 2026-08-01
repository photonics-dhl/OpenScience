export interface ErrorBody {
  error: { code: string; message: string; requestId?: string };
}

/** 统一错误响应体（Spec §17）：requestId 与日志行、AuditLog.requestId 三方串联。 */
export function buildErrorBody(code: string, message: string, requestId?: string): ErrorBody {
  return { error: { code, message, ...(requestId ? { requestId } : {}) } };
}

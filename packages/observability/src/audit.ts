import type { Prisma } from '@prisma/client';

export interface AuditEvent {
  actorId: string | null;
  /** `<域>.<动作>`，如 'workspace.create' / 'auth.login' / 'authz.deny'。 */
  action: string;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  /** 已由调用方脱敏/裁剪；绝不记密码、验证码、session token（Spec §17）。 */
  metadata?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
}

/** API 层组装、domain/auth 尾参传入的请求上下文。 */
export interface AuditContext {
  requestId?: string;
  ip?: string;
}

export interface AuditSink {
  /** 有 tx 时审计行与业务行同事务；sink throw 则业务回滚。 */
  record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<void>;
}

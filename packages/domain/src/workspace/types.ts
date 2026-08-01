import type { PrismaClient } from '@prisma/client';
import type { Mailer } from '@openscience/auth';
import type { AuditSink } from '@openscience/observability';

export interface WorkspaceDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
  /** P1A-6 审计：缺省则不记录（现有测试/调用零影响）。 */
  audit?: AuditSink;
}

export function now(deps: WorkspaceDeps): Date {
  return deps.now ? deps.now() : new Date();
}

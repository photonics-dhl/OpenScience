import type { PrismaClient } from '@prisma/client';
import type { Mailer } from '@openscience/auth';

export interface WorkspaceDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  /** 测试注入时钟；默认系统时间。 */
  now?: () => Date;
}

export function now(deps: WorkspaceDeps): Date {
  return deps.now ? deps.now() : new Date();
}

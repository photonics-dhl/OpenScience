import type { Prisma } from '@prisma/client';
import { ensureMonthlyGrantForUser } from '../usage/grants';

export interface PersonalWorkspaceUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * 邮箱验证通过回调：在同一事务内创建 Personal Workspace + owner Membership，并补齐当月 AI Credit。
 * 幂等：Workspace 已存在仍检查当月 grant；并发撞唯一约束视为相同操作重放。
 */
export async function createPersonalWorkspace(
  tx: Prisma.TransactionClient,
  user: PersonalWorkspaceUser,
  at: Date = new Date(),
): Promise<void> {
  const existing = await tx.workspace.findFirst({ where: { type: 'personal', ownerId: user.id } });
  if (!existing) {
    const displayName = user.displayName.trim() || user.email.split('@')[0];
    try {
      await tx.workspace.create({
        data: {
          type: 'personal',
          name: `${displayName} 的个人空间`,
          ownerId: user.id,
          members: { create: { userId: user.id, role: 'owner' } },
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
    }
  }
  await ensureMonthlyGrantForUser(tx, user.id, at.toISOString().slice(0, 7));
}

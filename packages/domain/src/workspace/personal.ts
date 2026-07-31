import type { Prisma } from '@prisma/client';

export interface PersonalWorkspaceUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * 邮箱验证通过回调：在同一事务内创建 Personal Workspace + owner Membership。
 * 幂等：已存在则直接返回；并发撞部分唯一索引（P2002）视为成功。
 */
export async function createPersonalWorkspace(
  tx: Prisma.TransactionClient,
  user: PersonalWorkspaceUser,
): Promise<void> {
  const existing = await tx.workspace.findFirst({ where: { type: 'personal', ownerId: user.id } });
  if (existing) return;
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
    if ((err as { code?: string })?.code === 'P2002') return;
    throw err;
  }
}

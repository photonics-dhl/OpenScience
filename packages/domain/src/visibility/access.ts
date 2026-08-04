import type { WorkspaceDeps } from '../workspace/types';
import { VisibilityError } from './errors';

export type RoAccess = 'granted' | 'denied';

/**
 * RO 访问判定（§4.2 三态矩阵 + §17 越权防护）：
 * | visibility  | 成员 | 非成员 | 匿名 |
 * |-------------|------|--------|------|
 * | public      | ✅    | ✅      | ✅    |
 * | private     | ✅    | ❌      | ❌    |
 * | invite_only | ✅    | grant ✅ | ❌   |
 */
export async function canAccessRo(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<RoAccess> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) return 'denied'; // 不存在 → denied（404 语义不泄露）

  // public：公众可见（§4.2），匿名可看
  if (ro.visibility === 'public') return 'granted';

  // 未登录：private/invite_only 均不可
  if (!input.userId) return 'denied';

  // 成员：所有可见性可看
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: ro.workspaceId, userId: input.userId } },
  });
  if (membership) return 'granted';

  // invite_only：被指定账户（VisibilityGrant）可见
  if (ro.visibility === 'invite_only') {
    const grant = await deps.prisma.visibilityGrant.findUnique({
      where: { researchObjectId_granteeId: { researchObjectId: ro.id, granteeId: input.userId } },
    });
    if (grant) return 'granted';
  }

  return 'denied';
}

/** 断言可访问；否则抛 404（不泄露 RO 存在性，§17）。 */
export async function requireRoAccess(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<void> {
  const access = await canAccessRo(deps, input);
  if (access === 'denied') {
    throw new VisibilityError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  }
}

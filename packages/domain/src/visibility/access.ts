import type { WorkspaceDeps } from '../workspace/types';
import { canReadCurrentPublicResearch } from './current-public-access';
import { VisibilityError } from './errors';

export type RoAccess = 'granted' | 'denied';

/** Live drafts/history require membership or an explicit private sharing grant. */
export async function canAccessPrivateRo(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<RoAccess> {
  if (!input.userId) return 'denied';
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro || ro.deletedAt) return 'denied';
  const member = await deps.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: ro.workspaceId, userId: input.userId } } });
  if (member) return 'granted';
  if (ro.visibility !== 'invite_only') return 'denied';
  const grant = await deps.prisma.visibilityGrant.findUnique({ where: { researchObjectId_granteeId: { researchObjectId: ro.id, granteeId: input.userId } } });
  return grant ? 'granted' : 'denied';
}

export async function requirePrivateRoAccess(deps: WorkspaceDeps, input: { researchObjectId: string; userId?: string }): Promise<void> {
  if (await canAccessPrivateRo(deps, input) === 'denied') throw new VisibilityError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
}

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
  input: { researchObjectId: string; userId?: string; versionId?: string },
): Promise<RoAccess> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) return 'denied'; // 不存在 → denied（404 语义不泄露）

  // 期刊发布仍受当前来源权限约束；普通 public RO 保持原有行为。
  if (ro.visibility === 'public'
    && await canReadCurrentPublicResearch(deps, { researchObjectId: ro.id, versionId: input.versionId })) return 'granted';

  // 未登录：private/invite_only 或当前不可公开的期刊 RO 均不可
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
  input: { researchObjectId: string; userId?: string; versionId?: string },
): Promise<void> {
  const access = await canAccessRo(deps, input);
  if (access === 'denied') {
    throw new VisibilityError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  }
}

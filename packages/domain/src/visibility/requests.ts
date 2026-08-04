import type { RoVisibility } from '../research-object/types';
import type { WorkspaceDeps } from '../workspace/types';
import { requireMembership } from '../workspace/helpers';
import { VisibilityError } from './errors';
import type { AuditContext, AuditEvent } from '@openscience/observability';

/** §4.2 可见性扩大判定：from → to 是否扩大可见范围。 */
export function isVisibilityExpansion(from: RoVisibility, to: RoVisibility): boolean {
  const rank = { private: 0, invite_only: 1, public: 2 } as const;
  return rank[to] > rank[from];
}

export interface VisibilityChangeResult {
  applied: boolean; // true = 直接应用；false = 请求已记录（扩大待审批）
  requestId?: string;
}

/** 非事务审计写（deps.audit 缺省 no-op）。 */
function audit(deps: WorkspaceDeps, event: Omit<AuditEvent, 'requestId' | 'ip'>, ctx: AuditContext): void {
  void deps.audit?.record({ ...event, requestId: ctx.requestId, ip: ctx.ip });
}

/**
 * 可见性变更（§4.2 扩大需显式审批 + §17 审计）：
 * - 缩小/同级（public→private 等）→ 直接应用 + 审计
 * - 扩大（private→invite_only/public，invite_only→public）→ 阻断 + 写 VisibilityRequest(pending)（审批流 Phase 1D）
 * - 幂等：同 toVisibility 无变化 → 直接成功 + 审计
 */
export async function requestVisibilityChange(
  deps: WorkspaceDeps,
  input: { userId: string; researchObjectId: string; toVisibility: RoVisibility },
  ctx: AuditContext = {},
): Promise<VisibilityChangeResult> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new VisibilityError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  // 幂等：无变化直接成功（Design Gate 决策）
  if (ro.visibility === input.toVisibility) {
    audit(deps, {
      actorId: input.userId, action: 'research_object.visibility', workspaceId: ro.workspaceId,
      targetType: 'research_object', targetId: ro.id,
      metadata: { from: ro.visibility, to: input.toVisibility, applied: true, idempotent: true },
    }, ctx);
    return { applied: true };
  }

  // 扩大 → 阻断 + 请求记录（§4.2 MUST 显式审批）
  if (isVisibilityExpansion(ro.visibility, input.toVisibility)) {
    const req = await deps.prisma.visibilityRequest.create({
      data: {
        researchObjectId: ro.id,
        requestedBy: input.userId,
        fromVisibility: ro.visibility,
        toVisibility: input.toVisibility,
        status: 'pending',
      },
    });
    audit(deps, {
      actorId: input.userId, action: 'visibility.request', workspaceId: ro.workspaceId,
      targetType: 'visibility_request', targetId: req.id,
      metadata: { from: ro.visibility, to: input.toVisibility, status: 'pending' },
    }, ctx);
    return { applied: false, requestId: req.id };
  }

  // 缩小/同级 → 直接应用
  await deps.prisma.researchObject.update({
    where: { id: ro.id },
    data: { visibility: input.toVisibility },
  });
  audit(deps, {
    actorId: input.userId, action: 'research_object.visibility', workspaceId: ro.workspaceId,
    targetType: 'research_object', targetId: ro.id,
    metadata: { from: ro.visibility, to: input.toVisibility, applied: true },
  }, ctx);
  return { applied: true };
}

/** invite_only 指定账户（§4.2）：成员发起，写 VisibilityGrant。 */
export async function grantVisibility(
  deps: WorkspaceDeps,
  input: { userId: string; researchObjectId: string; granteeId: string },
  ctx: AuditContext = {},
): Promise<void> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new VisibilityError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  await deps.prisma.visibilityGrant.upsert({
    where: { researchObjectId_granteeId: { researchObjectId: ro.id, granteeId: input.granteeId } },
    create: { researchObjectId: ro.id, granteeId: input.granteeId, grantedBy: input.userId },
    update: {},
  });
  audit(deps, {
    actorId: input.userId, action: 'visibility.grant', workspaceId: ro.workspaceId,
    targetType: 'visibility_grant', targetId: ro.id,
    metadata: { granteeId: input.granteeId },
  }, ctx);
}

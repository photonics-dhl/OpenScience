import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { canAccessRo } from '../visibility/access';
import type { WorkspaceDeps } from '../workspace/types';
import { CREDIT_ROLES, type CreditRole } from '../pr/prs';
import { AuthorError } from './errors';

export interface AuthorEntryInput {
  userId: string;
  isCorresponding?: boolean;
}

export interface AuthorView {
  userId: string;
  displayName: string;
  sortOrder: number;
  isCorresponding: boolean;
}

export interface AuthorChangeInfo {
  authors: Array<{ userId: string; sortOrder: number; isCorresponding: boolean }>;
  /** §2.3 决策 2：事实贡献者独立记录，作者名单变化不抹除。 */
  contributorIds: string[];
}

/**
 * 作者组判定（§3.4 + Q1）：Author 表用户 ∪ RO 创建者。
 * 空作者名单 → 创建者独属（可先建名单）。
 */
async function requireAuthorGroup(
  deps: WorkspaceDeps,
  ro: { id: string; createdBy: string },
  userId: string,
): Promise<void> {
  const authors = await deps.prisma.author.findMany({ where: { researchObjectId: ro.id } });
  const group = new Set(authors.map((a) => a.userId));
  group.add(ro.createdBy);
  if (!group.has(userId)) {
    throw new AuthorError('FORBIDDEN', '仅作者组可变更作者名单（§3.4）');
  }
}

/**
 * 设置作者名单（§3.4 作者组确认署名/顺序/通讯 + Q2 全量替换）：
 * - 仅作者组成员可变更（§3.4）
 * - 通讯作者至多一人（MULTIPLE_CORRESPONDING）
 * - 全量替换事务：删旧 + 建新（顺序 = 数组序）+ 审计
 * - 创建者不自动第一作者/通讯（无自动逻辑，顺序完全由作者组决定）
 */
export async function setAuthors(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId: string; authors: AuthorEntryInput[] },
  ctx: AuditContext = {},
): Promise<AuthorView[]> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new AuthorError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);
  await requireAuthorGroup(deps, ro, input.userId);

  // 通讯至多一人（§3.4）
  const correspondingCount = input.authors.filter((a) => a.isCorresponding).length;
  if (correspondingCount > 1) {
    throw new AuthorError('MULTIPLE_CORRESPONDING', '通讯作者至多一人（§3.4）');
  }
  // 去重（同 user 出现两次 → 拒绝）
  const seen = new Set<string>();
  for (const a of input.authors) {
    if (seen.has(a.userId)) throw new AuthorError('VALIDATION_ERROR', '作者列表中用户重复');
    seen.add(a.userId);
  }

  await deps.prisma.$transaction(async (tx) => {
    await tx.author.deleteMany({ where: { researchObjectId: ro.id } });
    if (input.authors.length > 0) {
      await tx.author.createMany({
        data: input.authors.map((a, i) => ({
          researchObjectId: ro.id,
          userId: a.userId,
          sortOrder: i,
          isCorresponding: a.isCorresponding ?? false,
        })),
      });
    }
    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'authorship.set', workspaceId: ro.workspaceId,
      targetType: 'research_object', targetId: ro.id,
      metadata: { researchObjectId: ro.id, authors: input.authors },
    }, ctx);
  });

  return listAuthors(deps, { researchObjectId: ro.id, userId: input.userId });
}

/**
 * 作者列表（§4.2 可见性继承）：读 canAccessRo；按 sortOrder 排序（作者组决定，无自动排序）。
 */
export async function listAuthors(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<AuthorView[]> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new AuthorError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  const rows = await deps.prisma.author.findMany({
    where: { researchObjectId: input.researchObjectId },
    include: { user: { select: { id: true, displayName: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((a) => ({
    userId: a.userId,
    displayName: a.user.displayName,
    sortOrder: a.sortOrder,
    isCorresponding: a.isCorresponding,
  }));
}

/**
 * 追加事实贡献（§3.4 不可抹除 + §2.3 决策 2 + Q3 幂等）：
 * - 空间成员可添加（Q4 factual record）
 * - 同 user+role 已存在 → 幂等返回
 * - append-only：无删除 API（数据层 Restrict 兜底）
 */
export async function addContribution(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId: string; creditRole: CreditRole },
  ctx: AuditContext = {},
): Promise<{ id: string; creditRole: CreditRole }> {
  if (!(CREDIT_ROLES as readonly string[]).includes(input.creditRole)) {
    throw new AuthorError('VALIDATION_ERROR', `非法 CRediT 角色: ${input.creditRole}`);
  }
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new AuthorError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  // Q3 幂等：同 user+role 已存在 → 返回既有
  const existing = await deps.prisma.contribution.findFirst({
    where: { researchObjectId: ro.id, userId: input.userId, creditRole: input.creditRole },
  });
  if (existing) return { id: existing.id, creditRole: existing.creditRole as CreditRole };

  const row = await deps.prisma.contribution.create({
    data: { researchObjectId: ro.id, userId: input.userId, creditRole: input.creditRole },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'contribution.add', workspaceId: ro.workspaceId,
    targetType: 'contribution', targetId: row.id,
    metadata: { researchObjectId: ro.id, contributorId: input.userId, creditRole: input.creditRole },
  }, ctx);
  return { id: row.id, creditRole: row.creditRole as CreditRole };
}

/**
 * 贡献列表（§4.2 可见性继承）：读 canAccessRo；按时间追加序。
 */
export async function listContributions(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<Array<{ id: string; userId: string; creditRole: CreditRole; createdAt: Date }>> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new AuthorError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  const rows = await deps.prisma.contribution.findMany({
    where: { researchObjectId: input.researchObjectId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, userId: r.userId, creditRole: r.creditRole as CreditRole, createdAt: r.createdAt }));
}

/**
 * Merge 高风险审批查询（§3.4 末句 + Q5）：P1C-8 merge 时对比新增作者/改序。
 */
export async function getAuthorChangeInfo(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId: string },
): Promise<AuthorChangeInfo> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new AuthorError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  const authors = await deps.prisma.author.findMany({
    where: { researchObjectId: ro.id },
    orderBy: { sortOrder: 'asc' },
    select: { userId: true, sortOrder: true, isCorresponding: true },
  });
  const contributions = await deps.prisma.contribution.findMany({
    where: { researchObjectId: ro.id },
    select: { userId: true },
  });
  return {
    authors,
    contributorIds: Array.from(new Set(contributions.map((c) => c.userId))),
  };
}

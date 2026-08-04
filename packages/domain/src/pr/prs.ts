import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { canAccessRo } from '../visibility/access';
import type { ArtifactDeps } from '../artifact/artifacts';
import { assertValidLicenseId } from '../license/catalog';
import { getEffectiveLicenses, validateLicenseInheritance } from '../license/licenses';
import { compareVersions } from '../diff/comparisons';
import type { DiffResult } from '@openscience/diff';
import { PrError } from './errors';

/** §3.4 CRediT 角色（12 项）。 */
export const CREDIT_ROLES = [
  'conceptualization', 'methodology', 'software', 'validation', 'data_curation',
  'visualization', 'writing', 'supervision', 'investigation', 'resources',
  'project_administration', 'funding_acquisition',
] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export interface NewContributor {
  userId: string;
  creditRole: CreditRole[];
}

export interface CreatePullRequestInput {
  researchObjectId: string;
  userId: string;
  sourceBranchId: string;
  targetBranchId: string;
  title: string;
  body?: string;
  /** §8.2 变更声明 */
  changedSdfFields: string[];
  changedFiles: string[];
  changesMethod: boolean;
  changesData: boolean;
  changesConclusion: boolean;
  newContributors: NewContributor[];
  dataLicense: string;
  codeLicense: string;
  conflictOfInterest: string;
  /** 结构化占位（真实检查 P1D 接入，§8.2）。 */
  autoChecks: Record<string, unknown>;
  requestsRelease: boolean;
  /** §16 幂等键：同 key 重发 → 返回既有 PR。 */
  idempotencyKey?: string;
}

export interface PullRequestDetail {
  id: string;
  title: string;
  body: string;
  sourceBranchId: string;
  targetBranchId: string;
  status: string;
  authorId: string;
  createdAt: Date;
  /** §8.2 全声明 */
  changedSdfFields: string[];
  changedFiles: string[];
  changesMethod: boolean;
  changesData: boolean;
  changesConclusion: boolean;
  newContributors: NewContributor[];
  dataLicense: string;
  codeLicense: string;
  conflictOfInterest: string;
  autoChecks: Record<string, unknown>;
  requestsRelease: boolean;
  /** §7.3 分支 diff（target tip → source tip 版本）；无版本 → null */
  diff: DiffResult | null;
  commentCount: number;
}

interface PrRow {
  id: string; title: string; body: string; sourceBranchId: string; targetBranchId: string;
  status: string; authorId: string; createdAt: Date;
  changedSdfFields: unknown; changedFiles: unknown; changesMethod: boolean; changesData: boolean;
  changesConclusion: boolean; newContributors: unknown; dataLicense: string; codeLicense: string;
  conflictOfInterest: string; autoChecks: unknown; requestsRelease: boolean;
  _count?: { comments: number };
}

function rowToDetail(row: PrRow): Omit<PullRequestDetail, 'diff'> {
  return {
    id: row.id, title: row.title, body: row.body,
    sourceBranchId: row.sourceBranchId, targetBranchId: row.targetBranchId,
    status: row.status, authorId: row.authorId, createdAt: row.createdAt,
    changedSdfFields: row.changedSdfFields as string[],
    changedFiles: row.changedFiles as string[],
    changesMethod: row.changesMethod, changesData: row.changesData, changesConclusion: row.changesConclusion,
    newContributors: row.newContributors as NewContributor[],
    dataLicense: row.dataLicense, codeLicense: row.codeLicense, conflictOfInterest: row.conflictOfInterest,
    autoChecks: (row.autoChecks ?? {}) as Record<string, unknown>,
    requestsRelease: row.requestsRelease,
    commentCount: row._count?.comments ?? 0,
  };
}

function assertDeclarations(input: CreatePullRequestInput): void {
  // §8.2 MUST：变更的 SDF 字段和文件（非空数组）
  if (!Array.isArray(input.changedSdfFields) || input.changedSdfFields.length === 0) {
    throw new PrError('VALIDATION_ERROR', '必须声明变更的 SDF 字段（§8.2）');
  }
  if (!Array.isArray(input.changedFiles) || input.changedFiles.length === 0) {
    throw new PrError('VALIDATION_ERROR', '必须声明变更的文件（§8.2）');
  }
  // §8.2：新增贡献者及 CRediT 角色
  if (!Array.isArray(input.newContributors)) {
    throw new PrError('VALIDATION_ERROR', '必须声明新增贡献者（§8.2）');
  }
  for (const c of input.newContributors) {
    if (!c?.userId || !Array.isArray(c.creditRole) || c.creditRole.length === 0) {
      throw new PrError('VALIDATION_ERROR', '贡献者必须含 userId 和至少一个 CRediT 角色');
    }
    for (const role of c.creditRole) {
      if (!(CREDIT_ROLES as readonly string[]).includes(role)) {
        throw new PrError('VALIDATION_ERROR', `非法 CRediT 角色: ${role}`);
      }
    }
  }
  // §8.2：数据/代码许可（目录内）
  assertValidLicenseId(input.dataLicense);
  assertValidLicenseId(input.codeLicense);
  // §8.2：利益冲突（可 "无"）
  if (!input.conflictOfInterest || input.conflictOfInterest.trim().length === 0) {
    throw new PrError('VALIDATION_ERROR', '必须声明利益冲突（§8.2），无则填"无"');
  }
  // §8.2：布尔声明 + 自动检查 + 是否发布
  if (typeof input.changesMethod !== 'boolean' || typeof input.changesData !== 'boolean' || typeof input.changesConclusion !== 'boolean') {
    throw new PrError('VALIDATION_ERROR', '必须声明是否改变方法/数据/核心结论（§8.2）');
  }
  if (typeof input.autoChecks !== 'object' || input.autoChecks === null) {
    throw new PrError('VALIDATION_ERROR', '自动检查结果需为对象（§8.2）');
  }
  if (typeof input.requestsRelease !== 'boolean') {
    throw new PrError('VALIDATION_ERROR', '必须声明是否要求发布新版本（§8.2）');
  }
}

/** 分支 tip 版本（Commit.branchId 落点 → Version by commitId）；无 → null。 */
async function branchTipVersionId(deps: ArtifactDeps, branchId: string): Promise<string | null> {
  const tipCommit = await deps.prisma.commit.findFirst({ where: { branchId }, orderBy: { createdAt: 'desc' } });
  if (!tipCommit) return null;
  const version = await deps.prisma.version.findFirst({ where: { commitId: tipCommit.id } });
  return version?.id ?? null;
}

/**
 * 创建 PR（§8.2 全声明 + §16 幂等 + §6.3 许可继承 + §4.2 可见性 + §16 事件）：
 * 1. requireMembership（§17 越权）+ 源/目标分支同 RO（CROSS_RO_BRANCH）
 * 2. §8.2 声明强制校验
 * 3. 幂等键重放：同 key 已存在 → 返回既有 PR
 * 4. 许可继承校验：validateLicenseInheritance(源RO许可, {text: 源.text, code: codeLicense, data: dataLicense})
 * 5. 创建 PR + Notification(pull_request.opened, §16 事件占位) + 审计
 */
export async function createPullRequest(
  deps: ArtifactDeps,
  input: CreatePullRequestInput,
  ctx: AuditContext = {},
): Promise<PullRequestDetail> {
  const title = input.title.trim();
  if (!title || title.length > 200) throw new PrError('VALIDATION_ERROR', '标题需为 1-200 字符');

  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new PrError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  // 幂等键重放（§16）：同 key 已存在 → 返回既有 PR
  if (input.idempotencyKey) {
    const existing = await deps.prisma.pullRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      return getPullRequest(deps, { researchObjectId: ro.id, userId: input.userId, prId: existing.id });
    }
  }

  // 源/目标分支同 RO（Q 决策：跨 RO → 拒绝）
  const [sourceBranch, targetBranch] = await Promise.all([
    deps.prisma.branch.findFirst({ where: { id: input.sourceBranchId, researchObjectId: ro.id } }),
    deps.prisma.branch.findFirst({ where: { id: input.targetBranchId, researchObjectId: ro.id } }),
  ]);
  if (!sourceBranch || !targetBranch) throw new PrError('CROSS_RO_BRANCH', '源/目标分支不属于该研究对象');

  // §8.2 声明强制校验
  assertDeclarations(input);

  // §6.3 许可继承（Q3）：源 text + PR code/data
  const sourceLicenses = await getEffectiveLicenses(deps, { researchObjectId: ro.id, userId: input.userId });
  if (!sourceLicenses.licenses) {
    throw new PrError('VALIDATION_ERROR', '源 RO 未选择三类许可，无法提交 PR');
  }
  const inheritance = validateLicenseInheritance(sourceLicenses.licenses, {
    text: sourceLicenses.licenses.text,
    code: input.codeLicense,
    data: input.dataLicense,
  });
  if (!inheritance.ok) {
    throw new PrError(
      'INHERITANCE_VIOLATION',
      `许可继承校验不通过（§6.3）: ${inheritance.violations.map((v) => `${v.type}: ${v.source}→${v.target}`).join('; ')}`,
    );
  }

  const pr = await deps.prisma.pullRequest.create({
    data: {
      researchObjectId: ro.id,
      sourceBranchId: input.sourceBranchId,
      targetBranchId: input.targetBranchId,
      title,
      body: input.body ?? '',
      changedSdfFields: input.changedSdfFields as never,
      changedFiles: input.changedFiles as never,
      changesMethod: input.changesMethod,
      changesData: input.changesData,
      changesConclusion: input.changesConclusion,
      newContributors: input.newContributors as never,
      dataLicense: input.dataLicense,
      codeLicense: input.codeLicense,
      conflictOfInterest: input.conflictOfInterest.trim(),
      autoChecks: input.autoChecks as never,
      requestsRelease: input.requestsRelease,
      status: 'open',
      authorId: input.userId,
      idempotencyKey: input.idempotencyKey,
    },
  }).catch((e: unknown) => {
    if (typeof (e as { code?: unknown })?.code === 'string' && (e as { code: string }).code === 'P2002') {
      throw new PrError('DUPLICATE_IDEMPOTENCY_KEY', '幂等键重复（§16）', e);
    }
    throw e;
  });

  // §16 pull_request.opened 事件（占位：落 Notification 行，P1D-2 接队列幂等重放）
  await deps.prisma.notification.create({
    data: {
      userId: input.userId,
      type: 'pull_request.opened',
      payload: { prId: pr.id, researchObjectId: ro.id, authorId: input.userId },
    },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'pull_request.opened', workspaceId: ro.workspaceId,
    targetType: 'pull_request', targetId: pr.id,
    metadata: { researchObjectId: ro.id, sourceBranchId: input.sourceBranchId, targetBranchId: input.targetBranchId, requestsRelease: input.requestsRelease },
  }, ctx);

  return getPullRequest(deps, { researchObjectId: ro.id, userId: input.userId, prId: pr.id });
}

/**
 * PR 列表（§4.2 可见性继承）：读 canAccessRo（public 匿名可读）；status 过滤。
 */
export async function listPullRequests(
  deps: ArtifactDeps,
  input: { researchObjectId: string; userId?: string; status?: string },
): Promise<Omit<PullRequestDetail, 'diff'>[]> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new PrError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  const rows = await deps.prisma.pullRequest.findMany({
    where: { researchObjectId: input.researchObjectId, ...(input.status ? { status: input.status } : {}) },
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => rowToDetail(r));
}

/**
 * PR 详情 + §7.3 分支 diff（target tip 版本 → source tip 版本）。
 */
export async function getPullRequest(
  deps: ArtifactDeps,
  input: { researchObjectId: string; userId?: string; prId: string },
): Promise<PullRequestDetail> {
  const access = await canAccessRo(deps, { researchObjectId: input.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new PrError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');

  const pr = await deps.prisma.pullRequest.findFirst({
    where: { id: input.prId, researchObjectId: input.researchObjectId },
    include: { _count: { select: { comments: true } } },
  });
  if (!pr) throw new PrError('RESEARCH_OBJECT_NOT_FOUND', 'Pull Request 不存在');

  // §7.3 diff：target tip → source tip 版本（compareVersions 复用）
  const fromVersionId = await branchTipVersionId(deps, pr.targetBranchId);
  const toVersionId = await branchTipVersionId(deps, pr.sourceBranchId);
  let diff: DiffResult | null = null;
  if (fromVersionId && toVersionId && input.userId) {
    try {
      diff = await compareVersions(deps, { userId: input.userId, fromVersionId, toVersionId });
    } catch {
      diff = null; // 成员读权限内 diff 失败 → 不阻塞 PR 详情
    }
  }

  return { ...rowToDetail(pr), diff };
}

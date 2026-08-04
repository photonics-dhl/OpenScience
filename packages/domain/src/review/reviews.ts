import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { canAccessRo } from '../visibility/access';
import type { ArtifactDeps } from '../artifact/artifacts';
import { getEffectiveLicenses } from '../license/licenses';
import { getAuthorChangeInfo } from '../authorship/authors';
import { ReviewError } from './errors';

export const REVIEW_VERDICTS = ['approve', 'request_changes', 'comment'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export interface ReviewItem {
  path: string;
  kind: string;
  comment: string;
}

export interface ReviewView {
  id: string;
  prId: string;
  reviewerId: string;
  verdict: ReviewVerdict;
  body: string;
  items: ReviewItem[];
  createdAt: Date;
}

export interface HighRiskDetail {
  highRisk: boolean;
  reasons: string[];
}

/** 高风险判定（§8.3 四类）：新增作者/改序、变更许可、改变方法/数据/结论、（扩大可见性不适用）。 */
export async function assessHighRisk(
  deps: ArtifactDeps,
  input: { prId: string; userId: string },
): Promise<HighRiskDetail> {
  const pr = await deps.prisma.pullRequest.findUnique({ where: { id: input.prId } });
  if (!pr) throw new ReviewError('RESEARCH_OBJECT_NOT_FOUND', 'Pull Request 不存在');

  const reasons: string[] = [];

  // a. 新增作者（§3.4 + P1C-7 getAuthorChangeInfo）；作者合并为 append 模型（现有+新增），不改动现有顺序
  const changeInfo = await getAuthorChangeInfo(deps, { researchObjectId: pr.researchObjectId, userId: input.userId });
  const existingAuthorIds = new Set(changeInfo.authors.map((a) => a.userId));
  const prContributorIds = (pr.newContributors as Array<{ userId: string }>).map((c) => c.userId);
  const newAuthors = prContributorIds.filter((id) => !existingAuthorIds.has(id));
  if (newAuthors.length > 0) {
    reasons.push(`新增作者: ${newAuthors.join(', ')}`);
  }

  // b. 变更许可（§6.3 + P1C-4）
  const sourceLicenses = await getEffectiveLicenses(deps, { researchObjectId: pr.researchObjectId, userId: input.userId });
  if (sourceLicenses.licenses) {
    if (sourceLicenses.licenses.data !== (pr.dataLicense as string)) reasons.push(`变更数据许可: ${sourceLicenses.licenses.data} → ${pr.dataLicense}`);
    if (sourceLicenses.licenses.code !== (pr.codeLicense as string)) reasons.push(`变更代码许可: ${sourceLicenses.licenses.code} → ${pr.codeLicense}`);
  }

  // c. 改变方法/数据/核心结论（§8.2 字段）
  if (pr.changesMethod) reasons.push('声明改变方法');
  if (pr.changesData) reasons.push('声明改变数据');
  if (pr.changesConclusion) reasons.push('声明改变核心结论');

  // d. 扩大可见性：Merge 不改可见性（§8.3 登记不适用，扩大走 P1B-7 审批）

  return { highRisk: reasons.length > 0, reasons };
}

/**
 * 创建 Review（§8.2 逐项意见 + Q1 空间成员可评审）：
 * - PR 存在 + requireMembership
 * - verdict 枚举 + items 结构校验
 * - append-only（§3.4 贡献语义）+ 审计
 */
export async function createReview(
  deps: ArtifactDeps,
  input: { prId: string; userId: string; verdict: ReviewVerdict; body?: string; items?: ReviewItem[] },
  ctx: AuditContext = {},
): Promise<ReviewView> {
  if (!(REVIEW_VERDICTS as readonly string[]).includes(input.verdict)) {
    throw new ReviewError('VALIDATION_ERROR', `非法评审结论: ${input.verdict}`);
  }
  const pr = await deps.prisma.pullRequest.findUnique({ where: { id: input.prId }, include: { researchObject: true } });
  if (!pr) throw new ReviewError('RESEARCH_OBJECT_NOT_FOUND', 'Pull Request 不存在');
  if (pr.status !== 'open') throw new ReviewError('PR_NOT_OPEN', '仅 open 状态的 PR 可评审（§8.3）');
  await requireMembership(deps, pr.researchObject.workspaceId, input.userId);

  for (const item of input.items ?? []) {
    if (!item?.path || !item?.kind || !item?.comment) {
      throw new ReviewError('VALIDATION_ERROR', '逐项意见需含 path/kind/comment');
    }
  }

  const review = await deps.prisma.review.create({
    data: {
      prId: pr.id,
      reviewerId: input.userId,
      verdict: input.verdict,
      body: input.body ?? '',
      items: (input.items ?? []) as never,
    },
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'review.create', workspaceId: pr.researchObject.workspaceId,
    targetType: 'review', targetId: review.id,
    metadata: { prId: pr.id, verdict: input.verdict, itemCount: (input.items ?? []).length },
  }, ctx);
  return {
    id: review.id, prId: review.prId, reviewerId: review.reviewerId,
    verdict: review.verdict as ReviewVerdict, body: review.body,
    items: (review.items ?? []) as unknown as ReviewItem[], createdAt: review.createdAt,
  };
}

/** Review 列表（§4.2 可见性继承）：读 canAccessRo（经 PR→RO）。 */
export async function listReviews(
  deps: ArtifactDeps,
  input: { prId: string; userId?: string },
): Promise<ReviewView[]> {
  const pr = await deps.prisma.pullRequest.findUnique({ where: { id: input.prId } });
  if (!pr) throw new ReviewError('RESEARCH_OBJECT_NOT_FOUND', 'Pull Request 不存在');
  const access = await canAccessRo(deps, { researchObjectId: pr.researchObjectId, userId: input.userId });
  if (access === 'denied') throw new ReviewError('RESEARCH_OBJECT_NOT_FOUND', 'Pull Request 不存在');

  const rows = await deps.prisma.review.findMany({
    where: { prId: pr.id },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id, prId: r.prId, reviewerId: r.reviewerId,
    verdict: r.verdict as ReviewVerdict, body: r.body,
    items: (r.items ?? []) as unknown as ReviewItem[], createdAt: r.createdAt,
  }));
}

/**
 * Merge（§8.3 + §3.3 + Q2/Q3/Q4）：
 * 1. PR 存在 + status=open
 * 2. Owner/Maintainer 校验（§8.3 仅 Owner/Maintainer 可 Merge）
 * 3. 高风险判定（assessHighRisk）：highRisk && !confirmHighRisk → HIGH_RISK_CONFIRMATION_REQUIRED
 * 4. 事务：source tip commit → target 分支 + 新草稿版本 + 作者合并 + 许可应用 + PR merged + pull_request.merged 事件
 * 5. 不做自动冲突解决（§8.3）：fast-forward 语义（source tip 接 target 链尾）
 */
export async function mergePullRequest(
  deps: ArtifactDeps,
  input: { prId: string; userId: string; confirmHighRisk: boolean },
  ctx: AuditContext = {},
): Promise<{ prId: string; status: string; highRisk: HighRiskDetail }> {
  const pr = await deps.prisma.pullRequest.findUnique({
    where: { id: input.prId },
    include: { researchObject: true, targetBranch: true },
  });
  if (!pr) throw new ReviewError('RESEARCH_OBJECT_NOT_FOUND', 'Pull Request 不存在');
  if (pr.status !== 'open') throw new ReviewError('PR_NOT_OPEN', '仅 open 状态的 PR 可 Merge（§8.3）');

  const { membership } = await requireMembership(deps, pr.researchObject.workspaceId, input.userId);
  // §8.3 仅 Owner/Maintainer 可发起 Merge 审批
  if (membership.role !== 'owner' && membership.role !== 'maintainer') {
    throw new ReviewError('FORBIDDEN', '仅 Owner/Maintainer 可 Merge（§8.3）');
  }

  // 高风险确认（§8.3）
  const highRisk = await assessHighRisk(deps, { prId: pr.id, userId: input.userId });
  if (highRisk.highRisk && !input.confirmHighRisk) {
    throw new ReviewError('HIGH_RISK_CONFIRMATION_REQUIRED', `Merge 命中高风险，需显式确认（§8.3）: ${highRisk.reasons.join('; ')}`);
  }

  await deps.prisma.$transaction(async (tx) => {
    // 1. source tip commit → target 分支（fast-forward 到 target 链尾）
    const sourceTipCommit = await tx.commit.findFirst({ where: { branchId: pr.sourceBranchId }, orderBy: { createdAt: 'desc' } });
    if (sourceTipCommit) {
      await tx.commit.update({ where: { id: sourceTipCommit.id }, data: { branchId: pr.targetBranchId } });
    }

    // 2. 新草稿版本：复用 source tip manifest（versionNo = target 分支版本数+1）
    const sourceTipVersion = sourceTipCommit
      ? await tx.version.findFirst({ where: { commitId: sourceTipCommit.id } })
      : null;
    if (sourceTipVersion) {
      const targetVersionCount = await tx.version.count({ where: { researchObjectId: pr.researchObjectId } });
      const manifest = await tx.versionManifest.findUnique({
        where: { versionId: sourceTipVersion.id },
        include: { entries: true },
      });
      const newVersion = await tx.version.create({
        data: { researchObjectId: pr.researchObjectId, commitId: sourceTipCommit!.id, versionNo: targetVersionCount + 1, status: 'draft' },
      });
      const entries = (manifest?.entries ?? []).map((e) => ({
        logicalPath: e.logicalPath,
        artifactId: e.artifactId,
        blobSha256: e.blobSha256,
      }));
      await tx.versionManifest.create({
        data: {
          versionId: newVersion.id,
          coreJson: (manifest?.coreJson ?? {}) as object,
          // entries.create 空数组 → Prisma 报错（真 PG 实证），空则省略（无 artifact 的 merge）
          ...(entries.length > 0 ? { entries: { create: entries } } : {}),
        },
      });
    }

    // 3. 作者合并（Q4：现有 + PR.newContributors 去重，顺序现有+新增）
    const changeInfo = await getAuthorChangeInfo(deps, { researchObjectId: pr.researchObjectId, userId: input.userId });
    const existingAuthors = changeInfo.authors.map((a) => a.userId);
    const prContributors = (pr.newContributors as Array<{ userId: string }>).map((c) => c.userId);
    const merged = [...existingAuthors];
    for (const uid of prContributors) {
      if (!merged.includes(uid)) merged.push(uid);
    }
    await tx.author.deleteMany({ where: { researchObjectId: pr.researchObjectId } });
    if (merged.length > 0) {
      await tx.author.createMany({
        data: merged.map((uid, i) => ({
          researchObjectId: pr.researchObjectId,
          userId: uid,
          sortOrder: i,
          isCorresponding: false,
        })),
      });
    }

    // 4. 许可应用（PR dataLicense/codeLicense → RO 级；text 不变）
    const sourceLicenses = await getEffectiveLicenses(deps, { researchObjectId: pr.researchObjectId, userId: input.userId });
    const textLicense = sourceLicenses.licenses?.text ?? 'CC-BY-4.0';
    const targetLicenses = { text: textLicense, code: pr.codeLicense as string, data: pr.dataLicense as string };
    for (const [type, licenseId] of Object.entries(targetLicenses)) {
      const existing = await tx.licenseAssignment.findFirst({
        where: { researchObjectId: pr.researchObjectId, versionId: null, licenseType: type },
      });
      if (existing) {
        await tx.licenseAssignment.update({ where: { id: existing.id }, data: { licenseId } });
      } else {
        await tx.licenseAssignment.create({
          data: { researchObjectId: pr.researchObjectId, versionId: null, licenseType: type, licenseId },
        });
      }
    }

    // 5. PR merged + 事件
    await tx.pullRequest.update({ where: { id: pr.id }, data: { status: 'merged' } });
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: 'pull_request.merged',
        payload: { prId: pr.id, researchObjectId: pr.researchObjectId },
      },
    });
    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'pull_request.merged', workspaceId: pr.researchObject.workspaceId,
      targetType: 'pull_request', targetId: pr.id,
      metadata: { researchObjectId: pr.researchObjectId, highRisk: highRisk.reasons },
    }, ctx);
  });

  return { prId: pr.id, status: 'merged', highRisk };
}

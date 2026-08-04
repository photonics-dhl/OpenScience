import type { AuditContext } from '@openscience/observability';
import { createHash } from 'node:crypto';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { notify } from '../notification/notifications';
import { getEffectiveLicenses } from '../license/licenses';
import { generatePublicId, versionPublicId } from '@openscience/identity';
import type { ArtifactDeps } from '../artifact/artifacts';
import { PublishError } from './errors';

export type VersionStatus = 'draft' | 'under_review' | 'approved' | 'published' | 'revised' | 'withdrawn' | 'rejected' | 'restricted';

/** §4.1 状态机合法迁移（含补充态）。终态不可前进。 */
const TRANSITIONS: Record<VersionStatus, VersionStatus[]> = {
  draft: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['approved', 'rejected'],
  approved: ['published', 'withdrawn'],
  published: ['revised', 'withdrawn', 'restricted'],
  revised: ['under_review', 'withdrawn'],
  withdrawn: [],
  rejected: [],
  restricted: [],
};

/** §6.2 平台免责声明（固定文案，不承诺专利/著作权/司法存证）。 */
export const LEGAL_DISCLAIMER =
  '此时间戳仅证明平台在相应时间接收并记录了该版本及其内容哈希，不构成专利优先权、著作权归属、科研正确性或司法存证保证。';

/**
 * 状态机推进（§4.1）：
 * - 合法迁移表校验；published/终态禁变更
 * - 审计
 */
export async function transitionVersionStatus(
  deps: ArtifactDeps,
  input: { versionId: string; userId: string; status: VersionStatus },
  ctx: AuditContext = {},
): Promise<{ id: string; status: string }> {
  const version = await deps.prisma.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true } });
  if (!version) throw new PublishError('NOT_FOUND', '版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);

  const from = version.status as VersionStatus;
  if (from === input.status) return { id: version.id, status: from }; // 幂等
  if (!(TRANSITIONS[from] ?? []).includes(input.status)) {
    throw new PublishError('ILLEGAL_TRANSITION', `版本状态 ${from} → ${input.status} 非法（§4.1）`);
  }
  const updated = await deps.prisma.version.update({ where: { id: version.id }, data: { status: input.status } });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'version.status', workspaceId: version.researchObject.workspaceId,
    targetType: 'version', targetId: version.id,
    metadata: { researchObjectId: version.researchObjectId, from, to: input.status },
  }, ctx);
  return { id: updated.id, status: updated.status };
}

/**
 * 发布事务（§2.1-6 + §4.1 + §6.1/§6.2 + §16 + §17）：
 * 1. 三重前置：AI 审核 passed（P1D-5）+ 许可齐全（P1C-4）+ R3 确认（P1D-4）
 * 2. 幂等：已 published → 返回既有
 * 3. 事务：assignPublicId + Version published + Publication（UTC 时间戳 + contentSha256 + §6.2 免责声明）+ 审计
 * 4. version.published 事件
 */
export async function publishVersion(
  deps: ArtifactDeps,
  input: { versionId: string; userId: string; r3Confirmed: boolean; publicIdPrefix: string },
  ctx: AuditContext = {},
): Promise<{
  versionId: string;
  publicId: string;
  publicVersionId: string;
  contentSha256: string;
  publishedAt: string;
  status: string;
}> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: true, manifest: { include: { entries: true } } },
  });
  if (!version) throw new PublishError('NOT_FOUND', '版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);

  // 幂等（§2.2-3 已公开不可原地修改）：已 published → 返回既有
  if (version.status === 'published') {
    const pub = await deps.prisma.publication.findFirst({ where: { versionId: version.id } });
    return {
      versionId: version.id,
      publicId: version.researchObject.publicId ?? '',
      publicVersionId: pub?.publicVersionId ?? '',
      contentSha256: pub?.contentSha256 ?? '',
      publishedAt: pub?.publishedAt.toISOString() ?? '',
      status: 'published',
    };
  }

  // 前置 1：AI 审核通过（P1D-5 §11.1）
  const aiReview = await deps.prisma.aiReview.findUnique({ where: { versionId: version.id } });
  if (!aiReview || aiReview.status !== 'passed') {
    throw new PublishError('REVIEW_NOT_PASSED', 'AI 发布审核未通过，禁止发布（§2.3-4）');
  }
  // 前置 2：许可已选（§6.3）
  const licenses = await getEffectiveLicenses(deps, { researchObjectId: version.researchObjectId, userId: input.userId, versionId: version.id });
  if (!licenses.licenses) {
    throw new PublishError('LICENSE_MISSING', '未选择三类许可，发布前必须选择（§6.3）');
  }
  // 前置 3：R3 审批确认（§9.4 发布属 R3）
  if (!input.r3Confirmed) {
    throw new PublishError('R3_CONFIRMATION_REQUIRED', '发布属 R3 高影响操作，需显式确认（§9.4）');
  }

  const result = await deps.prisma.$transaction(async (tx) => {
    // §6.1 unique ID（外层事务已开 → 内联分配）
    const year = version.researchObject.createdAt.getUTCFullYear();
    const { publicId, publicVersionId } = await assignPublicIdInternal(
      { prisma: tx as unknown as typeof deps.prisma }, version.researchObjectId, year, version.versionNo, input.publicIdPrefix,
    );

    // §6.2 UTC 事务时间 + 内容哈希（coreJson + entries 共同标识版本内容，§7.1 可重建）
    const entryPart = (version.manifest?.entries ?? [])
      .map((e) => `${e.logicalPath}:${e.blobSha256}`)
      .sort((a, b) => a.localeCompare(b))
      .join('\n');
    const corePart = JSON.stringify(version.manifest?.coreJson ?? {});
    const contentSha256 = createHash('sha256').update(`${corePart}\n${entryPart}`).digest('hex');
    const publishedAt = new Date();

    await tx.version.update({ where: { id: version.id }, data: { status: 'published', publicVersionId } });
    const pub = await tx.publication.create({
      data: {
        versionId: version.id,
        publicVersionId,
        contentSha256,
        publishedAt,
        legalDisclaimer: LEGAL_DISCLAIMER,
      },
    });
    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'publication.publish', workspaceId: version.researchObject.workspaceId,
      targetType: 'version', targetId: version.id,
      metadata: { researchObjectId: version.researchObjectId, publicId, publicVersionId, contentSha256 },
    }, ctx);
    return { publicId, publicVersionId, contentSha256, publishedAt, pub };
  });

  await notify(deps, {
    userId: input.userId,
    type: 'version.published',
    payload: { versionId: version.id, researchObjectId: version.researchObjectId, publicVersionId: result.publicVersionId },
  });

  return {
    versionId: version.id,
    publicId: result.publicId,
    publicVersionId: result.publicVersionId,
    contentSha256: result.contentSha256,
    publishedAt: result.publishedAt.toISOString(),
    status: 'published',
  };
}

/** §6.1 ID 分配内联（外层事务已开，避免嵌套事务）。 */
async function assignPublicIdInternal(
  deps: { prisma: ArtifactDeps['prisma'] },
  researchObjectId: string,
  year: number,
  versionNo: number,
  prefix: string,
): Promise<{ publicId: string; publicVersionId: string }> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: researchObjectId } });
  if (ro?.publicId) {
    return { publicId: ro.publicId, publicVersionId: versionPublicId(ro.publicId, versionNo) };
  }
  const seq = (await deps.prisma.identifier.count()) + 1;
  const publicId = generatePublicId(prefix, year, seq);
  const updated = await deps.prisma.researchObject.updateMany({ where: { id: researchObjectId, publicId: null }, data: { publicId } });
  if (updated.count === 0) throw new PublishError('VALIDATION_ERROR', '公开 ID 分配冲突（§6.1）');
  await deps.prisma.identifier.create({ data: { researchObjectId, publicId, issuedAt: new Date() } });
  return { publicId, publicVersionId: versionPublicId(publicId, versionNo) };
}

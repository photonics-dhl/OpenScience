import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { notify } from '../notification/notifications';
import { getEffectiveLicenses } from '../license/licenses';
import type { ArtifactDeps } from '../artifact/artifacts';
import { evaluateEvidencePublicationBlocks } from '../research-intelligence/publication-evidence';
import {
  loadPublicationNarrativeSnapshot,
  publicationNarrativeText,
  publicationSnapshotWarning,
} from '../research-intelligence/publication-snapshot';
import {
  checkCoreCompleteness, checkMaliciousArtifact, checkProhibitedContent, checkSensitiveContent,
  type HardBlock,
} from './blocking';

export interface PublicationReviewView {
  id: string;
  versionId: string;
  status: 'passed' | 'blocked';
  hardBlocks: HardBlock[];
  warnings: unknown[];
  verdict: string;
  createdAt: Date;
}

function mapBlock(e: unknown): HardBlock {
  const b = e as HardBlock;
  return { code: b.code, reason: b.reason };
}

/**
 * 发布审核硬阻断管线（§11.1 七类 + §15 AIReview + §16 事件）：
 * 1. requireMembership（§17 越权）+ version 存在
 * 2. 七类硬阻断：缺字段 / 恶意代码 / 隐私泄露 / 违法内容 / 权限无法确认 / 缺许可 / 哈希校验失败
 * 3. 任一命中 → AIReview(blocked) + 审计 + ai_review.completed 通知
 * 4. 全过 → AIReview(passed)
 * Safety Reviewer 类检查不替代申诉人工（§9.2，登记）。
 */
async function runPublicationReviewAttempt(
  deps: ArtifactDeps,
  input: { versionId: string; userId: string },
  ctx: AuditContext = {},
): Promise<PublicationReviewView> {
  const version = await deps.prisma.version.findUnique({
    where: { id: input.versionId },
    include: { researchObject: { include: { sdfDocument: true } }, manifest: { include: { entries: true } } },
  });
  if (!version) throw new Error('版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);
  const narrativeSnapshot = await loadPublicationNarrativeSnapshot(deps, {
    researchObjectId: version.researchObjectId,
    versionId: version.id,
  });

  const blocks: HardBlock[] = [];

  // 1. 必填字段缺失（§5.1 六字段）：以版本 manifest core 快照为准（§7.2.3）
  const core = (version.manifest?.coreJson ?? {}) as Record<string, unknown>;
  const missing = checkCoreCompleteness(core);
  if (missing) blocks.push(missing);

  // 2. 恶意代码/危险可执行（§11.1 + §17）
  for (const entry of version.manifest?.entries ?? []) {
    const artifact = await deps.prisma.artifact.findUnique({ where: { id: entry.artifactId } });
    const mal = checkMaliciousArtifact(entry.logicalPath, artifact?.mimeType ?? null);
    if (mal) blocks.push(mal);
  }

  // 3. 隐私泄露（§17 公开前敏感信息扫描 MUST）：扫 core + manifest 文本
  const coreText = Object.values(core).map((v) => String(v ?? '')).join('\n');
  const reviewedText = `${coreText}\n${publicationNarrativeText(narrativeSnapshot)}`;
  const sensitive = checkSensitiveContent(reviewedText);
  if (sensitive) blocks.push(sensitive);

  // 4. 明显违法/禁止内容（§11.1）
  const prohibited = checkProhibitedContent(reviewedText);
  if (prohibited) blocks.push(prohibited);

  // 5. 无法确认发布者权限（§17：membership 已过 + RO 创建者或作者）
  const isPublisher = version.researchObject.createdBy === input.userId;
  if (!isPublisher) {
    blocks.push({ code: 'publisher_authority', reason: '仅 RO 创建者或作者组可确认发布（§17）' });
  }

  // 6. 未选择许可证（§6.3 + P1C-4）
  const licenses = await getEffectiveLicenses(deps, { researchObjectId: version.researchObjectId, userId: input.userId, versionId: version.id });
  if (!licenses.licenses) {
    blocks.push({ code: 'license_missing', reason: '未选择三类许可（§6.3），发布前必须选择' });
  }

  // 7. 版本 manifest 缺失/校验失败（§7 存储模型 + §6.2）：core 快照必须存在（entries 空 = 纯文本版本合法）
  if (!version.manifest || typeof version.manifest.coreJson !== 'object') {
    blocks.push({ code: 'manifest_invalid', reason: '版本无 manifest 快照（§7），无法校验' });
  }

  // 8. Claim/Evidence 可定位性、冲突披露、展示资产与分发授权（Research Intelligence §5.3）。
  blocks.push(...await evaluateEvidencePublicationBlocks(deps, {
    researchObjectId: version.researchObjectId,
    versionId: version.id,
  }));

  const status: 'passed' | 'blocked' = blocks.length === 0 ? 'passed' : 'blocked';

  // §15 AIReview 记录（versionId 唯一，幂等 upsert）+ §16 事件 + 审计
  const warnings = [publicationSnapshotWarning(narrativeSnapshot.digest)];
  const review = await deps.prisma.$transaction(async (tx) => {
    const transactionDeps = { ...deps, prisma: tx as unknown as typeof deps.prisma };
    const currentVersion = await tx.version.findUnique({ where: { id: version.id } });
    if (!currentVersion || currentVersion.status !== version.status) {
      throw Object.assign(new Error('Version status changed during publication review'), { code: 'P2034' });
    }
    const currentSnapshot = await loadPublicationNarrativeSnapshot(transactionDeps, {
      researchObjectId: version.researchObjectId,
      versionId: version.id,
    });
    if (currentSnapshot.digest !== narrativeSnapshot.digest) {
      throw Object.assign(new Error('Claim/Evidence changed during publication review'), { code: 'P2034' });
    }
    // Shared Version-row write serializes review completion with content mutation
    // and status transition without holding the transaction across object I/O.
    const locked = await tx.version.updateMany({
      where: { id: version.id, status: version.status },
      data: { status: version.status },
    });
    if (locked.count !== 1) {
      throw Object.assign(new Error('Version status changed during publication review'), { code: 'P2034' });
    }
    const saved = await tx.aiReview.upsert({
      where: { versionId: version.id },
      create: {
        versionId: version.id,
        researchObjectId: version.researchObjectId,
        status,
        hardBlocks: blocks as never,
        warnings: warnings as never,
        verdict: status === 'passed' ? 'passed' : blocks.map((b) => b.reason).join('; '),
      },
      update: {
        status,
        hardBlocks: blocks as never,
        warnings: warnings as never,
        verdict: status === 'passed' ? 'passed' : blocks.map((b) => b.reason).join('; '),
        createdAt: new Date(),
      },
    });
    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'publication.review', workspaceId: version.researchObject.workspaceId,
      targetType: 'version', targetId: version.id,
      metadata: {
        researchObjectId: version.researchObjectId, status, blockCount: blocks.length,
        blockCodes: blocks.map((block) => block.code), narrativeDigest: narrativeSnapshot.digest,
      },
    }, ctx);
    return saved;
  }, { isolationLevel: 'Serializable' });
  await notify(deps, {
    userId: input.userId,
    type: 'ai_review.completed',
    payload: { versionId: version.id, researchObjectId: version.researchObjectId, status, blockCount: blocks.length },
  });
  return {
    id: review.id, versionId: review.versionId, status,
    hardBlocks: blocks.map(mapBlock), warnings, verdict: review.verdict, createdAt: review.createdAt,
  };
}

export async function runPublicationReview(
  deps: ArtifactDeps,
  input: { versionId: string; userId: string },
  ctx: AuditContext = {},
): Promise<PublicationReviewView> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await runPublicationReviewAttempt(deps, input, ctx);
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}

/** 查既有审核记录（§11.3 稳定可引用；申诉/公开页用）。 */
export async function getPublicationReview(
  deps: ArtifactDeps,
  input: { versionId: string; userId: string },
): Promise<PublicationReviewView | null> {
  const version = await deps.prisma.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true } });
  if (!version) throw new Error('版本不存在');
  await requireMembership(deps, version.researchObject.workspaceId, input.userId);

  const review = await deps.prisma.aiReview.findUnique({ where: { versionId: input.versionId } });
  if (!review) return null;
  return {
    id: review.id, versionId: review.versionId, status: review.status as 'passed' | 'blocked',
    hardBlocks: (review.hardBlocks ?? []) as unknown as HardBlock[],
    warnings: (review.warnings ?? []) as unknown[],
    verdict: review.verdict, createdAt: review.createdAt,
  };
}

/** P1D-6：保存警告报告（§11.2 + §15 AIReview.warnings）；不阻断（status 独立）。 */
export async function saveWarnings(
  deps: { prisma: ArtifactDeps['prisma'] },
  input: { versionId: string; warnings: unknown[] },
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await deps.prisma.$transaction(async (tx) => {
        const review = await tx.aiReview.findUnique({ where: { versionId: input.versionId } });
        if (!review) throw new Error('发布硬审核尚未完成');
        const existing = Array.isArray(review.warnings) ? review.warnings : [];
        const markers = existing.filter((warning) => warning && typeof warning === 'object' && !Array.isArray(warning)
          && (warning as Record<string, unknown>).code === 'claim_evidence_snapshot');
        await tx.aiReview.update({
          where: { versionId: input.versionId },
          data: { warnings: [...markers, ...input.warnings] as never },
        });
      }, { isolationLevel: 'Serializable' });
      return;
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}

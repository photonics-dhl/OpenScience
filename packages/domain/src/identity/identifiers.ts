import { createHash } from 'node:crypto';
import { generatePublicId, versionPublicId } from '@openscience/identity';
import type { ArtifactDeps } from '../artifact/artifacts';
import { requireMembership } from '../workspace/helpers';
import { CommitError } from '../commit/errors';

export interface AssignPublicIdResult {
  publicId: string;
  publicVersionId: string;
}

/**
 * 发布时分配公开 ID（§6.1 + §2.2.5）：
 * - RO 已有 publicId → 复用（公开 ID 永不复用 §6.1 MUST）
 * - 无 → 生成 OSR-YYYY-NNNNNN（年 = RO 创建年，seq = 全局递增）+ 写 Identifier 行（只追加）
 * - versionNo → publicVersionId = OSR-YYYY-NNNNNN-vN
 * 前缀由调用方传（PUBLIC_ID_PREFIX env，§24 配置项）。
 */
export async function assignPublicId(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionNo: number; prefix: string },
): Promise<AssignPublicIdResult> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);

  // ID 永不复用（§6.1）：已有 publicId 复用
  if (ro.publicId) {
    return { publicId: ro.publicId, publicVersionId: versionPublicId(ro.publicId, input.versionNo) };
  }

  const year = ro.createdAt.getUTCFullYear();
  const seq = (await countIdentifiers(deps)) + 1;
  const publicId = generatePublicId(input.prefix, year, seq);

  const result = await deps.prisma.$transaction(async (tx) => {
    // 并发安全：updateMany where publicId=null 保证只分配一次
    const updated = await tx.researchObject.updateMany({
      where: { id: ro.id, publicId: null },
      data: { publicId },
    });
    if (updated.count === 0) {
      const latest = await tx.researchObject.findUnique({ where: { id: ro.id } });
      if (latest?.publicId) return { publicId: latest.publicId, fresh: false };
      throw new CommitError('CONCURRENT_UPDATE', '并发分配公开 ID 冲突');
    }
    await tx.identifier.create({
      data: { researchObjectId: ro.id, publicId, issuedAt: new Date() },
    });
    return { publicId, fresh: true };
  });

  return { publicId: result.publicId, publicVersionId: versionPublicId(result.publicId, input.versionNo) };
}

/** §6.2 版本内容哈希：Manifest entries 按 logicalPath 排序后逐个 blobSha256 拼接 → SHA-256。 */
export function computeContentSha256(entries: Array<{ logicalPath: string; blobSha256: string }>): string {
  const sorted = [...entries].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
  const concat = sorted.map((e) => `${e.logicalPath}:${e.blobSha256}`).join('\n');
  return createHash('sha256').update(concat).digest('hex');
}

async function countIdentifiers(deps: ArtifactDeps): Promise<number> {
  return deps.prisma.identifier.count();
}

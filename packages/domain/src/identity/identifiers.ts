import { createHash } from 'node:crypto';

import type { ArtifactDeps } from '../artifact/artifacts';
import { requireMembership } from '../workspace/helpers';
import { CommitError } from '../commit/errors';

export interface AssignPublicIdResult {
  publicId: string;
  publicVersionId: string;
}

/** Compatibility lookup. Issuing identities belongs exclusively to publishVersion. */
export async function assignPublicId(
  deps: ArtifactDeps,
  input: { userId: string; researchObjectId: string; versionNo: number; prefix: string },
): Promise<AssignPublicIdResult> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro || ro.deletedAt) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  await requireMembership(deps, ro.workspaceId, input.userId);
  const version = await deps.prisma.version.findFirst({ where: { researchObjectId: ro.id, versionNo: input.versionNo, publications: { some: {} } }, include: { publications: true } });
  const publication = version?.publications[0];
  if (!ro.publicId || !publication) throw new CommitError('VALIDATION_ERROR', '公开编号仅在成功发布时分配');
  return { publicId: ro.publicId, publicVersionId: publication.publicVersionId };
}
/** §6.2 版本内容哈希：Manifest entries 按 logicalPath 排序后逐个 blobSha256 拼接 → SHA-256。 */
export function computeContentSha256(entries: Array<{ logicalPath: string; blobSha256: string }>): string {
  const sorted = [...entries].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
  const concat = sorted.map((e) => `${e.logicalPath}:${e.blobSha256}`).join('\n');
  return createHash('sha256').update(concat).digest('hex');
}

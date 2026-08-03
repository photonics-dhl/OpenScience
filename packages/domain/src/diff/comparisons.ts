import { computeDiff, type DiffResult } from '@openscience/diff';
import type { ArtifactDeps } from '../artifact/artifacts';
import { requireMembership } from '../workspace/helpers';
import { CommitError } from '../commit/errors';

/**
 * 对比两个版本（§7.3 九类确定性 diff）：
 * 1. 两版本都必须存在且属于同一 RO
 * 2. 调用者是该 RO workspace 成员（§17 越权防护）
 * 3. 读两 Manifest（core + entries）+ Blob 表 size → computeDiff
 * 不读对象存储内容（§7.2.6 元数据 diff），性能安全。
 */
export async function compareVersions(
  deps: ArtifactDeps,
  input: { userId: string; fromVersionId: string; toVersionId: string },
): Promise<DiffResult> {
  const from = await deps.prisma.version.findUnique({ where: { id: input.fromVersionId } });
  if (!from) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '版本不存在');
  const to = await deps.prisma.version.findUnique({ where: { id: input.toVersionId } });
  if (!to) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '版本不存在');
  if (from.researchObjectId !== to.researchObjectId) {
    throw new CommitError('VALIDATION_ERROR', '两个版本不属于同一研究对象');
  }
  const fromWorkspaceId = await loadWorkspace(deps, from.researchObjectId);
  await requireMembership(deps, fromWorkspaceId, input.userId);

  const fromManifest = await loadManifest(deps, from.id);
  const toManifest = await loadManifest(deps, to.id);
  const fromSizes = await loadBlobSizes(deps, fromManifest.entries.map((e) => e.blobSha256));
  const toSizes = await loadBlobSizes(deps, toManifest.entries.map((e) => e.blobSha256));

  return computeDiff({
    versionFrom: from.id,
    versionTo: to.id,
    beforeCore: fromManifest.core,
    afterCore: toManifest.core,
    beforeFiles: fromManifest.entries,
    afterFiles: toManifest.entries,
    beforeSizes: fromSizes,
    afterSizes: toSizes,
  });
}

async function loadWorkspace(deps: ArtifactDeps, researchObjectId: string): Promise<string> {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: researchObjectId } });
  if (!ro) throw new CommitError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
  return ro.workspaceId;
}

interface ManifestShape {
  core: Record<string, unknown>;
  entries: Array<{ logicalPath: string; artifactId: string; blobSha256: string }>;
}

async function loadManifest(deps: ArtifactDeps, versionId: string): Promise<ManifestShape> {
  const manifest = await deps.prisma.versionManifest.findUnique({
    where: { versionId },
    include: { entries: true },
  });
  if (!manifest) return { core: {}, entries: [] };
  return {
    core: manifest.coreJson as Record<string, unknown>,
    entries: manifest.entries.map((e) => ({ logicalPath: e.logicalPath, artifactId: e.artifactId, blobSha256: e.blobSha256 })),
  };
}

async function loadBlobSizes(deps: ArtifactDeps, sha256s: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const sha of new Set(sha256s)) {
    const blob = await deps.prisma.blob.findUnique({ where: { sha256: sha } });
    if (blob) map.set(sha, Number(blob.size));
  }
  return map;
}

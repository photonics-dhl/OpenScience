import type { WorkspaceDeps } from '../workspace/types';
import { ArtifactError } from './errors';

type PublicationScope = { publicId: string; versionNo: number; researchObjectId: string; versionId: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const notFound = () => new ArtifactError('ARTIFACT_NOT_FOUND', 'Published attachment not found');

export function publicArtifactDownloadUrl(publicId: string, versionNo: number, artifactId: string): string {
  return `/api/research/${encodeURIComponent(publicId)}/v/${versionNo}/artifacts/${encodeURIComponent(artifactId)}/download`;
}

/** Missing/legacy permissions stay private. No live manifest can grant public access. */
export function readPublicArtifactManifest(researchRecord: unknown, scope: PublicationScope) {
  const dto = record(record(researchRecord).dto);
  if (dto.objectId !== scope.researchObjectId || dto.versionId !== scope.versionId) return [];
  const entries = Array.isArray(dto.manifest) ? dto.manifest.map(record) : [];
  return entries.flatMap(entry => {
    if (typeof entry.logicalPath !== 'string' || typeof entry.artifactId !== 'string'
      || typeof entry.blobSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.blobSha256)) return [];
    const url = publicArtifactDownloadUrl(scope.publicId, scope.versionNo, entry.artifactId);
    const allowed = entry.downloadAccess === 'public' && entry.downloadUrl === url
      && entries.filter(candidate => candidate.artifactId === entry.artifactId).length === 1;
    return [{ logicalPath: entry.logicalPath, artifactId: entry.artifactId, blobSha256: entry.blobSha256,
      mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : null,
      downloadAccess: allowed ? 'public' as const : 'workspace_member' as const,
      ...(allowed ? { downloadUrl: url } : {}),
    }];
  });
}

/** Only this public-version route may use the frozen public grant; private download auth is unchanged. */
export async function getPublicArtifactDownload(deps: Pick<WorkspaceDeps, 'prisma'>, input: { publicId: string; versionNo: number; artifactId: string }) {
  const ro = await deps.prisma.researchObject.findUnique({ where: { publicId: input.publicId }, select: { id: true, workspaceId: true, visibility: true } });
  if (!ro || ro.visibility !== 'public') throw notFound();
  const publicVersionId = `${input.publicId}-v${input.versionNo}`;
  const version = await deps.prisma.version.findFirst({ where: {
    researchObjectId: ro.id, publicationNo: input.versionNo, publicVersionId,
    status: { in: ['published', 'revised'] }, publications: { some: { publicVersionId } },
  }, select: { id: true, researchRecord: true } });
  if (!version) throw notFound();
  const entry = readPublicArtifactManifest(version.researchRecord, { ...input, researchObjectId: ro.id, versionId: version.id })
    .find(item => item.artifactId === input.artifactId && item.downloadAccess === 'public');
  if (!entry) throw notFound();
  const artifact = await deps.prisma.artifact.findFirst({ where: {
    id: input.artifactId, workspaceId: ro.workspaceId, blobSha256: entry.blobSha256, deletedAt: null, bytesPurgedAt: null,
  }, select: { size: true } });
  if (!artifact) throw notFound();
  // A stored path is a display label, never a header or a filesystem path.
  const basename = entry.logicalPath.split(/[/\\]/u).pop() ?? '';
  const filename = Array.from(basename).slice(0, 180).join('')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"|?*]/gu, '_')
    .replace(/[\ud800-\udfff]/gu, '_').replace(/^[. ]+|[. ]+$/gu, '') || 'attachment';
  const fallback = filename.replace(/[^\x20-\x7e]/gu, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const mimeType = entry.mimeType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(entry.mimeType) ? entry.mimeType : 'application/octet-stream';
  return { blobSha256: entry.blobSha256, size: Number(artifact.size), mimeType, contentDisposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}` };
}

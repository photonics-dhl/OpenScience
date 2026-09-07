import type { ArtifactDeps } from '../artifact/artifacts';
import { CommitError } from './errors';
import { recordValue } from './research-record-snapshot';
import { resolveEvidenceSource } from '../research-intelligence/claim-evidence-service';
import { getBlobStorageKey } from '@openscience/storage';

export class ResearchRecordSourceError extends Error {
  readonly code = 'SOURCE_UNAVAILABLE';
}
const notFound = () => new CommitError('RESEARCH_OBJECT_NOT_FOUND', 'Research record not found');

/** Authorization remains live; the returned representation remains frozen. */
export async function getResearchRecord(deps: ArtifactDeps, input: { researchObjectId: string; versionId: string; userId?: string }) {
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
  if (!ro) throw notFound();
  const member = input.userId ? await deps.prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId: ro.workspaceId, userId: input.userId } } }) : null;
  const grant = !member && input.userId && ro.visibility === 'invite_only'
    ? await deps.prisma.visibilityGrant.findUnique({ where: { researchObjectId_granteeId: { researchObjectId: ro.id, granteeId: input.userId } } }) : null;
  const authorized = Boolean(member || grant);
  let versionId = input.versionId;
  if (versionId === 'latest') {
    const versions = await deps.prisma.version.findMany({ where: { researchObjectId: ro.id }, orderBy: { versionNo: 'desc' } });
    const published = ro.visibility === 'public' ? await deps.prisma.publication.findMany({ where: { version: { researchObjectId: ro.id } } }) : [];
    versionId = versions.filter(v => ro.visibility === 'public' ? v.status === 'published' && published.some(p => p.versionId === v.id) : authorized)
      .sort((a,b) => b.versionNo-a.versionNo)[0]?.id ?? '';
  }
  if (!versionId) throw notFound();
  const version = await deps.prisma.version.findUnique({ where: { id: versionId }, include: { manifest: { include: { entries: true } } } });
  if (!version || version.researchObjectId !== ro.id) throw notFound();
  const publication = ro.visibility === 'public' && version.status === 'published'
    ? await deps.prisma.publication.findFirst({ where: { versionId: version.id } }) : null;
  if (!authorized && !publication) throw notFound();
  const frozen = recordValue(version.researchRecord);
  const base = `/api/research-objects/${ro.id}/versions/${version.id}/record`;
  const dto = frozen.dto ?? {
    schemaVersion: '1.0.0', objectId: ro.id, versionId: version.id, versionNo: version.versionNo, recordState: 'not_recorded',
    citation: { uri: `urn:openscience:${ro.id}:version:${version.id}`, url: base, title: null, createdAt: version.createdAt.toISOString() },
    identity: { originalAuthors: { state: 'not_recorded', items: [] }, originalDoi: { state: 'not_recorded', value: null }, platformAuthors: [], licenses: [] },
    sdf: recordValue(version.manifest?.coreJson),
    claims: [], evidence: [], manifest: (version.manifest?.entries ?? []).map(e => ({logicalPath: e.logicalPath, artifactId: e.artifactId, blobSha256: e.blobSha256, downloadUrl: `/api/artifacts/${e.artifactId}/download`, downloadAccess: 'workspace_member'})).sort((a,b) => a.logicalPath < b.logicalPath ? -1 : a.logicalPath > b.logicalPath ? 1 : 0),
    missing: { sdfFields: ['problem','insight','method','results','limitations','reproducibility'].filter(key => !recordValue(version.manifest?.coreJson)[key]), claims: 'not_recorded', evidence: 'not_recorded', materials: version.manifest?.entries.length ? 'recorded' : 'not_recorded' },
    collections: { complete: true, pagination: 'none', order: 'claims/evidence:id; manifest:logicalPath; authors:sortOrder; licenses:type,identifier' },
    links: { self: base, export: `${base}/export`, schema: '/api/research-record/schema', openapi: '/api/research-record/openapi' },
  };
  return { record: dto, sources: recordValue(frozen.sources), publicAccess: Boolean(publication), versionId: version.id };
}

export async function getResearchRecordSource(deps: ArtifactDeps, input: { researchObjectId: string; versionId: string; evidenceId: string; userId?: string }) {
  const access = await getResearchRecord(deps, input);
  const source = recordValue(access.sources[input.evidenceId]);
  if (!source.artifactId) throw notFound();
  if (!source.sourceMapRef || (access.publicAccess && source.publicReuse !== true)) throw new ResearchRecordSourceError('Frozen source is unavailable');
  try {
    const artifact = await deps.prisma.artifact.findUnique({ where: { id: source.artifactId as string } });
    if (!artifact) throw new Error('Original missing');
    const original = await deps.storage.headObject(getBlobStorageKey(artifact.blobSha256));
    if (!original || original.size !== Number(artifact.size)) throw new Error('Original unavailable');
    const resolved = await resolveEvidenceSource(deps, { researchObjectId: input.researchObjectId, versionId: access.versionId,
      artifactId: source.artifactId as string, locator: source.locator as never, exactQuote: typeof source.exactQuote === 'string' ? source.exactQuote : undefined, sourceMapRef: source.sourceMapRef });
    // Never return resolver's private SourceMap reference.
    return { text: resolved.text ?? null, region: resolved.region ?? null, page: recordValue(source.locator).page ?? null };
  } catch { throw new ResearchRecordSourceError('Frozen source is unavailable'); }
}

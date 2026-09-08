import type { Prisma } from '@prisma/client';
import { SDF_NODE_TYPES } from '../research-object/types';
import { SOURCE_IDENTITY_FIELDS, parseSourceIdentitySnapshot, type SourceIdentitySnapshot } from '../ingestion/source-identity';

export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function sourceIdentityMatchesManifest(
  sourceIdentity: SourceIdentitySnapshot,
  entries: Map<string, { blobSha256: string }>,
): boolean {
  return SOURCE_IDENTITY_FIELDS.every(field => sourceIdentity[field].evidenceSegments.every(segment => (
    entries.get(segment.sourceLocator.artifactId)?.blobSha256 === segment.sourceLocator.contentHash
  )));
}

/** Internal transaction-only snapshot writer. GET never calls this function. */
export async function freezeResearchRecord(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; versionId: string; sourceIdentity?: SourceIdentitySnapshot | null; sourceIdentityFromVersionId?: string;
}) {
  const version = await tx.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true, manifest: { include: { entries: true } } } });
  if (!version || version.researchObjectId !== input.researchObjectId || version.researchRecord != null) throw new Error('Research record cannot be frozen');
  const where = { researchObjectId: version.researchObjectId, versionId: version.id };
  const [claims, evidence, authors, licenses] = await Promise.all([
    tx.claimNode.findMany({ where, orderBy: { id: 'asc' } }),
    tx.evidenceRecord.findMany({ where, orderBy: { id: 'asc' } }),
    tx.author.findMany({ where: { researchObjectId: version.researchObjectId }, include: { user: true }, orderBy: { sortOrder: 'asc' } }),
    tx.licenseAssignment.findMany({ where: { researchObjectId: version.researchObjectId } }),
  ]);
  const manifest = (version.manifest?.entries ?? []).map(e => ({ logicalPath: e.logicalPath, artifactId: e.artifactId, blobSha256: e.blobSha256, downloadUrl: `/api/artifacts/${e.artifactId}/download`, downloadAccess: 'workspace_member' })).sort((a,b) => compare(a.logicalPath,b.logicalPath));
  const entries = new Map(manifest.map(e => [e.artifactId, e]));
  const core = recordValue(version.manifest?.coreJson);
  const sdf = core;
  let sourceIdentity = input.sourceIdentity ?? undefined;
  if (input.sourceIdentity === undefined) {
    const commit = input.sourceIdentityFromVersionId ? null : await tx.commit.findUnique({ where: { id: version.commitId } });
    const sourceVersion = input.sourceIdentityFromVersionId
      ? await tx.version.findUnique({ where: { id: input.sourceIdentityFromVersionId } })
      : commit?.parentCommitId ? await tx.version.findFirst({ where: { commitId: commit.parentCommitId } }) : null;
    if (sourceVersion && sourceVersion.researchObjectId === version.researchObjectId) {
      const parentRecord = recordValue(sourceVersion.researchRecord);
      const parentDto = recordValue(parentRecord.dto);
      sourceIdentity = parseSourceIdentitySnapshot(recordValue(parentDto.identity).source);
    }
  }
  if (sourceIdentity && !sourceIdentityMatchesManifest(sourceIdentity, entries)) {
    if (input.sourceIdentity) throw new Error('Source identity does not match the frozen manifest');
    sourceIdentity = undefined;
  }
  const base = `/api/research-objects/${version.researchObjectId}/versions/${version.id}/record`;
  const sources: Record<string, unknown> = {};
  const frozenEvidence = evidence.sort((a,b) => compare(a.id,b.id)).map(e => {
    const locator = recordValue(e.locator);
    const provenance = recordValue(e.provenance);
    const rights = recordValue(provenance.rights);
    const available = entries.get(e.artifactId)?.blobSha256 === e.contentHash;
    sources[e.id] = { artifactId: e.artifactId, locator: e.locator, exactQuote: e.exactQuote, sourceMapRef: provenance.sourceMapRef ?? null,
      publicReuse: e.kind !== 'external_source' || (rights.decision === 'reuse' && rights.authority === 'trusted_provider' && typeof rights.verifiedBy === 'string' && rights.verifiedBy.length > 0) };
    return { id: e.id, claimId: e.claimId, artifactId: e.artifactId, kind: e.kind, title: e.title, relation: e.relation, contentHash: e.contentHash,
      extractionConfidence: e.extractionConfidence ?? null, extractionStatus: e.extractionStatus, verified: Boolean(e.verifiedByUserId),
      locator: Object.fromEntries(['page','blockId','boundingBox','charRange','tableCell','codeRange'].filter(key => locator[key] !== undefined).map(key => [key,locator[key]])),
      source: { state: available && provenance.sourceMapRef ? 'recorded' : 'not_recorded', url: `${base}/evidence/${e.id}/source` } };
  });
  const dto = {
    schemaVersion: sourceIdentity ? '1.1.0' : '1.0.0', objectId: version.researchObjectId, versionId: version.id, versionNo: version.versionNo,
    recordState: 'recorded', citation: { uri: `urn:openscience:${version.researchObjectId}:version:${version.id}`, url: base,
      title: version.researchObject.title, createdAt: version.createdAt.toISOString() },
    identity: { originalAuthors: { state: 'not_recorded', items: [] }, originalDoi: { state: 'not_recorded', value: null },
      platformAuthors: authors.sort((a,b) => a.sortOrder-b.sortOrder || compare(a.id,b.id)).map(a => ({ name: a.user?.displayName ?? null, affiliation: a.affiliation ?? null, isCorresponding: a.isCorresponding ?? false })),
      licenses: licenses.filter(l => l.versionId === null || l.versionId === version.id).map(l => ({ type: l.licenseType, identifier: l.licenseId })).sort((a,b) => compare(a.type,b.type) || compare(a.identifier,b.identifier)),
      ...(sourceIdentity ? { source: sourceIdentity } : {}) },
    sdf, claims: claims.sort((a,b) => compare(a.id,b.id)).map(c => ({ id: c.id, parentClaimId: c.parentClaimId ?? null, kind: c.kind, statement: c.statement,
      assessment: c.assessment, conditions: c.conditions, limitations: c.limitations,
      extractionStatus: c.extractionStatus })), evidence: frozenEvidence, manifest,
    missing: { sdfFields: SDF_NODE_TYPES.filter(field => typeof sdf[field] !== 'string' || !(sdf[field] as string).trim()), claims: claims.length ? 'recorded' : 'not_recorded',
      evidence: evidence.length ? 'recorded' : 'not_recorded', materials: manifest.length ? 'recorded' : 'not_recorded' },
    collections: { complete: true, pagination: 'none', order: 'claims/evidence:id; manifest:logicalPath; authors:sortOrder; licenses:type,identifier' },
    links: { self: base, export: `${base}/export`, schema: '/api/research-record/schema', openapi: '/api/research-record/openapi' },
  };
  await tx.version.update({ where: { id: version.id }, data: { researchRecord: JSON.parse(JSON.stringify({ dto, sources })) as Prisma.InputJsonValue } });
}

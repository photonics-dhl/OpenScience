import type { Prisma } from '@prisma/client';
import { SDF_NODE_TYPES } from '../research-object/types';

export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Internal transaction-only snapshot writer. GET never calls this function. */
export async function freezeResearchRecord(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; versionId: string; graphVersionId?: string;
}) {
  const version = await tx.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true, manifest: { include: { entries: true } } } });
  if (!version || version.researchObjectId !== input.researchObjectId || version.researchRecord != null) throw new Error('Research record cannot be frozen');
  // Lock the predecessor graph using the same Version row fence as graph mutations.
  if (input.graphVersionId && input.graphVersionId !== version.id) {
    const previous = await tx.version.findUnique({ where: { id: input.graphVersionId } });
    if (!previous || previous.researchObjectId !== version.researchObjectId) throw new Error('Research graph scope mismatch');
    await tx.version.update({ where: { id: previous.id }, data: { status: previous.status } });
  }
  const where = { researchObjectId: version.researchObjectId, versionId: input.graphVersionId ?? version.id };
  const [claims, evidence, authors, licenses] = await Promise.all([
    tx.claimNode.findMany({ where, orderBy: { id: 'asc' } }),
    tx.evidenceRecord.findMany({ where, orderBy: { id: 'asc' } }),
    tx.author.findMany({ where: { researchObjectId: version.researchObjectId }, include: { user: true }, orderBy: { sortOrder: 'asc' } }),
    tx.licenseAssignment.findMany({ where: { researchObjectId: version.researchObjectId } }),
  ]);
  const inherited = Boolean(input.graphVersionId && input.graphVersionId !== version.id);
  const manifest = (version.manifest?.entries ?? []).map(e => ({ logicalPath: e.logicalPath, artifactId: e.artifactId, blobSha256: e.blobSha256, downloadUrl: `/api/artifacts/${e.artifactId}/download`, downloadAccess: 'workspace_member' })).sort((a,b) => compare(a.logicalPath,b.logicalPath));
  const entries = new Map(manifest.map(e => [e.artifactId, e]));
  const core = recordValue(version.manifest?.coreJson);
  const sdf = core;
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
      extractionConfidence: e.extractionConfidence ?? null, extractionStatus: inherited ? 'needs_review' : e.extractionStatus, verified: !inherited && Boolean(e.verifiedByUserId),
      locator: Object.fromEntries(['page','blockId','boundingBox','charRange','tableCell','codeRange'].filter(key => locator[key] !== undefined).map(key => [key,locator[key]])),
      source: { state: available && provenance.sourceMapRef ? 'recorded' : 'not_recorded', url: `${base}/evidence/${e.id}/source` } };
  });
  const dto = {
    schemaVersion: '1.0.0', objectId: version.researchObjectId, versionId: version.id, versionNo: version.versionNo,
    recordState: 'recorded', citation: { uri: `urn:openscience:${version.researchObjectId}:version:${version.id}`, url: base,
      title: version.researchObject.title, createdAt: version.createdAt.toISOString() },
    identity: { originalAuthors: { state: 'not_recorded', items: [] }, originalDoi: { state: 'not_recorded', value: null },
      platformAuthors: authors.sort((a,b) => a.sortOrder-b.sortOrder || compare(a.id,b.id)).map(a => ({ name: a.user?.displayName ?? null, affiliation: a.affiliation ?? null, isCorresponding: a.isCorresponding ?? false })),
      licenses: licenses.filter(l => l.versionId === null || l.versionId === version.id).map(l => ({ type: l.licenseType, identifier: l.licenseId })).sort((a,b) => compare(a.type,b.type) || compare(a.identifier,b.identifier)) },
    sdf, claims: claims.sort((a,b) => compare(a.id,b.id)).map(c => ({ id: c.id, parentClaimId: c.parentClaimId ?? null, kind: c.kind, statement: c.statement,
      assessment: inherited && c.assessment === 'supported' ? 'missing' : c.assessment, conditions: c.conditions, limitations: c.limitations,
      extractionStatus: inherited ? 'needs_review' : c.extractionStatus })), evidence: frozenEvidence, manifest,
    missing: { sdfFields: SDF_NODE_TYPES.filter(field => typeof sdf[field] !== 'string' || !(sdf[field] as string).trim()), claims: claims.length ? 'recorded' : 'not_recorded',
      evidence: evidence.length ? 'recorded' : 'not_recorded', materials: manifest.length ? 'recorded' : 'not_recorded' },
    collections: { complete: true, pagination: 'none', order: 'claims/evidence:id; manifest:logicalPath; authors:sortOrder; licenses:type,identifier' },
    links: { self: base, export: `${base}/export`, schema: '/api/research-record/schema', openapi: '/api/research-record/openapi' },
  };
  await tx.version.update({ where: { id: version.id }, data: { researchRecord: JSON.parse(JSON.stringify({ dto, sources })) as Prisma.InputJsonValue } });
}

import type { Prisma, PresentationAsset } from '@prisma/client';
import { SDF_NODE_TYPES } from '../research-object/types';
import type { PublicationMetadata } from '../publish/publication-metadata';
import { publicArtifactDownloadUrl } from '../artifact/public-artifact-download';
import { PublishError } from '../publish/errors';
import { PresentationAssetError } from '../assets/errors';
import { presentationSceneImageView, requireSceneImageParent } from '../assets/scene-image';
import type { FrozenHistoryMedia } from './version-history';
import { loadEvidencePublicationVerification } from '../research-intelligence/evidence-publication-verification';

export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Internal transaction-only snapshot writer. GET never calls this function. */
export async function freezeResearchRecord(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; versionId: string;
}) {
  return writeResearchRecord(tx, input, false);
}

/** Called only by a successful, current-tip mutation in its existing transaction. */
export async function refreshWorkingResearchRecord(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; versionId: string;
}) {
  return writeResearchRecord(tx, input, false, true);
}

/** Final public snapshot, called only inside the publication transaction. */
export async function finalizePublicationResearchRecord(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; versionId: string;
  publicId: string; publicVersionId: string; publicationNo: number; publishedAt: Date; allowArtifactDownloads?: boolean; presentationAssetIds?: string[];
}) {
  return writeResearchRecord(tx, input, input);
}

/** Freeze reader text only from the exact approved scene that produced the selected image. */
async function mediaReaders(tx: Prisma.TransactionClient,
  media: Array<PresentationAsset & { sourceClaims: Array<{ claimId: string }> }>, selectedIds?: string[],
): Promise<Map<string, NonNullable<FrozenHistoryMedia['reader']>>> {
  const byId = new Map(media.map(asset => [asset.id, asset]));
  const selected = (selectedIds === undefined ? media
    : selectedIds.flatMap(id => { const asset = byId.get(id); return asset ? [asset] : []; }))
    .filter(asset => asset.status === 'approved'
      && asset.generator !== 'OpenScience paper-original figure'
      && asset.generator !== 'OpenScience Hermes storyboard planner'
      && !['paper_original_figure', 'storyboard', 'sourced_storyboard'].includes(String(recordValue(asset.provenance).subtype)));
  const scenes = new Map<string, { storyboardAssetId: string; sceneIndex: number; title: string; narration: string }>();
  for (const asset of selected) {
    const sceneImage = presentationSceneImageView(asset);
    if (!sceneImage) continue;
    let parent;
    try {
      parent = await requireSceneImageParent(tx, {
        researchObjectId: asset.researchObjectId, versionId: asset.versionId,
        sourceClaimIds: asset.sourceClaims.map(link => link.claimId).sort(), sceneImage,
      });
    } catch (error) {
      // Legacy or unresolved provenance keeps the generic caption; never invent reader text.
      if (error instanceof PresentationAssetError) continue;
      throw error;
    }
    if (!parent || parent.identity !== recordValue(asset.provenance).parentIdentity) continue;
    const scene = parent.view.document.scenes[sceneImage.sceneIndex]!;
    scenes.set(asset.id, { storyboardAssetId: sceneImage.storyboardAssetId, sceneIndex: sceneImage.sceneIndex,
      title: scene.title, narration: scene.narration });
  }
  // Preserve submitted group order, and the approved scenes' narrative order within each group.
  // Reused originals and generated scenes use the same ordering rule.
  const groupOrder = new Map<string, number>();
  const ordered = selected.map((asset, index) => {
    const scene = scenes.get(asset.id);
    const group = scene ? `storyboard:${scene.storyboardAssetId}` : `asset:${asset.id}`;
    if (!groupOrder.has(group)) groupOrder.set(group, index);
    return { id: asset.id, index, group, scene };
  }).sort((left, right) => groupOrder.get(left.group)! - groupOrder.get(right.group)!
    || (left.scene?.sceneIndex ?? 0) - (right.scene?.sceneIndex ?? 0) || left.index - right.index);
  return new Map(ordered.map((asset, order) => [asset.id, {
    order, ...(asset.scene ? { title: asset.scene.title, narration: asset.scene.narration } : {}),
  }]));
}

async function writeResearchRecord(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; versionId: string;
}, publication: false | { publicId: string; publicVersionId: string; publicationNo: number; publishedAt: Date; allowArtifactDownloads?: boolean; presentationAssetIds?: string[] }, refresh = false) {
  const version = await tx.version.findUnique({ where: { id: input.versionId }, include: { researchObject: true, manifest: { include: { entries: true } } } });
  if (!version || version.researchObjectId !== input.researchObjectId
    || (publication ? version.status !== 'approved' : refresh ? version.status !== 'draft' || version.publicVersionId !== null : version.researchRecord != null)) throw new Error('Research record cannot be frozen');
  const where = { researchObjectId: version.researchObjectId, versionId: version.id };
  const [claims, evidence, authors, licenses, contributions, media] = await Promise.all([
    tx.claimNode.findMany({ where, orderBy: { id: 'asc' } }),
    tx.evidenceRecord.findMany({ where, orderBy: { id: 'asc' } }),
    tx.author.findMany({ where: { researchObjectId: version.researchObjectId }, include: { user: true }, orderBy: { sortOrder: 'asc' } }),
    tx.licenseAssignment.findMany({ where: { researchObjectId: version.researchObjectId } }),
    tx.contribution.findMany({ where: { researchObjectId: version.researchObjectId }, include: { user: { select: { displayName: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    tx.presentationAsset.findMany({ where: { ...where, deletedAt: null }, include: { sourceClaims: { select: { claimId: true } } }, orderBy: { id: 'asc' } }),
  ]);
  const licenseTypes = ['text', 'code', 'data'];
  const versionLicenses = licenses.filter(l => l.versionId === version.id);
  const effectiveLicenses = licenseTypes.every(type => versionLicenses.some(l => l.licenseType === type))
    ? versionLicenses : licenses.filter(l => l.versionId === null);
  if (publication && !licenseTypes.every(type => effectiveLicenses.some(l => l.licenseType === type))) throw new Error('Publication licenses are incomplete');
  if (publication && publication.allowArtifactDownloads && effectiveLicenses.some(l => l.licenseType === 'data' && l.licenseId === 'NO-DOWNLOAD')) {
    throw new PublishError('VALIDATION_ERROR', '允许公开下载附件与数据许可 NO-DOWNLOAD 冲突，请先调整许可或关闭附件下载');
  }
  const artifactMetadata = await tx.artifact.findMany({ where: { id: { in: (version.manifest?.entries ?? []).map(e => e.artifactId) }, workspaceId: version.researchObject.workspaceId }, select: { id: true, mimeType: true } });
  const manifest = (version.manifest?.entries ?? []).map(e => ({ logicalPath: e.logicalPath, artifactId: e.artifactId, blobSha256: e.blobSha256,
    mimeType: artifactMetadata.find(artifact => artifact.id === e.artifactId)?.mimeType ?? null,
    downloadUrl: publication && publication.allowArtifactDownloads ? publicArtifactDownloadUrl(publication.publicId, publication.publicationNo, e.artifactId) : `/api/artifacts/${e.artifactId}/download`,
    downloadAccess: publication && publication.allowArtifactDownloads ? 'public' : 'workspace_member',
  })).sort((a,b) => compare(a.logicalPath,b.logicalPath));
  const entries = new Map(manifest.map(e => [e.artifactId, e]));
  const core = recordValue(version.manifest?.coreJson);
  const sdf = core;
  const verification = await loadEvidencePublicationVerification(tx, {
    ...input, workspaceId: version.researchObject.workspaceId,
  }, evidence);
  if (publication && evidence.some(item => (verification.get(item.id) ?? 'none') === 'none')) {
    throw new PublishError('REVIEW_NOT_PASSED', 'Evidence verification changed before publication');
  }
  const base = `/api/research-objects/${version.researchObjectId}/versions/${version.id}/record`;
  const sources: Record<string, unknown> = { claims: Object.fromEntries(claims.map(c => [c.id, { provenance: c.provenance }])) };
  const frozenEvidence = evidence.sort((a,b) => compare(a.id,b.id)).map(e => {
    const locator = recordValue(e.locator);
    const provenance = recordValue(e.provenance);
    const rights = recordValue(provenance.rights);
    const available = entries.get(e.artifactId)?.blobSha256 === e.contentHash;
    sources[e.id] = { artifactId: e.artifactId, locator: e.locator, exactQuote: e.exactQuote, sourceMapRef: provenance.sourceMapRef ?? null,
      provenance: e.provenance, verifiedByUserId: e.verifiedByUserId,
      publicReuse: e.kind !== 'external_source' || (rights.decision === 'reuse' && rights.authority === 'trusted_provider' && typeof rights.verifiedBy === 'string' && rights.verifiedBy.length > 0) };
    return { id: e.id, claimId: e.claimId, artifactId: e.artifactId, kind: e.kind, title: e.title, relation: e.relation, contentHash: e.contentHash,
      // Verified includes exact system scientific review, without claiming human confirmation.
      extractionConfidence: e.extractionConfidence ?? null, extractionStatus: e.extractionStatus, verified: (verification.get(e.id) ?? 'none') !== 'none',
      locator: Object.fromEntries(['page','blockId','boundingBox','charRange','tableCell','codeRange'].filter(key => locator[key] !== undefined).map(key => [key,locator[key]])),
      source: { state: available && provenance.sourceMapRef ? 'recorded' : 'not_recorded', url: `${base}/evidence/${e.id}/source` } };
  });
  const dto = {
    schemaVersion: '1.0.0', objectId: version.researchObjectId, versionId: version.id, versionNo: version.versionNo,
    recordState: 'recorded', citation: { uri: `urn:openscience:${version.researchObjectId}:version:${version.id}`, url: base,
      title: version.researchObject.title, createdAt: version.createdAt.toISOString() },
    identity: { originalAuthors: { state: 'not_recorded', items: [] }, originalDoi: { state: 'not_recorded', value: null },
      platformAuthors: authors.sort((a,b) => a.sortOrder-b.sortOrder || compare(a.id,b.id)).map(a => ({ name: a.user?.displayName ?? null, affiliation: a.affiliation ?? null, isCorresponding: a.isCorresponding ?? false })),
      licenses: licenseTypes.flatMap(type => {
        const license = effectiveLicenses.find(l => l.licenseType === type);
        return license ? [{ type, identifier: license.licenseId }] : [];
      }) },
    sdf, claims: claims.sort((a,b) => compare(a.id,b.id)).map(c => ({ id: c.id, parentClaimId: c.parentClaimId ?? null, kind: c.kind, statement: c.statement,
      assessment: c.assessment, conditions: c.conditions, limitations: c.limitations,
      extractionStatus: c.extractionStatus })), evidence: frozenEvidence, manifest,
    missing: { sdfFields: SDF_NODE_TYPES.filter(field => typeof sdf[field] !== 'string' || !(sdf[field] as string).trim()), claims: claims.length ? 'recorded' : 'not_recorded',
      evidence: evidence.length ? 'recorded' : 'not_recorded', materials: manifest.length ? 'recorded' : 'not_recorded' },
    collections: { complete: true, pagination: 'none', order: 'claims/evidence:id; manifest:logicalPath; authors:sortOrder; licenses:type,identifier' },
    links: { self: base, export: `${base}/export`, schema: '/api/research-record/schema', openapi: '/api/research-record/openapi' },
  };
  const publicationMetadata: PublicationMetadata | undefined = publication ? {
    schemaVersion: 1,
    captureSource: 'publication',
    capturedAt: publication.publishedAt.toISOString(),
    title: version.researchObject.title,
    authors: authors.map(a => ({ displayName: a.user.displayName, identityStatus: a.user.status, isCorresponding: a.isCorresponding, affiliation: a.affiliation, sortOrder: a.sortOrder })),
    contributions: contributions.map(c => ({ displayName: c.user.displayName, creditRole: c.creditRole })),
    licenses: Object.fromEntries(effectiveLicenses.map(l => [l.licenseType, l.licenseId])),
    citation: {
      publicId: publication.publicId, publicVersionId: publication.publicVersionId, publicationNo: publication.publicationNo,
      year: version.researchObject.createdAt.getUTCFullYear(), publishedAt: publication.publishedAt.toISOString(),
      text: `${authors.map(a => a.user.displayName).join(', ')}. ${version.researchObject.title}. ${publication.publicVersionId}. ${version.researchObject.createdAt.getUTCFullYear()}.`,
    },
  } : undefined;
  const capturedAt = new Date().toISOString();
  const selectedAssetIds = publication && publication.presentationAssetIds !== undefined ? new Set(publication.presentationAssetIds) : undefined;
  const readers = await mediaReaders(tx, media, publication ? publication.presentationAssetIds : undefined);
  const historyMedia = { captureSource: 'working_draft', capturedAt, items: media.map(asset => ({
    id: asset.id, researchObjectId: asset.researchObjectId, versionId: asset.versionId, kind: asset.kind,
    objectKey: asset.objectKey, contentHash: asset.contentHash, generator: asset.generator, generatorVersion: asset.generatorVersion,
    promptHash: asset.promptHash, status: asset.status, label: asset.label, provenance: asset.provenance,
    sourceClaimIds: asset.sourceClaims.map(link => link.claimId).sort(),
    ...(readers?.has(asset.id) ? { reader: readers.get(asset.id) } : {}),
    // Keep every history entry and its source references, while freezing the
    // publication choice. Existing public snapshots keep their original identities.
    ...(publication && (asset.generator === 'OpenScience paper-original figure'
      || recordValue(asset.provenance).subtype === 'paper_original_figure'
      || (selectedAssetIds && !selectedAssetIds.has(asset.id))) ? { publicationIncluded: false } : {}),
  })) };
  await tx.version.update({ where: { id: version.id }, data: { researchRecord: JSON.parse(JSON.stringify({ dto, sources, historyMedia,
    historyCapture: { state: publication ? 'sealed' : 'working', graphSource: 'working_draft', capturedAt },
    ...(publicationMetadata ? { publicationMetadata } : {}) })) as Prisma.InputJsonValue } });
  return publicationMetadata;
}

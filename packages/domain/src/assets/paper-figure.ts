/**
 * Register an uploaded Artifact as a paper-original figure for this draft.
 * A human must check it against the source paper before reuse; its Claim link
 * supplies context, not proof of origin. Storage remains owned by Artifact/Blob.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuditSink } from '@openscience/observability';
import { getBlobStorageKey, ObjectNotFoundError, type StorageAdapter } from '@openscience/storage';
import { PresentationAssetError } from './errors';
import { PRESENTATION_ASSET_LABEL } from '../research-intelligence/types';
import { requirePresentationWriteScope, withPresentationAssetWrite } from './presentation-asset';

const PAPER_ORIGINAL_GENERATOR = 'OpenScience paper-original figure';
const MAX_PAPER_FIGURE_BYTES = 32 * 1024 * 1024;
const MAX_PAPER_FIGURE_EDGE = 16_384;
const MAX_PAPER_FIGURE_PIXELS = 64_000_000;

/** Bounded integrity/header check, without decoding pixels in the API process. */
async function requireStoredPaperFigure(storage: StorageAdapter, objectKey: string, size: number, contentHash: string): Promise<void> {
  const invalid = () => new PresentationAssetError('VALIDATION_ERROR', 'The artifact must contain an available PNG with matching size and content hash');
  const stored = await storage.getObject(objectKey).catch((error: unknown) => {
    if (error instanceof ObjectNotFoundError) throw invalid();
    throw error;
  });
  const digest = createHash('sha256');
  let received = 0;
  let header = Buffer.alloc(0);
  let tail = Buffer.alloc(0);
  try {
    if (stored.size !== size) throw invalid();
    for await (const chunk of stored.body) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += part.length;
      if (received > size || received > MAX_PAPER_FIGURE_BYTES) throw invalid();
      if (header.length < 33) header = Buffer.concat([header, part.subarray(0, 33 - header.length)]);
      tail = part.length >= 12 ? Buffer.from(part.subarray(-12)) : Buffer.concat([tail, part]).subarray(-12);
      digest.update(part);
    }
  } finally { stored.body.destroy(); }
  if (received !== size || digest.digest('hex') !== contentHash || header.length !== 33
    || !header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    || header.readUInt32BE(8) !== 13 || header.toString('ascii', 12, 16) !== 'IHDR'
    || !header.readUInt32BE(16) || !header.readUInt32BE(20)
    || header[26] !== 0 || header[27] !== 0 || header[28] > 1
    || !tail.equals(Buffer.from('0000000049454e44ae426082', 'hex'))) throw invalid();
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width > MAX_PAPER_FIGURE_EDGE || height > MAX_PAPER_FIGURE_EDGE || width * height > MAX_PAPER_FIGURE_PIXELS) {
    throw new PresentationAssetError('VALIDATION_ERROR', 'PNG dimensions must be at most 16,384 pixels per edge and 64 megapixels; upload a smaller original');
  }
  // This checks stored bytes and headers, not pixel decoding or paper provenance;
  // those remain part of downstream media processing and human source review.
}

export interface RegisterPaperFigureInput {
  researchObjectId: string;
  versionId: string;
  figureId: string;
  sourceClaimId: string;
  artifactId: string;
  caption?: string;
}
export interface RegisterPaperFigureResult { assetId: string; contentHash: string; objectKey: string }

export async function registerPaperFigure(
  deps: { prisma: PrismaClient; storage: StorageAdapter; audit?: AuditSink; userId: string },
  input: RegisterPaperFigureInput,
): Promise<RegisterPaperFigureResult> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.researchObjectId)) throw new PresentationAssetError('VALIDATION_ERROR', 'researchObjectId is required');
  if (!uuid.test(input.versionId)) throw new PresentationAssetError('VALIDATION_ERROR', 'versionId is required');
  if (!input.figureId?.trim() || input.figureId.length > 200) throw new PresentationAssetError('VALIDATION_ERROR', 'figureId is required and must be <= 200 characters');
  if (!uuid.test(input.sourceClaimId)) throw new PresentationAssetError('VALIDATION_ERROR', 'sourceClaimId is required');
  if (!uuid.test(input.artifactId)) throw new PresentationAssetError('VALIDATION_ERROR', 'artifactId is required');
  if (input.caption !== undefined && (typeof input.caption !== 'string' || input.caption.length > 200)) throw new PresentationAssetError('VALIDATION_ERROR', 'caption must be <= 200 characters');
  if (!deps.storage) throw new Error('Paper figure storage is unavailable');
  input = { ...input, researchObjectId: input.researchObjectId.toLowerCase(), versionId: input.versionId.toLowerCase(), sourceClaimId: input.sourceClaimId.toLowerCase(), artifactId: input.artifactId.toLowerCase() };
  const scope = { userId: deps.userId, researchObjectId: input.researchObjectId, versionId: input.versionId };

  async function readArtifact(db: Pick<Prisma.TransactionClient, 'artifact'>, workspaceId: string) {
    const artifact = await db.artifact.findUnique({ where: { id: input.artifactId }, include: { blob: true } });
    if (!artifact || artifact.deletedAt || artifact.bytesPurgedAt || artifact.workspaceId !== workspaceId) {
      throw new PresentationAssetError('NOT_FOUND', 'PNG artifact is not available in this workspace');
    }
    // getArtifact shares reads with workspace members. The surrounding write
    // scope already requires membership and a content-writing role here, so a
    // collaborator may register a shared upload without impersonating its uploader.
    if (artifact.mimeType !== 'image/png' || artifact.size < 45n || artifact.size > BigInt(MAX_PAPER_FIGURE_BYTES)
      || !artifact.blob || artifact.blob.size !== artifact.size || artifact.blob.sha256 !== artifact.blobSha256
      || !/^[a-f0-9]{64}$/u.test(artifact.blobSha256) || artifact.blob.storageKey !== getBlobStorageKey(artifact.blobSha256)) {
      throw new PresentationAssetError('VALIDATION_ERROR', 'artifactId must reference a PNG upload of at most 32 MiB with a valid Blob');
    }
    return artifact;
  }

  // Storage I/O happens before taking the global reference lock. A live Artifact
  // protects its Blob; the write transaction rechecks its complete metadata.
  const initialVersion = await requirePresentationWriteScope(deps.prisma, scope);
  const snapshot = structuredClone(await readArtifact(deps.prisma, initialVersion.researchObject.workspaceId));
  const contentHash = snapshot.blobSha256;
  const objectKey = snapshot.blob.storageKey;
  const legacyKey = `presentation/${input.researchObjectId}/${input.versionId}/${contentHash}.png`;
  await requireStoredPaperFigure(deps.storage, objectKey, Number(snapshot.size), contentHash);
  const legacy = await deps.prisma.presentationAsset.findFirst({ where: {
    researchObjectId: input.researchObjectId, versionId: input.versionId, kind: 'image', deletedAt: null,
    status: { in: ['draft', 'approved'] }, objectKey: legacyKey, contentHash,
    AND: [{ provenance: { path: ['subtype'], equals: 'paper_original_figure' } }, { provenance: { path: ['figureId'], equals: input.figureId } }],
  }, select: { id: true } });
  if (legacy) await requireStoredPaperFigure(deps.storage, legacyKey, Number(snapshot.size), contentHash);

  return withPresentationAssetWrite(deps.prisma, scope, async (tx, version) => {
    const artifact = await readArtifact(tx, version.researchObject.workspaceId);
    if (!isDeepStrictEqual(artifact, snapshot)) throw new PresentationAssetError('CONCURRENT_UPDATE', 'PNG artifact changed during registration; reload it before retrying');
    const claim = await tx.claimNode.findUnique({ where: { id: input.sourceClaimId }, select: { researchObjectId: true, versionId: true, extractionStatus: true } });
    if (!claim || claim.researchObjectId !== input.researchObjectId || claim.versionId !== input.versionId || claim.extractionStatus !== 'succeeded') {
      throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'sourceClaimId must reference a successfully extracted Claim in this version');
    }
    const candidates = await tx.presentationAsset.findMany({
      where: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: 'image',
        AND: [{ provenance: { path: ['subtype'], equals: 'paper_original_figure' } }, { provenance: { path: ['figureId'], equals: input.figureId } }] },
      include: { sourceClaims: { select: { claimId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (candidates.some((asset) => {
      const original = asset.provenance as Record<string, unknown>;
      return asset.status === 'rejected' && asset.contentHash === contentHash
        && typeof original.sourceClaimId === 'string' && original.sourceClaimId.toLowerCase() === input.sourceClaimId
        && (typeof original.caption === 'string' ? original.caption.trim() : '') === (input.caption?.trim() ?? '');
    })) {
      throw new PresentationAssetError('CONCURRENT_UPDATE', 'This upload matches a rejected original; correct the image, source Claim or caption before resubmitting');
    }
    const registered = candidates.filter((asset) => !asset.deletedAt && ['draft', 'approved'].includes(asset.status));
    if (registered.some((asset) => {
      const original = asset.provenance as Record<string, unknown>;
      return asset.contentHash !== contentHash || ![objectKey, legacyKey].includes(asset.objectKey)
        || typeof original.sourceClaimId !== 'string' || original.sourceClaimId.toLowerCase() !== input.sourceClaimId
        || (typeof original.caption === 'string' ? original.caption.trim() : '') !== (input.caption?.trim() ?? '')
        || asset.sourceClaims.length !== 1 || asset.sourceClaims[0].claimId !== input.sourceClaimId;
    })) throw new PresentationAssetError('CONCURRENT_UPDATE', 'This figureId has an active original with different content or metadata; review or reject it before submitting a correction');

    const replay = registered[0];
    if (replay) {
      if (replay.objectKey !== objectKey && !legacy) throw new PresentationAssetError('CONCURRENT_UPDATE', 'A legacy original appeared during registration; retry to verify its stored bytes');
      return { assetId: replay.id, contentHash, objectKey: replay.objectKey };
    }
    // The Artifact already owns durable bytes. This transaction only adds a
    // reference under the same lock used by object cleanup; it never writes storage.
    await tx.trashObjectCleanup.updateMany({ where: { objectKey }, data: { state: 'retained', lastError: null } });
    const created = await tx.presentationAsset.create({ data: {
      researchObjectId: input.researchObjectId, versionId: input.versionId, kind: 'image', status: 'draft', objectKey, contentHash,
      generator: PAPER_ORIGINAL_GENERATOR, generatorVersion: contentHash.slice(0, 12), promptHash: null, label: PRESENTATION_ASSET_LABEL,
      provenance: { subtype: 'paper_original_figure', source: 'user_upload', sourceClaimRole: 'context_only', reviewRequirement: 'verify_against_source_paper',
        artifactId: artifact.id, uploadedBy: artifact.uploadedBy, figureId: input.figureId, researchObjectId: input.researchObjectId, versionId: input.versionId,
        sourceClaimId: input.sourceClaimId, ...(input.caption ? { caption: input.caption } : {}) } as Prisma.InputJsonValue,
    } });
    await tx.presentationAssetClaim.create({ data: {
      presentationAssetId: created.id, claimId: input.sourceClaimId, researchObjectId: input.researchObjectId, versionId: input.versionId,
    } });
    await deps.audit?.record({ actorId: deps.userId, action: 'presentation_asset.paper_original_register', workspaceId: version.researchObject.workspaceId,
      targetType: 'presentation_asset', targetId: created.id, metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, artifactId: artifact.id, figureId: input.figureId, sourceClaimId: input.sourceClaimId, contentHash } }, tx);
    return { assetId: created.id, contentHash, objectKey };
  });
}

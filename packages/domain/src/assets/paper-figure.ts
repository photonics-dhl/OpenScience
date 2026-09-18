/**
 * Paper-original figure registration.
 *
 * A paper-original figure is an image asset a user uploads from the source paper
 * to be reused verbatim in the presentation (figurePlan.reuse). It lives
 * scoped to a single (researchObjectId, versionId, figureId), has the
 * `paper_original_figure` subtype, and is auto-approved (it is user-provided
 * evidence, not a generation artefact).
 */
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PresentationAssetError } from './errors';
import type { StorageAdapter } from '@openscience/storage';
import { PRESENTATION_ASSET_LABEL } from '../research-intelligence/types';

const PAPER_ORIGINAL_GENERATOR = 'OpenScience paper-original figure';

export interface RegisterPaperFigureInput {
  researchObjectId: string;
  versionId: string;
  figureId: string;
  sourceClaimId: string;
  imageBytes: Buffer;
  contentType?: string;
  caption?: string;
}
export interface RegisterPaperFigureResult { assetId: string; contentHash: string; objectKey: string }

export async function registerPaperFigure(
  deps: {
    prisma: Pick<PrismaClient, 'presentationAsset' | 'claimNode' | 'presentationAssetClaim' | 'trashObjectCleanup' | 'researchObject' | '$transaction'>;
    storage?: StorageAdapter;
    userId: string;
  },
  input: RegisterPaperFigureInput,
): Promise<RegisterPaperFigureResult> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.researchObjectId)) throw new PresentationAssetError('VALIDATION_ERROR', 'researchObjectId is required');
  if (!uuid.test(input.versionId)) throw new PresentationAssetError('VALIDATION_ERROR', 'versionId is required');
  if (!input.figureId || input.figureId.length > 200) throw new PresentationAssetError('VALIDATION_ERROR', 'figureId is required and must be <= 200 characters');
  if (!uuid.test(input.sourceClaimId)) throw new PresentationAssetError('VALIDATION_ERROR', 'sourceClaimId is required');
  if (!Buffer.isBuffer(input.imageBytes) || input.imageBytes.length === 0) throw new PresentationAssetError('VALIDATION_ERROR', 'imageBytes must be a non-empty buffer');
  if (input.imageBytes.length > 32 * 1024 * 1024) throw new PresentationAssetError('VALIDATION_ERROR', 'imageBytes exceeds 32 MiB');

  const contentType = input.contentType ?? 'image/png';
  if (contentType !== 'image/png') throw new PresentationAssetError('VALIDATION_ERROR', 'paper-original only supports image/png');

  const researchObject = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId }, select: { id: true, deletedAt: true } });
  if (!researchObject || researchObject.deletedAt) throw new PresentationAssetError('NOT_FOUND', 'Research object not found');
  const versionRow = await (deps.prisma as unknown as PrismaClient).version.findUnique({ where: { id: input.versionId }, select: { id: true, researchObjectId: true, status: true } });
  if (!versionRow || versionRow.researchObjectId !== input.researchObjectId) throw new PresentationAssetError('NOT_FOUND', 'Version not found for this research object');
  if (versionRow.status !== 'draft') throw new PresentationAssetError('ILLEGAL_TRANSITION', 'Paper-original figures may only be registered on a draft version');

  const claimRow = await deps.prisma.claimNode.findUnique({ where: { id: input.sourceClaimId }, select: { id: true, researchObjectId: true, versionId: true, extractionStatus: true } });
  if (!claimRow || claimRow.researchObjectId !== input.researchObjectId || claimRow.versionId !== input.versionId || claimRow.extractionStatus !== 'succeeded') {
    throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'sourceClaimId must reference a verified Claim in this version');
  }

  const contentHash = createHash('sha256').update(input.imageBytes).digest('hex');
  const objectKey = `presentation/${input.researchObjectId}/${input.versionId}/${contentHash}.png`;

  const provenance = {
    subtype: 'paper_original_figure',
    figureId: input.figureId,
    researchObjectId: input.researchObjectId,
    versionId: input.versionId,
    sourceClaimId: input.sourceClaimId,
    ...(input.caption ? { caption: input.caption } : {}),
  };

  const result = await (deps.prisma as PrismaClient).$transaction(async (tx) => {
    await tx.trashObjectCleanup.updateMany({ where: { objectKey }, data: { state: 'retained', lastError: null } });
    const created = await tx.presentationAsset.create({
      data: {
        researchObjectId: input.researchObjectId,
        versionId: input.versionId,
        kind: 'image',
        status: 'approved',
        objectKey,
        contentHash,
        generator: PAPER_ORIGINAL_GENERATOR,
        generatorVersion: contentHash.slice(0, 12),
        promptHash: null,
        label: PRESENTATION_ASSET_LABEL,
        provenance: provenance as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.presentationAssetClaim.create({ data: {
      presentationAssetId: created.id, claimId: input.sourceClaimId, researchObjectId: input.researchObjectId, versionId: input.versionId,
    } });
    return { assetId: created.id, contentHash, objectKey };
  });

  if (deps.storage) await deps.storage.putObject(objectKey, input.imageBytes, { contentType: 'image/png', sha256: contentHash });

  return result;
}

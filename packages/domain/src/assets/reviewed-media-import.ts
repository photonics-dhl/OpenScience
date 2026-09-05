import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuditSink } from '@openscience/observability';
import type { StorageAdapter } from '@openscience/storage';
import { scanFile } from '../artifact/scan';
import { PRESENTATION_ASSET_LABEL } from '../research-intelligence/types';
import { parsePresentationGenerationPayload, requirePresentationWriteScope, withPresentationAssetWrite } from './presentation-asset';
import { PresentationAssetError } from './errors';

export interface ReviewedMediaImportInput {
  userId: string; researchObjectId: string; versionId: string; kind: 'image' | 'video';
  sourceClaimIds: string[]; generator: string; generatorVersion: string; importRun: string;
  sourcePaperUrl: string; content: Buffer;
}
type Deps = { prisma: PrismaClient; storage: StorageAdapter; audit?: AuditSink };
type Db = Pick<Prisma.TransactionClient, 'user' | 'claimNode' | 'presentationAsset'>;
const invalid = () => new PresentationAssetError('VALIDATION_ERROR', 'Reviewed media input is invalid');

/** Imports already reviewed media; does not invoke a generator or fabricate an AgentTask. */
export async function importReviewedPresentationMedia(deps: Deps, input: ReviewedMediaImportInput, options: { dryRun?: boolean } = {}) {
  const payload = parsePresentationGenerationPayload({ schemaVersion: 1, researchObjectId: input.researchObjectId, versionId: input.versionId, kind: input.kind, sourceClaimIds: input.sourceClaimIds });
  if (!['image', 'video'].includes(input.kind) || ![input.userId, input.generator, input.generatorVersion, input.importRun].every((v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 256)
    || !Buffer.isBuffer(input.content) || input.content.length < 32 || input.content.length > 10 * 1024 * 1024) throw invalid();
  let paperUrl: URL;
  try { paperUrl = new URL(input.sourcePaperUrl); } catch { throw invalid(); }
  if (paperUrl.protocol !== 'https:' || paperUrl.username || paperUrl.password || input.sourcePaperUrl.length > 2048) throw invalid();
  // Own the bytes across asynchronous validation and storage operations.
  const content = Buffer.from(input.content);
  const png = content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const mp4 = content.toString('ascii', 4, 8) === 'ftyp' && content.readUInt32BE(0) >= 16 && content.readUInt32BE(0) <= content.length
    && /^(isom|iso2|mp41|mp42|avc1|M4V )$/.test(content.toString('ascii', 8, 12));
  if ((input.kind === 'image' ? !png : !mp4) || !(await scanFile(content)).safe) throw invalid();
  await requirePresentationWriteScope(deps.prisma, input);
  async function requireAdmin(db: Db) {
    if ((await db.user.findUnique({ where: { id: input.userId }, select: { platformRole: true } }))?.platformRole !== 'platform_admin') throw new PresentationAssetError('ADMIN_REQUIRED', 'Reviewed media import requires a platform administrator');
  }
  async function claims(db: Db) {
    const rows = await db.claimNode.findMany({ where: { id: { in: payload.sourceClaimIds }, researchObjectId: input.researchObjectId, versionId: input.versionId } });
    if (rows.length !== payload.sourceClaimIds.length || rows.some((row) => row.extractionStatus !== 'succeeded') || payload.sourceClaimIds.some((id) => !rows.some((row) => row.id === id))) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Source Claims must be succeeded in the exact version');
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  }
  await requireAdmin(deps.prisma);
  const snapshot = structuredClone(await claims(deps.prisma));
  const contentHash = createHash('sha256').update(content).digest('hex');
  const contentType = input.kind === 'image' ? 'image/png' : 'video/mp4';
  const objectKey = `presentation/${input.researchObjectId}/${input.versionId}/${contentHash}.${input.kind === 'image' ? 'png' : 'mp4'}`;
  const provenance = { source: 'admin_reviewed_import', reviewedBy: input.userId, importRun: input.importRun, sourceClaimIds: payload.sourceClaimIds, sourcePaperUrl: input.sourcePaperUrl, contentType };
  async function existing(db: Db) {
    const rows = await db.presentationAsset.findMany({ where: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: input.kind, contentHash }, include: { sourceClaims: { select: { claimId: true } } } });
    const matching = rows.filter((row) => row.kind === input.kind && row.contentHash === contentHash);
    if (matching.length > 1 || matching.some((row) => row.generator !== input.generator || row.generatorVersion !== input.generatorVersion || row.label !== PRESENTATION_ASSET_LABEL || row.objectKey !== objectKey || !isDeepStrictEqual(row.provenance, provenance) || !isDeepStrictEqual(row.sourceClaims.map((c) => c.claimId).sort(), payload.sourceClaimIds))) throw new PresentationAssetError('CONCURRENT_UPDATE', 'Existing media metadata conflicts with this import');
    return matching[0] ?? null;
  }
  const prior = await existing(deps.prisma);
  if (options.dryRun) return { dryRun: true, assetId: prior?.id ?? null, contentHash, status: prior?.status ?? 'draft' };
  if (!prior) await deps.storage.putObject(objectKey, content, { contentType, sha256: contentHash });
  return withPresentationAssetWrite(deps.prisma, input, async (tx, version) => {
    await requireAdmin(tx);
    if (!isDeepStrictEqual(await claims(tx), snapshot)) throw new PresentationAssetError('SOURCE_CLAIM_INVALID', 'Source Claims changed during import');
    const replay = await existing(tx);
    if (replay) return { dryRun: false, assetId: replay.id, contentHash, status: replay.status };
    const asset = await tx.presentationAsset.create({ data: { researchObjectId: input.researchObjectId, versionId: input.versionId, kind: input.kind, contentHash, objectKey, generator: input.generator, generatorVersion: input.generatorVersion, status: 'draft', label: PRESENTATION_ASSET_LABEL, provenance } });
    await tx.presentationAssetClaim.createMany({ data: payload.sourceClaimIds.map((claimId) => ({ presentationAssetId: asset.id, claimId, researchObjectId: input.researchObjectId, versionId: input.versionId })) });
    await deps.audit?.record({ actorId: input.userId, action: 'presentation_asset.reviewed_import', workspaceId: version.researchObject.workspaceId, targetType: 'presentation_asset', targetId: asset.id, metadata: { researchObjectId: input.researchObjectId, versionId: input.versionId, importRun: input.importRun, contentHash, kind: input.kind } }, tx);
    return { dryRun: false, assetId: asset.id, contentHash, status: asset.status };
  });
}


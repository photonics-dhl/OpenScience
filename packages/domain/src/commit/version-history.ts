import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PresentationAsset } from '@prisma/client';
import { recordValue, refreshWorkingResearchRecord } from './research-record-snapshot';

export type FrozenHistoryMedia = Pick<PresentationAsset, 'id' | 'researchObjectId' | 'versionId' | 'kind' | 'objectKey' | 'contentHash' | 'generator' | 'generatorVersion' | 'promptHash' | 'status' | 'label' | 'provenance'> & { sourceClaimIds: string[] };
export function historyMediaItems(researchRecord: unknown): FrozenHistoryMedia[] {
  const items = recordValue(recordValue(researchRecord).historyMedia).items;
  return Array.isArray(items) ? items as FrozenHistoryMedia[] : [];
}
export function publicHistoryMedia(researchRecord: unknown): FrozenHistoryMedia[] {
  return historyMediaItems(researchRecord).filter(asset => asset.status === 'approved'
    && !['storyboard', 'sourced_storyboard'].includes(String(recordValue(asset.provenance).subtype))
    && asset.generator !== 'OpenScience Hermes storyboard planner');
}
export function frozenClaims(researchRecord: unknown): Array<Record<string, unknown>> {
  const claims = recordValue(recordValue(researchRecord).dto).claims;
  return Array.isArray(claims) ? claims.map(recordValue) : [];
}
export function sameScientificClaim(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return ['kind', 'statement', 'assessment', 'conditions', 'limitations', 'extractionStatus'].every(key => isDeepStrictEqual(left[key], right[key]));
}

/** An explicit version selects its own branch; older tips never reopen for mutation. */
export async function isWorkingDraftVersion(db: Pick<Prisma.TransactionClient, 'version'>, versionId: string): Promise<boolean> {
  const version = await db.version.findUnique({ where: { id: versionId }, include: { commit: { select: { branchId: true } } } });
  if (!version || version.status !== 'draft' || version.publicVersionId || recordValue(recordValue(version.researchRecord).historyCapture).state === 'sealed') return false;
  const tip = await db.version.findFirst({ where: { researchObjectId: version.researchObjectId, commit: { branchId: version.commit.branchId } }, orderBy: { versionNo: 'desc' }, select: { id: true } });
  return tip?.id === version.id;
}

/** Seal the existing record before a new tip is created. Never replace legacy frozen science with live rows. */
export async function sealVersionHistory(tx: Prisma.TransactionClient, input: { researchObjectId: string; versionId: string }): Promise<void> {
  let version = await tx.version.findFirst({ where: { id: input.versionId, researchObjectId: input.researchObjectId }, include: { manifest: true } });
  if (!version) throw new Error('Historical version not found');
  let record = recordValue(version.researchRecord);
  if (recordValue(record.historyCapture).state === 'sealed') return;
  if (recordValue(record.historyCapture).state === 'working' && version.status === 'draft') {
    await refreshWorkingResearchRecord(tx, input);
    version = await tx.version.findFirstOrThrow({ where: { id: version.id }, include: { manifest: true } });
    record = recordValue(version.researchRecord);
  }
  const capturedAt = new Date().toISOString();
  if (!record.historyMedia) {
    const claims = frozenClaims(record);
    const frozen = new Map(claims.map(claim => [claim.id, claim]));
    const liveClaims = await tx.claimNode.findMany({ where: { researchObjectId: input.researchObjectId, versionId: input.versionId } });
    const matching = new Set(liveClaims.filter(claim => frozen.has(claim.id) && sameScientificClaim(frozen.get(claim.id)!, claim as unknown as Record<string, unknown>)).map(claim => claim.id));
    const media = await tx.presentationAsset.findMany({ where: { researchObjectId: input.researchObjectId, versionId: input.versionId, deletedAt: null }, include: { sourceClaims: true }, orderBy: { id: 'asc' } });
    const items = media.filter(asset => asset.sourceClaims.length > 0 && asset.sourceClaims.every(link => matching.has(link.claimId))).map(asset => ({
      id: asset.id, researchObjectId: asset.researchObjectId, versionId: asset.versionId, kind: asset.kind,
      objectKey: asset.objectKey, contentHash: asset.contentHash, generator: asset.generator, generatorVersion: asset.generatorVersion,
      promptHash: asset.promptHash, status: asset.status, label: asset.label, provenance: asset.provenance,
      sourceClaimIds: asset.sourceClaims.map(link => link.claimId).sort(),
    }));
    record = { ...record, historyMedia: { captureSource: 'legacy_captured_at_sealing', capturedAt, items } };
  }
  await tx.version.update({ where: { id: version.id }, data: { researchRecord: JSON.parse(JSON.stringify({ ...record,
    historyCapture: { state: 'sealed', capturedAt, graphSource: record.dto ? recordValue(record.historyCapture).graphSource ?? 'existing_research_record' : 'not_recorded' },
  })) as Prisma.InputJsonValue } });
}

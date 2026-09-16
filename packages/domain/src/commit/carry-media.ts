import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { recordValue } from './research-record-snapshot';
import { frozenClaims, historyMediaItems, sameScientificClaim, sealVersionHistory } from './version-history';
import { versionHistoryCopyProvenance, requireValidVersionHistoryCopy, frozenScientificEvidence, sameScientificEvidence } from '../assets/version-history-copy';

/** Copy only sealed media receipts; raw bytes and original generation lineage are retained. */
export async function carryVersionMedia(tx: Prisma.TransactionClient, input: {
  researchObjectId: string; previousVersionId: string; versionId: string;
}): Promise<void> {
  const { researchObjectId, previousVersionId, versionId } = input;
  await sealVersionHistory(tx, { researchObjectId, versionId: previousVersionId });
  const [previous, target, targetClaims, targetEvidence] = await Promise.all([
    tx.version.findFirst({ where: { id: previousVersionId, researchObjectId }, include: { manifest: true } }),
    tx.version.findFirst({ where: { id: versionId, researchObjectId }, include: { manifest: true } }),
    tx.claimNode.findMany({ where: { researchObjectId, versionId } }),
    tx.evidenceRecord.findMany({ where: { researchObjectId, versionId } }),
  ]);
  if (!previous || !target || previousVersionId === versionId) throw new Error('Media history scope mismatch');
  const copies = new Map(targetClaims.flatMap(claim => {
    const provenance = recordValue(claim.provenance);
    return provenance.previousVersionId === previousVersionId && typeof provenance.previousClaimId === 'string'
      ? [[provenance.previousClaimId, claim] as const] : [];
  }));
  const originals = new Map(frozenClaims(previous.researchRecord).map(claim => [claim.id, claim]));
  const sameCore = isDeepStrictEqual(previous.manifest?.coreJson, target.manifest?.coreJson);
  for (const asset of historyMediaItems(previous.researchRecord)) {
    if (['storyboard', 'sourced_storyboard'].includes(String(recordValue(asset.provenance).subtype)) || asset.generator === 'OpenScience Hermes storyboard planner') continue;
    // Availability is live; scientific content/status/provenance come only from the sealed receipt.
    const available = await tx.presentationAsset.findUnique({ where: { id: asset.id }, select: { deletedAt: true } });
    if (!available || available.deletedAt) continue;
    const links = asset.sourceClaimIds.map(id => ({ original: originals.get(id), copy: copies.get(id), sourceClaimId: id }));
    if (!links.length || links.some(link => !link.original || !link.copy)) continue;
    const remap = new Map(links.map(link => [link.sourceClaimId, link.copy!.id]));
    const sourceEvidence = frozenScientificEvidence(previous.researchRecord).filter(item => remap.has(String(item.claimId))).map(item => ({ ...item, claimId: remap.get(String(item.claimId)) }));
    const mappedEvidence = targetEvidence.filter(item => links.some(link => link.copy!.id === item.claimId)) as unknown as Array<Record<string, unknown>>;
    const unchanged = sameCore && links.every(({ original, copy }) => sameScientificClaim(original!, copy as unknown as Record<string, unknown>)) && sameScientificEvidence(sourceEvidence, mappedEvidence);
    const approvalRetained = unchanged && asset.status === 'approved';
    const created = await tx.presentationAsset.create({ data: {
      researchObjectId, versionId, kind: asset.kind, objectKey: asset.objectKey, contentHash: asset.contentHash,
      generator: asset.generator, generatorVersion: asset.generatorVersion, label: asset.label, promptHash: asset.promptHash,
      status: approvalRetained ? 'approved' : asset.status === 'rejected' ? 'rejected' : 'draft',
      provenance: versionHistoryCopyProvenance(asset, links.map(link => ({ sourceClaimId: link.sourceClaimId, claimId: link.copy!.id })), links.map(link => link.copy as unknown as Record<string, unknown>), mappedEvidence, approvalRetained),
    } });
    await tx.presentationAssetClaim.createMany({ data: links.map(({ copy }) => ({
      presentationAssetId: created.id, claimId: copy!.id, researchObjectId, versionId,
    })) });
    await requireValidVersionHistoryCopy(tx, created);
  }
}

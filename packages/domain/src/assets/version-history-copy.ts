import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { recordValue } from '../commit/research-record-snapshot';
import { frozenClaims, historyMediaItems, sameScientificClaim, type FrozenHistoryMedia } from '../commit/version-history';
import { PresentationAssetError } from './errors';
import { canonicalPublicationValue } from '../research-intelligence/publication-snapshot';

export function isVersionHistoryCopy(asset: { provenance: unknown }): boolean {
  return recordValue(asset.provenance).source === 'version_history_copy';
}

/** Server-owned provenance for a reused file; the original generation lineage remains nested. */
export function versionHistoryCopyProvenance(origin: FrozenHistoryMedia, claimMap: Array<{ sourceClaimId: string; claimId: string }>, mappedClaims: Array<Record<string, unknown>>, mappedEvidence: Array<Record<string, unknown>>, approvalRetained: boolean): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({ source: 'version_history_copy', sourceClaimIds: claimMap.map(link => link.claimId).sort(),
    historyCopy: { schemaVersion: 1, researchObjectId: origin.researchObjectId, versionId: origin.versionId,
      assetId: origin.id, claimMap, mappedClaims: mappedClaims.map(scientificClaimValue), mappedEvidence: mappedEvidence.map(scientificEvidenceValue), approvalRetained },
    lineage: origin.provenance,
  })) as Prisma.InputJsonValue;
}
export function scientificClaimValue(claim: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(['id', 'kind', 'statement', 'assessment', 'conditions', 'limitations', 'extractionStatus'].map(key => [key, claim[key]]));
}
export function scientificEvidenceValue(evidence: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(['claimId', 'artifactId', 'kind', 'title', 'exactQuote', 'relation', 'locator', 'contentHash', 'extractionConfidence', 'extractionStatus'].map(key => [key, evidence[key] ?? null]));
}
export function frozenScientificEvidence(researchRecord: unknown): Array<Record<string, unknown>> {
  const record = recordValue(researchRecord);
  const rows = recordValue(record.dto).evidence;
  const sources = recordValue(record.sources);
  return (Array.isArray(rows) ? rows.map(recordValue) : []).map(item => {
    const source = recordValue(sources[String(item.id)]);
    return scientificEvidenceValue({ ...item, exactQuote: source.exactQuote ?? null,
      locator: { artifactId: item.artifactId, contentHash: item.contentHash, ...recordValue(source.locator ?? item.locator) } });
  });
}
export function sameScientificEvidence(left: Array<Record<string, unknown>>, right: Array<Record<string, unknown>>): boolean {
  return isDeepStrictEqual(left.map(scientificEvidenceValue).map(canonicalPublicationValue).sort(), right.map(scientificEvidenceValue).map(canonicalPublicationValue).sort());
}

/** Validate against the immutable origin receipt, exact stored file identity, and mapped destination Claims. */
export async function requireValidVersionHistoryCopy(db: Pick<Prisma.TransactionClient, 'version' | 'claimNode' | 'evidenceRecord' | 'presentationAssetClaim'>, asset: {
  id: string; researchObjectId: string; versionId: string; kind: string; objectKey: string; contentHash: string;
  generator: string; generatorVersion: string; label: string; provenance: unknown;
}): Promise<void> {
  if (!isVersionHistoryCopy(asset)) return;
  const invalid = () => new PresentationAssetError('VALIDATION_ERROR', '历史媒体来源或本版科研内容已改变，请重新审阅');
  const provenance = recordValue(asset.provenance);
  const copy = recordValue(provenance.historyCopy);
  if (copy.schemaVersion !== 1 || copy.researchObjectId !== asset.researchObjectId || typeof copy.versionId !== 'string'
    || copy.versionId === asset.versionId || typeof copy.assetId !== 'string' || !Array.isArray(copy.claimMap) || !Array.isArray(copy.mappedClaims) || !Array.isArray(copy.mappedEvidence)) throw invalid();
  const source = await db.version.findFirst({ where: { id: copy.versionId, researchObjectId: asset.researchObjectId } });
  const origin = source && historyMediaItems(source.researchRecord).find(item => item.id === copy.assetId);
  if (!origin || origin.versionId !== source!.id || origin.researchObjectId !== asset.researchObjectId
    || !['kind', 'objectKey', 'contentHash', 'generator', 'generatorVersion', 'label'].every(key => asset[key as keyof typeof asset] === origin[key as keyof FrozenHistoryMedia])
    || !isDeepStrictEqual(provenance.lineage, origin.provenance)) throw invalid();
  const map = copy.claimMap.map(recordValue);
  if (!map.length || map.some(link => typeof link.sourceClaimId !== 'string' || typeof link.claimId !== 'string')
    || new Set(map.map(link => link.claimId)).size !== map.length
    || !isDeepStrictEqual(map.map(link => link.sourceClaimId).sort(), [...origin.sourceClaimIds].sort())) throw invalid();
  const ids = map.map(link => link.claimId as string).sort();
  const links = await db.presentationAssetClaim.findMany({ where: { presentationAssetId: asset.id }, select: { claimId: true } });
  if (!isDeepStrictEqual(links.map(link => link.claimId).sort(), ids)) throw invalid();
  const current = await db.claimNode.findMany({ where: { id: { in: ids }, researchObjectId: asset.researchObjectId, versionId: asset.versionId } });
  const recorded = new Map(copy.mappedClaims.map(recordValue).map(claim => [claim.id, claim]));
  if (current.length !== ids.length || current.some(claim => !recorded.has(claim.id) || !sameScientificClaim(recorded.get(claim.id)!, claim as unknown as Record<string, unknown>))) throw invalid();
  const evidence = await db.evidenceRecord.findMany({ where: { researchObjectId: asset.researchObjectId, versionId: asset.versionId, claimId: { in: ids } } });
  if (!sameScientificEvidence(copy.mappedEvidence.map(recordValue), evidence as unknown as Array<Record<string, unknown>>)) throw invalid();
  if (copy.approvalRetained === true) {
    const originalClaims = new Map(frozenClaims(source!.researchRecord).map(claim => [claim.id, claim]));
    if (origin.status !== 'approved' || map.some(link => !originalClaims.has(link.sourceClaimId) || !recorded.has(link.claimId)
      || !sameScientificClaim(originalClaims.get(link.sourceClaimId)!, recorded.get(link.claimId)!))) throw invalid();
    const remap = new Map(map.map(link => [link.sourceClaimId, link.claimId]));
    const originalEvidence = frozenScientificEvidence(source!.researchRecord).filter(item => remap.has(item.claimId)).map(item => ({ ...item, claimId: remap.get(item.claimId) }));
    if (!sameScientificEvidence(originalEvidence, copy.mappedEvidence.map(recordValue))) throw invalid();
  }
}

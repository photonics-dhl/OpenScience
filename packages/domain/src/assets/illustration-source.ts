import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { INGESTION_BRIDGE_FIELDS } from '../ingestion/claim-evidence-bridge';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function presentationClaimContent(claims: readonly {
  id: string; parentClaimId?: string | null; kind: string; statement: string; assessment: string;
  conditions: string[]; limitations: string[]; extractionStatus: string;
}[]): string {
  return JSON.stringify([...claims].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map(({ id, parentClaimId, kind, statement, assessment, conditions, limitations, extractionStatus }) => ({
      id, parentClaimId, kind, statement, assessment, conditions: [...conditions].sort(), limitations: [...limitations].sort(), extractionStatus,
    })));
}

export async function readReviewedPresentationEvidence(
  prisma: Pick<Prisma.TransactionClient, 'evidenceRecord'>,
  scope: { researchObjectId: string; versionId: string; sourceClaimIds: string[] },
  lineageByClaim?: ReadonlyMap<string, unknown>,
) {
  const candidates = await prisma.evidenceRecord.findMany({ where: {
    researchObjectId: scope.researchObjectId, versionId: scope.versionId,
    claimId: { in: scope.sourceClaimIds }, extractionStatus: 'succeeded', exactQuote: { not: null },
  }, orderBy: [{ claimId: 'asc' }, { id: 'asc' }] });
  const rows = lineageByClaim ? candidates.filter((row) => {
    const origin = row.provenance as Record<string, unknown> | null;
    const lineage = lineageByClaim.get(row.claimId);
    return typeof lineage === 'string' && origin?.source === 'reviewed_ingestion' && origin.sourceTaskId === lineage;
  }) : candidates;
  if (scope.sourceClaimIds.some((id) => !rows.some((row) => row.claimId === id && row.exactQuote?.trim()))) {
    throw new Error('[blocked] Each source Claim needs reviewed original evidence before scientific media planning');
  }
  return rows;
}

export function presentationEvidenceIdentity(rows: Awaited<ReturnType<typeof readReviewedPresentationEvidence>>): string {
  return createHash('sha256').update(JSON.stringify(rows.map(({ id, claimId, artifactId, contentHash,
    exactQuote, relation, locator, extractionStatus, updatedAt, provenance }) => ({
    id, claimId, artifactId, contentHash, exactQuote, relation, locator, extractionStatus, updatedAt, provenance,
  })))).digest('hex');
}

type NarrativeScope = { userId: string; workspaceId: string; researchObjectId: string; versionId: string; sourceClaimIds: string[] };
type NarrativeReader = Pick<Prisma.TransactionClient, 'version' | 'claimNode' | 'ingestionTask'>;

function reviewedSourceLineage(claim: { provenance?: unknown }): string | undefined {
  const provenance = record(claim.provenance);
  const lineage = provenance.sourceTaskLineage ?? (provenance.source === 'reviewed_ingestion' ? provenance.sourceTaskId : undefined);
  return typeof lineage === 'string' && lineage.trim() ? lineage : undefined;
}

/** Eligibility is not authorization: an eligible source must still pass all version/owner/review checks below. */
export function hasSingleReviewedVisualSource(claims: readonly { extractionStatus: string; provenance?: unknown }[],
  evidence: readonly { artifactId: string }[] = []): boolean {
  const lineages = claims.map(reviewedSourceLineage);
  return claims.length > 0 && claims.every(claim => claim.extractionStatus === 'succeeded')
    && lineages.every(lineage => lineage !== undefined) && new Set(lineages).size === 1
    && new Set(evidence.map(row => row.artifactId)).size <= 1;
}

/** Resolve the paper through this version's reviewed Claims, never the newest document in the workspace. */
export async function readVisualNarrativeSource(prisma: NarrativeReader, scope: NarrativeScope) {
  const [version, claims] = await Promise.all([
    prisma.version.findFirst({ where: { id: scope.versionId, researchObjectId: scope.researchObjectId },
      include: { manifest: { include: { entries: true } } } }),
    prisma.claimNode.findMany({ where: { id: { in: scope.sourceClaimIds }, versionId: scope.versionId, researchObjectId: scope.researchObjectId } }),
  ]);
  const lineages = claims.map(reviewedSourceLineage);
  if (!version?.manifest || claims.length !== scope.sourceClaimIds.length
    || !hasSingleReviewedVisualSource(claims)) {
    throw new Error('[blocked] Whole-paper narrative requires reviewed Claims from one paper in this exact version');
  }
  const ingestion = await prisma.ingestionTask.findUnique({ where: { id: lineages[0] as string },
    include: { batch: true, artifact: true, agentTask: { include: { session: true } } } });
  const task = ingestion?.agentTask;
  if (!ingestion || ingestion.batch.userId !== scope.userId || ingestion.batch.researchObjectId !== scope.researchObjectId
    || ingestion.state !== 'confirmed' || ingestion.artifact.workspaceId !== scope.workspaceId
    || ingestion.artifact.deletedAt || ingestion.artifact.bytesPurgedAt
    || !task || task.deletedAt || task.session.deletedAt || task.session.userId !== scope.userId
    || task.session.researchObjectId !== scope.researchObjectId || task.kind !== 'sdf.extract' || task.status !== 'succeeded'
    || !version.manifest.entries.some(entry => entry.artifactId === ingestion.artifactId && entry.blobSha256 === ingestion.artifact.blobSha256)) {
    throw new Error('[blocked] Whole-paper narrative source is unavailable in this version');
  }
  const result = record(task.result);
  const review = record(result.scientificReview);
  const core = record(result.core);
  if (review.status !== 'review_received' || !['4', '5'].includes(String(review.contractVersion))
    || typeof review.responseHash !== 'string' || !/^[a-f0-9]{64}$/u.test(review.responseHash)
    || result.reason || Object.keys(record(result.fieldDiagnostics)).length
    || INGESTION_BRIDGE_FIELDS.some(field => typeof core[field] !== 'string')) {
    throw new Error('[blocked] Whole-paper narrative requires a completed internal scientific review; partial analysis is not a whole-paper source');
  }
  const reference = parseDocumentSourceMapReference(result.sourceMapRef);
  if (reference.parserStatus !== 'succeeded' || reference.artifactId !== ingestion.artifactId
    || reference.contentHash !== ingestion.artifact.blobSha256) throw new Error('[blocked] Whole-paper narrative SourceMap changed');
  return {
    // Reuse stored source identities and version content; no additional source hash or analysis stage.
    identity: JSON.stringify({ versionId: version.id, manifestId: version.manifest.id, core: version.manifest.coreJson,
      ingestionTaskId: ingestion.id, sourceTaskId: task.id, sourceUpdatedAt: task.updatedAt,
      reviewResponseHash: review.responseHash, sourceMapRef: reference }),
    reference, result, versionSdf: record(version.manifest.coreJson), reviewedAnalysis: core,
    scientificReview: { status: String(review.status), fieldReviews: review.fieldReviews ?? null, needsMoreEvidence: review.needsMoreEvidence ?? [] },
  };
}

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { INGESTION_BRIDGE_FIELDS } from '../ingestion/claim-evidence-bridge';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { parseWorkspaceGuidePayload } from '../agent/workspace-guide-contract';
import { parsePresentationGenerationPayload, requirePresentationWriteScope } from './presentation-asset';

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
type NarrativeReader = Pick<Prisma.TransactionClient, 'version' | 'claimNode' | 'ingestionTask' | 'workspace' | 'membership'
  | 'researchObject' | 'hermesResearchRun' | 'auditLog' | 'agentTask'>;
export type FirstImageSourceContext = { runId: string; taskId: string } | { guideTaskId: string; executionAttempt: number };

/** A stored first-image operation may read the same reviewed paper as its real collaborator. */
export async function requireFirstImageSourceAccess(tx: NarrativeReader, scope: NarrativeScope, context: FirstImageSourceContext) {
  await requirePresentationWriteScope(tx, { userId: scope.userId, researchObjectId: scope.researchObjectId, versionId: scope.versionId });
  const ro = await tx.researchObject.findUnique({ where: { id: scope.researchObjectId } });
  if (!ro || ro.deletedAt || ro.workspaceId !== scope.workspaceId) throw new Error('[blocked] First-image source workspace changed');
  let guideTaskId: string;
  if ('runId' in context) {
    const run = await tx.hermesResearchRun.findUnique({ where: { id: context.runId }, include: { steps: true } });
    const receipt = await tx.auditLog.findFirst({ where: { action: 'hermes.research_run.first_image', targetType: 'hermes_research_run',
      targetId: context.runId, actorId: scope.userId } });
    const proof = record(receipt?.metadata);
    if (!run || !receipt || run.actorId !== scope.userId || run.researchObjectId !== scope.researchObjectId || run.versionId !== scope.versionId
      || run.profile !== 'visual-narrative-v1' || run.maxAgentTasks !== 2 || proof.purpose !== 'first_image' || proof.maxRenderTasks !== 1
      || proof.publicationAuthorized !== false || proof.automaticImageRepair !== false || proof.requestDigest !== run.requestDigest
      || proof.intermediateReview !== 'hermes' || proof.versionId !== scope.versionId || typeof proof.sessionId !== 'string'
      || JSON.stringify([...run.sourceClaimIds].sort()) !== JSON.stringify([...scope.sourceClaimIds].sort())
      || typeof proof.originGuideTaskId !== 'string') throw new Error('[blocked] First-image source receipt is unavailable');
    const step = run.steps.find(s => s.agentTaskId === context.taskId && ['storyboard', 'scene_image'].includes(s.stage));
    const task = await tx.agentTask.findUnique({ where: { id: context.taskId }, include: { session: true } });
    const stored = record(task?.payload); const authority = record(stored.hermesRunAuthority);
    if (run.steps.length !== 3 || run.steps.filter(s => s.stage === 'source_ingestion' && s.status === 'succeeded').length !== 1
      || run.steps.filter(s => s.stage === 'scene_image').length !== 1
      || run.steps.filter(s => s.stage === 'storyboard').length !== 1 || !step || step.ordinal !== 0
      || !task || task.deletedAt || task.kind !== 'presentation.generate' || task.session.deletedAt || task.session.status !== 'active'
      || task.session.userId !== scope.userId || task.session.researchObjectId !== scope.researchObjectId
      || stored.researchObjectId !== scope.researchObjectId || stored.versionId !== scope.versionId
      || JSON.stringify(stored.sourceClaimIds) !== JSON.stringify([...scope.sourceClaimIds].sort())
      || authority.runId !== run.id || authority.stage !== step.stage || authority.ordinal !== 0 || authority.profile !== run.profile)
      throw new Error('[blocked] First-image source task slot changed');
    const plan = run.steps.find(s => s.stage === 'storyboard')!;
    const expected = step.stage === 'storyboard' ? proof.planPayload : parsePresentationGenerationPayload({
      schemaVersion: 1, researchObjectId: scope.researchObjectId, versionId: scope.versionId, kind: 'image', sourceClaimIds: run.sourceClaimIds,
      sceneImage: { storyboardAssetId: plan.presentationAssetId, sceneIndex: 0 },
      hermesRunAuthority: { runId: run.id, stage: 'scene_image', ordinal: 0, profile: run.profile },
    });
    if (!isDeepStrictEqual(task.payload, expected)) throw new Error('[blocked] First-image source payload changed');
    guideTaskId = proof.originGuideTaskId;
  } else guideTaskId = context.guideTaskId;
  const guide = await tx.agentTask.findUnique({ where: { id: guideTaskId }, include: { session: true } });
  if (!guide || guide.deletedAt || guide.kind !== 'workspace.guide' || guide.session.deletedAt || guide.session.status !== 'active'
    || guide.session.userId !== scope.userId || guide.session.researchObjectId !== scope.researchObjectId
    || !('runId' in context) && (guide.status !== 'running' || guide.executionAttempt !== context.executionAttempt))
    throw new Error('[blocked] First-image source request is unavailable');
  const payload = parseWorkspaceGuidePayload(guide.payload);
  if (payload.executionIntent !== 'first-image' || payload.context.presentation?.researchObjectId !== scope.researchObjectId
    || payload.context.presentation.versionId !== scope.versionId) throw new Error('[blocked] First-image source scope changed');
  if ('runId' in context) {
    const run = await tx.hermesResearchRun.findUnique({ where: { id: context.runId } });
    if (run?.requestDigest !== createHash('sha256').update(JSON.stringify({ guideTaskId: guide.id, payload })).digest('hex'))
      throw new Error('[blocked] First-image original request changed');
  }
}

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
export async function readVisualNarrativeSource(prisma: NarrativeReader, scope: NarrativeScope, firstImage?: FirstImageSourceContext) {
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
  const shared = Boolean(ingestion && ingestion.batch.userId !== scope.userId && firstImage);
  if (shared) await requireFirstImageSourceAccess(prisma, scope, firstImage!);
  if (!ingestion || (!shared && ingestion.batch.userId !== scope.userId) || ingestion.batch.researchObjectId !== scope.researchObjectId
    || ingestion.state !== 'confirmed' || ingestion.artifact.workspaceId !== scope.workspaceId
    || ingestion.artifact.deletedAt || ingestion.artifact.bytesPurgedAt
    || !task || task.deletedAt || task.session.deletedAt || task.session.userId !== (shared ? ingestion.batch.userId : scope.userId)
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

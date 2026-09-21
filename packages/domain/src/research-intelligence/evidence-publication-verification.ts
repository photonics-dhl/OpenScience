import { isDeepStrictEqual } from 'node:util';
import type { EvidenceRecord, Prisma } from '@prisma/client';
import { VISUAL_NARRATIVE_PROFILE } from '../assets/video';
import { frozenScientificEvidence, sameScientificEvidence } from '../assets/version-history-copy';
import { frozenClaims, sameScientificClaim } from '../commit/version-history';
import { automaticIngestionReview } from '../ingestion/automatic-review';
import { parseDocumentSourceMapReference } from './source-map-ref';

export type EvidencePublicationVerification = 'human' | 'hermes_system' | 'none';

type Evidence = EvidenceRecord;
type Scope = { researchObjectId: string; versionId: string; workspaceId: string };
type ReadBudget = { remaining: number };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function reserveReads(budget: ReadBudget, count: number): boolean {
  if (budget.remaining < count) return false;
  budget.remaining -= count;
  return true;
}

async function hasHermesBatchVerification(prisma: Prisma.TransactionClient, scope: Scope, batch: readonly Evidence[], budget: ReadBudget): Promise<boolean> {
  const provenance = record(batch[0]?.provenance);
  const { sourceTaskId, runId, agentTaskId, responseHash, authorizedByUserId, snapshotToken, batchDigest } = provenance;
  if (provenance.source !== 'reviewed_ingestion' || provenance.reviewOrigin !== 'hermes'
    || !nonempty(sourceTaskId) || provenance.sourceTaskLineage !== sourceTaskId
    || !nonempty(runId) || !nonempty(agentTaskId) || !nonempty(authorizedByUserId)
    || !hash(responseHash) || !hash(snapshotToken) || !hash(batchDigest)) return false;

  if (!reserveReads(budget, 3)) return false;
  const [source, run, audits] = await Promise.all([
    prisma.ingestionTask.findUnique({ where: { id: sourceTaskId }, include: { batch: true, artifact: true, agentTask: true } }),
    prisma.hermesResearchRun.findUnique({ where: { id: runId }, include: { steps: true } }),
    prisma.auditLog.findMany({ where: { action: 'evidence.system_verify', actorId: null, workspaceId: scope.workspaceId,
      targetType: 'version', targetId: scope.versionId, metadata: { path: ['sourceTaskId'], equals: sourceTaskId } }, take: 2 }),
  ]);
  if (!source || source.state !== 'confirmed' || source.batch.researchObjectId !== scope.researchObjectId
    || source.agentTaskId !== agentTaskId || source.agentTask?.id !== agentTaskId || source.agentTask.status !== 'succeeded'
    || source.agentTask.deletedAt || source.artifact.workspaceId !== scope.workspaceId
    || source.artifact.deletedAt || source.artifact.bytesPurgedAt
    || !run || run.profile !== VISUAL_NARRATIVE_PROFILE || run.researchObjectId !== scope.researchObjectId
    || run.versionId !== scope.versionId || run.actorId !== authorizedByUserId || audits.length !== 1) return false;
  // The run may have completed or gained an authorized repair budget since review.
  // Its immutable source identity, not its old stage or task limit, is authority here.
  const sourceSteps = run.steps.filter(step => step.stage === 'source_ingestion' && step.ingestionTaskId === sourceTaskId);
  if (sourceSteps.length !== 1 || sourceSteps[0]!.agentTaskId !== agentTaskId || sourceSteps[0]!.artifactId !== source.artifactId) return false;
  const audit = record(audits[0]!.metadata);
  if (audit.executor !== 'hermes' || audit.researchObjectId !== scope.researchObjectId || audit.versionId !== scope.versionId
    || audit.sourceTaskId !== sourceTaskId || audit.runId !== runId || audit.agentTaskId !== agentTaskId
    || audit.responseHash !== responseHash || audit.authorizedByUserId !== authorizedByUserId
    || !Array.isArray(audit.evidenceIds) || audit.evidenceIds.some(id => !nonempty(id))
    || new Set(audit.evidenceIds).size !== audit.evidenceIds.length
    || !isDeepStrictEqual([...audit.evidenceIds].sort(), batch.map(item => item.id).sort())) return false;

  try {
    // Reuse the complete v5 scientific/core/Claims validator, not just review_received.
    const review = automaticIngestionReview(source);
    if (review.agentTaskId !== agentTaskId || review.responseHash !== responseHash) return false;
    const reference = parseDocumentSourceMapReference(record(source.agentTask.result).sourceMapRef);
    return batch.every(item => {
      const current = record(item.provenance);
      return item.researchObjectId === scope.researchObjectId && item.versionId === scope.versionId && item.workspaceId === scope.workspaceId
        && item.artifactId === source.artifactId && item.contentHash === source.artifact.blobSha256
        && current.source === 'reviewed_ingestion' && current.reviewOrigin === 'hermes'
        && current.sourceTaskId === sourceTaskId && current.sourceTaskLineage === sourceTaskId
        && current.runId === runId && current.agentTaskId === agentTaskId && current.responseHash === responseHash
        && current.authorizedByUserId === authorizedByUserId && current.snapshotToken === snapshotToken && current.batchDigest === batchDigest
        && isDeepStrictEqual(parseDocumentSourceMapReference(current.sourceMapRef), reference);
    });
  } catch {
    return false;
  }
}

/**
 * Read-only proof for rows loaded from this exact version. Pass the complete current
 * Evidence collection: a missing or additional batch member invalidates system proof.
 * Verification may be human or Hermes scientific review; it never invents a human verifier.
 */
async function loadDirectEvidencePublicationVerification(
  prisma: Prisma.TransactionClient, scope: Scope, evidence: readonly Evidence[], budget: ReadBudget,
): Promise<Map<string, EvidencePublicationVerification>> {
  const result = new Map<string, EvidencePublicationVerification>();
  const batches = new Map<string, Evidence[]>();
  for (const item of evidence) {
    const inScope = item.researchObjectId === scope.researchObjectId && item.versionId === scope.versionId && item.workspaceId === scope.workspaceId;
    result.set(item.id, inScope && item.extractionStatus === 'succeeded' && item.verifiedByUserId ? 'human' : 'none');
  }
  // Reuse publication-evidence.ts's existing 200 Evidence / 500 Claim bounds.
  // An oversized collection retains human proof but must not fan out into batches.
  if (evidence.length > 200) return result;
  for (const item of evidence) {
    const sourceTaskId = record(item.provenance).sourceTaskId;
    if (nonempty(sourceTaskId)) {
      const batch = batches.get(sourceTaskId) ?? [];
      batch.push(item);
      batches.set(sourceTaskId, batch);
    }
  }
  for (const batch of batches.values()) {
    const candidates = batch.filter(item => item.extractionStatus === 'succeeded' && item.verifiedByUserId === null
      && record(item.provenance).source === 'reviewed_ingestion' && record(item.provenance).reviewOrigin === 'hermes');
    if (candidates.length && await hasHermesBatchVerification(prisma, scope, batch, budget)) {
      for (const item of candidates) result.set(item.id, 'hermes_system');
    }
  }
  return result;
}

type ScientificRow = Record<string, unknown>;
type ScientificGraph = { evidence: Map<string, ScientificRow>; claims: Map<string, ScientificRow> };
type Previous = { versionId: string; id: string };

function previousReference(row: ScientificRow, kind: 'Evidence' | 'Claim'): Previous | null {
  const provenance = record(row.provenance);
  const versionId = provenance.previousVersionId;
  const id = provenance[`previous${kind}Id`];
  const ids = provenance[`previous${kind}Ids`];
  if (!nonempty(versionId) || !nonempty(id)
    || (ids !== undefined && (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== id))) return null;
  return { versionId, id };
}

function uniquePrevious(rows: Map<string, ScientificRow>, previous: Previous, kind: 'Evidence' | 'Claim'): boolean {
  return [...rows.values()].filter(row => {
    const provenance = record(row.provenance);
    const ids = provenance[`previous${kind}Ids`];
    return provenance.previousVersionId === previous.versionId && (provenance[`previous${kind}Id`] === previous.id
      || (Array.isArray(ids) && ids.includes(previous.id)));
  }).length === 1;
}

function scientificGraph(evidence: ScientificRow[], claims: ScientificRow[]): ScientificGraph | null {
  const index = (rows: ScientificRow[]) => {
    const result = new Map<string, ScientificRow>();
    for (const row of rows) {
      if (!nonempty(row.id) || result.has(row.id)) return null;
      result.set(row.id, row);
    }
    return result;
  };
  const evidenceById = index(evidence);
  const claimsById = index(claims);
  return evidenceById && claimsById ? { evidence: evidenceById, claims: claimsById } : null;
}

/** Compare the Claim and its parent chain, allowing only the recorded one-to-one ID remap. */
function sameInheritedClaim(current: ScientificGraph, previous: ScientificGraph, claimId: string, previousVersionId: string): boolean {
  let claim = current.claims.get(claimId);
  const seen = new Set<string>();
  while (claim) {
    if (!nonempty(claim.id) || seen.has(claim.id)) return false;
    seen.add(claim.id);
    const link = previousReference(claim, 'Claim');
    if (!link || link.versionId !== previousVersionId || !uniquePrevious(current.claims, link, 'Claim')) return false;
    const origin = previous.claims.get(link.id);
    if (!origin || !sameScientificClaim(claim, origin)) return false;
    if (claim.parentClaimId == null || origin.parentClaimId == null) return claim.parentClaimId == null && origin.parentClaimId == null;
    if (!nonempty(claim.parentClaimId) || !nonempty(origin.parentClaimId)) return false;
    const parent = current.claims.get(claim.parentClaimId);
    if (!parent || previousReference(parent, 'Claim')?.id !== origin.parentClaimId) return false;
    claim = parent;
  }
  return false;
}

async function readVerificationHistory(prisma: Prisma.TransactionClient, scope: Scope, versionId: string, budget: ReadBudget) {
  if (!reserveReads(budget, 1)) return null;
  const version = await prisma.version.findUnique({ where: { id: versionId }, include: {
    researchObject: { select: { workspaceId: true } }, publications: { select: { publicVersionId: true } },
  } });
  if (!version || version.researchObjectId !== scope.researchObjectId || version.researchObject.workspaceId !== scope.workspaceId) return null;
  const captured = record(version.researchRecord);
  const dto = record(captured.dto);
  if (dto.objectId !== scope.researchObjectId || dto.versionId !== version.id
    || !Array.isArray(dto.evidence) || dto.evidence.length > 200
    || !Array.isArray(dto.claims) || dto.claims.length > 500) return null;
  const sources = record(captured.sources);
  const claimSources = record(sources.claims);
  const scientificEvidence = frozenScientificEvidence(captured);
  const graph = scientificGraph(dto.evidence.map((value, index) => {
    const item = record(value);
    const source = record(sources[String(item.id)]);
    return { ...scientificEvidence[index], id: item.id, verified: item.verified,
      verifiedByUserId: source.verifiedByUserId, provenance: source.provenance };
  }), frozenClaims(captured).map(claim => ({ ...claim, provenance: record(claimSources[String(claim.id)]).provenance })));
  if (!graph) return null;
  const published = ['published', 'revised'].includes(version.status) && nonempty(version.publicVersionId)
    && version.publications.length === 1 && version.publications[0]!.publicVersionId === version.publicVersionId;
  return { versionId: version.id, graph, published };
}

/**
 * Published receipts are terminal authority; private frozen `verified` flags are not.
 * Each invocation caches version graphs and complete original batches for all Evidence.
 */
export async function loadEvidencePublicationVerification(
  prisma: Prisma.TransactionClient, scope: Scope, evidence: readonly Evidence[],
): Promise<Map<string, EvidencePublicationVerification>> {
  // A damaged or branching history must not amplify ordinary draft snapshot reads.
  // All batch, graph and history reads share this budget; exhaustion stays unverified.
  const budget: ReadBudget = { remaining: 256 };
  const result = await loadDirectEvidencePublicationVerification(prisma, scope, evidence, budget);
  if (evidence.length > 200) return result;
  const candidates = evidence.filter(item => result.get(item.id) === 'none' && item.extractionStatus === 'succeeded'
    && item.verifiedByUserId === null && previousReference(item as unknown as ScientificRow, 'Evidence'));
  if (!candidates.length || !reserveReads(budget, 1)) return result;
  const claims = await prisma.claimNode.findMany({ where: { researchObjectId: scope.researchObjectId, versionId: scope.versionId }, take: 501 });
  if (claims.length > 500) {
    for (const [id, proof] of result) if (proof !== 'human') result.set(id, 'none');
    return result;
  }
  const current = scientificGraph(evidence as unknown as ScientificRow[], claims as unknown as ScientificRow[]);
  if (!current) return result;
  const history = new Map<string, ReturnType<typeof readVerificationHistory>>();
  const getHistory = (versionId: string) => {
    let pending = history.get(versionId);
    if (!pending) {
      pending = readVerificationHistory(prisma, scope, versionId, budget);
      history.set(versionId, pending);
    }
    return pending;
  };
  const direct = new Map<string, Promise<{ graph: ScientificGraph | null; proof: Map<string, EvidencePublicationVerification> }>>();
  const getDirect = (versionId: string) => {
    let pending = direct.get(versionId);
    if (!pending) {
      pending = (async () => {
        const unavailable = { graph: null, proof: new Map<string, EvidencePublicationVerification>() };
        if (!reserveReads(budget, 2)) return unavailable;
        const where = { researchObjectId: scope.researchObjectId, versionId };
        const [rows, claimRows] = await Promise.all([
          prisma.evidenceRecord.findMany({ where, take: 201 }), prisma.claimNode.findMany({ where, take: 501 }),
        ]);
        if (rows.length > 200 || claimRows.length > 500) return unavailable;
        return { graph: scientificGraph(rows as unknown as ScientificRow[], claimRows as unknown as ScientificRow[]),
          proof: await loadDirectEvidencePublicationVerification(prisma, { ...scope, versionId }, rows, budget) };
      })();
      direct.set(versionId, pending);
    }
    return pending;
  };
  for (const candidate of candidates) {
    if (candidate.researchObjectId !== scope.researchObjectId || candidate.versionId !== scope.versionId || candidate.workspaceId !== scope.workspaceId) continue;
    let graph = current;
    let item = graph.evidence.get(candidate.id)!;
    const seenVersions = new Set([scope.versionId]);
    while (true) {
      const link = previousReference(item, 'Evidence');
      if (!link || seenVersions.has(link.versionId) || !uniquePrevious(graph.evidence, link, 'Evidence') || !nonempty(item.claimId)) break;
      seenVersions.add(link.versionId);
      const previous = await getHistory(link.versionId);
      const original = previous?.graph.evidence.get(link.id);
      const claimLink = previousReference(graph.claims.get(item.claimId) ?? {}, 'Claim');
      if (!previous || !original || !claimLink || claimLink.versionId !== link.versionId || claimLink.id !== original.claimId
        || !sameInheritedClaim(graph, previous.graph, item.claimId, link.versionId)
        || !sameScientificEvidence([item], [{ ...original, claimId: item.claimId }])) break;
      if (previous.published && original.verified === true) {
        result.set(candidate.id, nonempty(original.verifiedByUserId) ? 'human' : 'hermes_system');
        break;
      }
      if (record(original.provenance).previousVersionId === undefined) {
        // A private root must still have the exact live batch's durable system proof.
        const root = await getDirect(previous.versionId);
        const live = root.graph?.evidence.get(link.id);
        const frozenClaim = previous.graph.claims.get(String(original.claimId));
        const liveClaim = root.graph?.claims.get(String(original.claimId));
        if (root.proof.get(link.id) === 'hermes_system' && live && frozenClaim && liveClaim
          && sameScientificEvidence([original], [live]) && sameScientificClaim(frozenClaim, liveClaim)
          && (frozenClaim.parentClaimId ?? null) === (liveClaim.parentClaimId ?? null)) result.set(candidate.id, 'hermes_system');
        break;
      }
      graph = previous.graph;
      item = original;
    }
  }
  return result;
}

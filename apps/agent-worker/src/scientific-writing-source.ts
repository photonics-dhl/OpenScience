import type { Prisma, PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import {
  loadDocumentSourceMapReference,
  INGESTION_BRIDGE_FIELDS,
  parseDocumentSourceMapReference,
  resolveSourceLocator,
  validateSourceLocator,
  type DocumentSourceMap,
  type WorkspaceWritingDraft,
  type WorkspaceWritingDraftInput,
} from '@openscience/domain';
import { createWritingSourcePacket, type WritingSourcePacket } from './citation-management';

export interface VisualNarrativeSource {
  versionSdf: Record<string, unknown>;
  reviewedAnalysis: Record<string, unknown>;
  scientificReview: { status: string; fieldReviews: unknown; needsMoreEvidence: unknown };
  sourceContext: WritingSourcePacket;
}

type NarrativeScope = { userId: string; workspaceId: string; researchObjectId: string; versionId: string; sourceClaimIds: string[] };
type NarrativeReader = Pick<Prisma.TransactionClient, 'version' | 'claimNode' | 'ingestionTask'>;

/** Resolve the paper through this version's reviewed Claims, never the newest document in the workspace. */
export async function readVisualNarrativeSource(prisma: NarrativeReader, scope: NarrativeScope) {
  const [version, claims] = await Promise.all([
    prisma.version.findFirst({ where: { id: scope.versionId, researchObjectId: scope.researchObjectId },
      include: { manifest: { include: { entries: true } } } }),
    prisma.claimNode.findMany({ where: { id: { in: scope.sourceClaimIds }, versionId: scope.versionId, researchObjectId: scope.researchObjectId } }),
  ]);
  const lineages = claims.map(claim => {
    const provenance = record(claim.provenance);
    return typeof provenance.sourceTaskLineage === 'string' ? provenance.sourceTaskLineage
      : provenance.source === 'reviewed_ingestion' ? provenance.sourceTaskId : undefined;
  });
  if (!version?.manifest || claims.length !== scope.sourceClaimIds.length
    || claims.some(claim => claim.extractionStatus !== 'succeeded')
    || lineages.some(id => typeof id !== 'string') || new Set(lineages).size !== 1) {
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

/** Reuse parser output and the completed review. Excerpts are context, while scene facts still require exact Claim/Evidence bindings. */
export async function resolveVisualNarrativeSource(deps: { prisma: NarrativeReader; storage: StorageAdapter }, scope: NarrativeScope) {
  const source = await readVisualNarrativeSource(deps.prisma, scope);
  const sourceMap = await loadDocumentSourceMapReference(deps.storage, source.reference);
  const packet = createWritingSourcePacket(sourceMap, source.result);
  // The existing packet orders reviewed evidence and headings first. Keep complete excerpts,
  // explicitly reporting partial context instead of pretending to send the entire PDF again.
  let selectedCharacters = 0;
  const excerpts = packet.excerpts.filter(excerpt => {
    if (selectedCharacters + excerpt.text.length > 18_000) return false;
    selectedCharacters += excerpt.text.length;
    return true;
  });
  const context: VisualNarrativeSource = {
    versionSdf: source.versionSdf, reviewedAnalysis: source.reviewedAnalysis, scientificReview: source.scientificReview,
    sourceContext: { excerpts, coverage: { ...packet.coverage, selectedCharacters,
      complete: packet.coverage.complete && excerpts.length === packet.excerpts.length,
      omittedSegments: packet.coverage.omittedSegments + packet.excerpts.length - excerpts.length } },
  };
  return { identity: source.identity, context };
}

interface ResolveWritingSourceInput {
  ownerTaskId: string;
  baseDraft?: WorkspaceWritingDraftInput;
  writingSource?: { ingestionTaskId: string };
}

export class WritingSourceChoiceError extends Error {
  constructor(readonly reason: 'multiple' | 'unavailable') {
    super(`Scientific writing source ${reason}`);
  }
}

export interface ResolvedWritingSource {
  userId: string;
  researchObjectId: string;
  workspaceId: string;
  sourceTaskId: string;
  researchTitle: string;
  sourceMap: DocumentSourceMap;
  extractionResult: Record<string, unknown>;
  baseDraft?: WorkspaceWritingDraft;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseStoredWritingDraft(value: unknown): WorkspaceWritingDraft | undefined {
  const draft = record(record(value).writingDraft);
  if (typeof draft.title !== 'string' || !draft.title.trim() || draft.title.length > 240
    || !['note', 'review', 'manuscript'].includes(String(draft.kind))
    || typeof draft.body !== 'string' || draft.body.length > 60_000
    || typeof draft.sourceTaskId !== 'string'
    || (draft.baseDraftTaskId !== undefined && typeof draft.baseDraftTaskId !== 'string')
    || !Array.isArray(draft.citations)
    || !['grounded', 'grounded_with_unresolved_review', 'user_edited'].includes(String(draft.sourceStatus))) return undefined;
  try {
    const citations = draft.citations.map((value) => {
      const citation = record(value);
      if (typeof citation.id !== 'string' || !/^S\d+$/u.test(citation.id)
        || citation.marker !== '[' + citation.id + ']'
        || typeof citation.quote !== 'string' || !citation.quote.length) throw new Error('citation');
      return {
        id: citation.id,
        marker: citation.marker,
        quote: citation.quote,
        sourceLocator: validateSourceLocator(citation.sourceLocator),
      };
    });
    return {
      title: draft.title,
      kind: draft.kind as WorkspaceWritingDraft['kind'],
      body: draft.body,
      sourceTaskId: draft.sourceTaskId,
      ...(typeof draft.baseDraftTaskId === 'string' ? { baseDraftTaskId: draft.baseDraftTaskId } : {}),
      citations,
      sourceStatus: draft.sourceStatus as WorkspaceWritingDraft['sourceStatus'],
    };
  } catch {
    return undefined;
  }
}

/** Resolve private writing lineage without trusting client-supplied source IDs. */
export async function resolveScientificWritingSource(
  deps: { prisma: PrismaClient; storage: StorageAdapter },
  input: ResolveWritingSourceInput,
): Promise<ResolvedWritingSource> {
  const ownerTask = await deps.prisma.agentTask.findUnique({
    where: { id: input.ownerTaskId },
    include: { session: { include: { researchObject: { include: { workspace: true } } } } },
  });
  const ownerResearch = ownerTask?.session.researchObject;
  if (!ownerTask || ownerTask.deletedAt || ownerTask.session.deletedAt || ownerResearch?.deletedAt || ownerTask.kind !== 'workspace.guide' || !ownerResearch || ownerResearch.workspace.status !== 'active') {
    throw new Error('[blocked] Scientific writing owner scope is invalid');
  }
  const userId = ownerTask.session.userId;
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: ownerResearch.workspaceId, userId } },
  });
  if (!membership) throw new Error('[blocked] Scientific writing workspace membership was revoked');

  let sourceTaskId: string | undefined;
  let inferredArtifactId: string | undefined;
  let baseDraft: WorkspaceWritingDraft | undefined;
  if (input.baseDraft) {
    const baseTask = await deps.prisma.agentTask.findUnique({
      where: { id: input.baseDraft.baseDraftTaskId },
      include: { session: true },
    });
    baseDraft = baseTask && !baseTask.deletedAt && baseTask.kind === 'workspace.guide' && baseTask.status === 'succeeded'
      && baseTask.session.userId === userId && baseTask.session.researchObjectId === ownerResearch.id
      ? parseStoredWritingDraft(baseTask.result) : undefined;
    sourceTaskId = baseDraft?.sourceTaskId;
    if (!sourceTaskId) throw new Error('[blocked] Scientific writing base draft is outside the authorized research scope');
  } else if (input.writingSource) {
    const selected = await deps.prisma.ingestionTask.findUnique({
      where: { id: input.writingSource.ingestionTaskId },
      include: { batch: true, artifact: true },
    });
    if (!selected || selected.artifact.deletedAt || selected.batch.userId !== userId || selected.batch.researchObjectId !== ownerResearch.id
      || selected.artifact.workspaceId !== ownerResearch.workspaceId) {
      throw new Error('[blocked] Scientific writing source is outside the authorized research scope');
    }
    if (!selected.agentTaskId) throw new WritingSourceChoiceError('unavailable');
    sourceTaskId = selected.agentTaskId;
  } else {
    // Count documents, not recent attempts: one PDF may have many analyses.
    // An unfinished second document is still ambiguous when no source is chosen.
    const sources = await deps.prisma.ingestionTask.groupBy({
      by: ['artifactId'],
      where: {
        batch: { userId, researchObjectId: ownerResearch.id },
        artifact: { workspaceId: ownerResearch.workspaceId, deletedAt: null },
      },
      orderBy: { artifactId: 'asc' },
      take: 2,
    });
    if (sources.length > 1) throw new WritingSourceChoiceError('multiple');
    if (!sources.length) throw new WritingSourceChoiceError('unavailable');
    inferredArtifactId = sources[0]!.artifactId;
  }

  const candidates = sourceTaskId
    ? [await deps.prisma.agentTask.findUnique({
        where: { id: sourceTaskId },
        include: { session: true, ingestionTask: { include: { batch: true, artifact: true } } },
      })]
    : await deps.prisma.agentTask.findMany({
        where: {
          kind: 'sdf.extract',
          status: 'succeeded',
          deletedAt: null, session: { userId, researchObjectId: ownerResearch.id },
          ingestionTask: { artifactId: inferredArtifactId },
        },
        include: { session: true, ingestionTask: { include: { batch: true, artifact: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      });
  for (const candidate of candidates) {
    if (!candidate || candidate.deletedAt || candidate.ingestionTask?.artifact.deletedAt || candidate.kind !== 'sdf.extract' || candidate.status !== 'succeeded'
      || candidate.session.userId !== userId || candidate.session.researchObjectId !== ownerResearch.id) continue;
    const extractionResult = record(candidate.result);
    try {
      const reference = parseDocumentSourceMapReference(extractionResult.sourceMapRef);
      let ingestionTask = candidate.ingestionTask;
      if (!baseDraft && input.writingSource && ingestionTask?.id !== input.writingSource.ingestionTaskId) {
        throw new WritingSourceChoiceError('unavailable');
      }
      if (!ingestionTask && sourceTaskId) {
        const payload = record(candidate.payload);
        if (payload.artifactId !== reference.artifactId || payload.researchObjectId !== ownerResearch.id) continue;
        ingestionTask = await deps.prisma.ingestionTask.findFirst({
          where: {
            artifactId: reference.artifactId,
            batch: { userId, researchObjectId: ownerResearch.id },
          },
          include: { batch: true, artifact: true },
          orderBy: { updatedAt: 'desc' },
        });
      }
      if (!ingestionTask || ingestionTask.batch.userId !== userId
        || ingestionTask.batch.researchObjectId !== ownerResearch.id
        || ingestionTask.artifact.workspaceId !== ownerResearch.workspaceId
        || reference.parserStatus !== 'succeeded' || reference.artifactId !== ingestionTask.artifactId
        || reference.contentHash !== ingestionTask.artifact.blobSha256) continue;
      const sourceMap = await loadDocumentSourceMapReference(deps.storage, reference);
      if (baseDraft?.citations.some((citation) => {
        if (citation.sourceLocator.artifactId !== sourceMap.artifactId
          || citation.sourceLocator.contentHash !== sourceMap.contentHash
          || !citation.sourceLocator.charRange) return true;
        const block = resolveSourceLocator(sourceMap, citation.sourceLocator);
        return block.text?.slice(citation.sourceLocator.charRange.start, citation.sourceLocator.charRange.end) !== citation.quote;
      })) {
        throw new Error('[blocked] Scientific writing base citations do not match the authorized source');
      }
      return {
        userId,
        researchObjectId: ownerResearch.id,
        workspaceId: ownerResearch.workspaceId,
        sourceTaskId: candidate.id,
        researchTitle: ownerResearch.title,
        sourceMap,
        extractionResult,
        ...(baseDraft ? { baseDraft } : {}),
      };
    } catch {
      if (baseDraft) throw new Error('[blocked] Scientific writing base source is no longer available');
      if (input.writingSource) throw new WritingSourceChoiceError('unavailable');
    }
  }
  throw new WritingSourceChoiceError('unavailable');
}

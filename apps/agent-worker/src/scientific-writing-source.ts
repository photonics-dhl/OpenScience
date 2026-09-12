import type { PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import {
  loadDocumentSourceMapReference,
  parseDocumentSourceMapReference,
  resolveSourceLocator,
  validateSourceLocator,
  type DocumentSourceMap,
  type WorkspaceWritingDraft,
  type WorkspaceWritingDraftInput,
} from '@openscience/domain';

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
  if (!ownerTask || ownerTask.kind !== 'workspace.guide' || !ownerResearch || ownerResearch.workspace.status !== 'active') {
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
    baseDraft = baseTask && baseTask.kind === 'workspace.guide' && baseTask.status === 'succeeded'
      && baseTask.session.userId === userId && baseTask.session.researchObjectId === ownerResearch.id
      ? parseStoredWritingDraft(baseTask.result) : undefined;
    sourceTaskId = baseDraft?.sourceTaskId;
    if (!sourceTaskId) throw new Error('[blocked] Scientific writing base draft is outside the authorized research scope');
  } else if (input.writingSource) {
    const selected = await deps.prisma.ingestionTask.findUnique({
      where: { id: input.writingSource.ingestionTaskId },
      include: { batch: true, artifact: true },
    });
    if (!selected || selected.batch.userId !== userId || selected.batch.researchObjectId !== ownerResearch.id
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
        artifact: { workspaceId: ownerResearch.workspaceId },
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
          session: { userId, researchObjectId: ownerResearch.id },
          ingestionTask: { artifactId: inferredArtifactId },
        },
        include: { session: true, ingestionTask: { include: { batch: true, artifact: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      });
  for (const candidate of candidates) {
    if (!candidate || candidate.kind !== 'sdf.extract' || candidate.status !== 'succeeded'
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

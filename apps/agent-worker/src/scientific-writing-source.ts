import { hasSingleReviewedVisualSource, readVisualNarrativeSource } from '@openscience/domain';
export { hasSingleReviewedVisualSource, readVisualNarrativeSource };
type NarrativeReader = Parameters<typeof readVisualNarrativeSource>[0];
type NarrativeScope = Parameters<typeof readVisualNarrativeSource>[1];
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
import { createWritingSourcePacket, type WritingSourcePacket, type WritingSourceSegment } from './citation-management';

export interface VisualNarrativeSource {
  versionSdf: Record<string, unknown>;
  reviewedAnalysis: Record<string, unknown>;
  scientificReview: { status: string; fieldReviews: unknown; needsMoreEvidence: unknown };
  sourceContext: WritingSourcePacket;
}

/** Model-only view: retain every excerpt and its reliability metadata; full locators stay in the server context. */
export function projectVisualNarrativeSource(source: VisualNarrativeSource) {
  const origins: WritingSourcePacket['excerpts'][number]['origin'][] = [];
  const originIndices = new Map<string, number>();
  const excerpts = source.sourceContext.excerpts.map(excerpt => {
    const key = JSON.stringify([excerpt.origin.kind, excerpt.origin.parser, excerpt.origin.confidence]);
    let originIndex = originIndices.get(key);
    if (originIndex === undefined) {
      originIndex = origins.length;
      origins.push({ ...excerpt.origin });
      originIndices.set(key, originIndex);
    }
    return { id: excerpt.id, text: excerpt.text, page: excerpt.sourceLocator.page, originIndex };
  });
  return {
    versionSdf: source.versionSdf, reviewedAnalysis: source.reviewedAnalysis, scientificReview: source.scientificReview,
    sourceContext: { excerpts, origins, coverage: source.sourceContext.coverage },
  };
}


type VisualSourceEvidence = { artifactId: string; contentHash: string; locator: unknown };

function figureAndTableReferences(text: string): string[] {
  return [...text.matchAll(/\b(Fig(?:ure)?s?\.?|Tables?|Tab\.)\s*([A-Z]?\d+[A-Z]?|[IVX]+)\b/giu)]
    .map(match => `${/^fig/iu.test(match[1]!) ? 'figure' : 'table'}:${match[2]!.toLowerCase().replace(/(?<=\d)[a-z]$/u, '')}`);
}

/** Re-read context near the current Evidence, including late notation sections and linked figure/table paragraphs.
 * Selection changes neither the Evidence nor its valid binding IDs. Preserve complete parser excerpts and coverage. */
export function selectVisualSourceContext(sourceMap: DocumentSourceMap, extractionResult: unknown,
  evidence: readonly VisualSourceEvidence[] = []): WritingSourcePacket {
  const anchors = evidence.map(row => {
    if (row.artifactId !== sourceMap.artifactId || row.contentHash !== sourceMap.contentHash)
      throw new Error('[blocked] Illustration context evidence does not belong to the reviewed source');
    const locator = validateSourceLocator(row.locator);
    resolveSourceLocator(sourceMap, locator);
    return locator;
  });
  const blockOrder = new Map(sourceMap.pages.flatMap(page => page.blocks).map((block, index) => [block.id, index]));
  return createWritingSourcePacket(sourceMap, extractionResult, { maxCharacters: 18_000, prioritize: segments => {
    const inDocumentOrder = [...segments].sort((a, b) => (blockOrder.get(a.block.id)! - blockOrder.get(b.block.id)!) || a.start - b.start);
    const physicalOrder = (a: WritingSourceSegment, b: WritingSourceSegment) => a.page - b.page
      || a.block.boundingBox.y - b.block.boundingBox.y || a.block.boundingBox.x - b.block.boundingBox.x
      || blockOrder.get(a.block.id)! - blockOrder.get(b.block.id)!;
    const priority = new Map<WritingSourceSegment, number>();
    const prefer = (index: number, rank: number) => {
      const excerpt = inDocumentOrder[index];
      if (excerpt) priority.set(excerpt, Math.min(priority.get(excerpt) ?? Infinity, rank));
    };
    const nearby = (index: number, rank: number) => {
      prefer(index - 1, rank); prefer(index, rank); prefer(index + 1, rank);
    };
    inDocumentOrder.forEach((excerpt, index) => {
      if (anchors.some(locator => locator.blockId === excerpt.block.id
        && (!locator.charRange || (locator.charRange.start < excerpt.end && locator.charRange.end > excerpt.start)))) nearby(index, 3);
      // A notation/coordinate definition heading can live in a flattened paragraph or table caption.
      // This is structural navigation, not a paper-specific keyword or a new scientific analysis.
      if (/(?:^|\n)\s*(?:(?:Table|Tab\.)\s*(?:[A-Z]?\d+|[IVX]+)\s*[.:|]\s*)?(?:Notations?|Symbols?|Coordinate (?:systems?|definitions?)|Definition of symbols)\s*(?:\n|$)/iu.test(excerpt.text)) {
        nearby(index, 0);
        // Definition tables can follow explanatory text/page numbers and continue on the next page.
        // Docling appends tables after page text, so delimit this section by page geometry, not array adjacency.
        const nextHeading = inDocumentOrder.filter(candidate => candidate.block.kind === 'heading'
          && candidate.block.id !== excerpt.block.id && physicalOrder(candidate, excerpt) > 0).sort(physicalOrder)[0];
        inDocumentOrder.forEach((candidate, candidateIndex) => {
          if (candidate.block.kind === 'table' && physicalOrder(candidate, excerpt) > 0
            && (!nextHeading || physicalOrder(candidate, nextHeading) < 0)) prefer(candidateIndex, 0);
        });
      }
    });
    // Follow explicit references in the selected surroundings, then references in those captions
    // (e.g. a main figure referring to its supplement). Do not infer relevance from scientific nouns.
    for (let hop = 0; hop < 2; hop++) {
      const references = new Set(inDocumentOrder.filter(excerpt => (priority.get(excerpt) ?? Infinity) <= 3)
        .flatMap(excerpt => figureAndTableReferences(excerpt.text)));
      inDocumentOrder.forEach((excerpt, index) => {
        const referenced = figureAndTableReferences(excerpt.text).some(reference => references.has(reference));
        const nearEvidencePage = anchors.some(locator => locator.page !== undefined && Math.abs(locator.page - excerpt.page) <= 1);
        if (!referenced && !(nearEvidencePage && excerpt.block.kind === 'caption')) return;
        // Repeated in-text mentions must not crowd out a late original caption and its definitions.
        // Prefer classified captions; retain a caption inside an OCR paragraph as a fallback.
        if (excerpt.block.kind === 'caption') {
          prefer(index, 1);
          const captionReferences = new Set(figureAndTableReferences(excerpt.text));
          for (const neighborIndex of [index - 1, index + 1]) {
            const neighbor = inDocumentOrder[neighborIndex];
            // An adjacent paragraph explicitly explaining this figure belongs with its caption.
            const explainsCaption = neighbor && figureAndTableReferences(neighbor.text).some(reference => captionReferences.has(reference));
            prefer(neighborIndex, explainsCaption ? 1 : 2);
          }
        } else if (/(?:^|\n)\s*(?:Fig(?:ure)?\.?|Table|Tab\.)\s*(?:[A-Z]?\d+[A-Z]?|[IVX]+)\s*[.:|]/iu.test(excerpt.text)) nearby(index, 3);
        else prefer(index, 4);
      });
    }
    // Complete bound paragraphs already travel separately as sourcePassages. Keep their surrounding
    // definitions/captions ahead of duplicate context. An absent range does not prove full coverage.
    for (const excerpt of inDocumentOrder) {
      if (excerpt.block.kind === 'paragraph' && anchors.some(locator => locator.blockId === excerpt.block.id
        && locator.charRange !== undefined && locator.charRange.start <= excerpt.start && locator.charRange.end >= excerpt.end))
        priority.set(excerpt, Math.max(priority.get(excerpt) ?? 3, 3));
    }
    return priority;
  } });
}

/** Reuse parser output and the completed review. Excerpts are context, while scene facts still require exact Claim/Evidence bindings. */
export async function resolveVisualNarrativeSource(deps: { prisma: NarrativeReader; storage: StorageAdapter }, scope: NarrativeScope,
  evidence: readonly VisualSourceEvidence[] = []) {
  const source = await readVisualNarrativeSource(deps.prisma, scope);
  const sourceMap = await loadDocumentSourceMapReference(deps.storage, source.reference);
  const context: VisualNarrativeSource = {
    versionSdf: source.versionSdf, reviewedAnalysis: source.reviewedAnalysis, scientificReview: source.scientificReview,
    sourceContext: selectVisualSourceContext(sourceMap, source.result, evidence),
  };
  return { identity: source.identity, context, reference: source.reference, sourceMap };
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

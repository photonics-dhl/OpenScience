import { isDeepStrictEqual } from 'node:util';
import { validateSdfDraftCore, SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { parseReviewedClaimSuggestions } from './reviewed-claim-suggestions';
import { IngestionError } from './errors';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
type AutomaticIngestionSource = {
  artifactId: string; artifact: { blobSha256: string };
  agentTask: { id: string; status: string; result: unknown } | null;
};
export type HermesIngestionReviewStage = 'source_composition' | 'source_review';

function automaticSourceReference(task: AutomaticIngestionSource, value: unknown) {
  try {
    const source = parseDocumentSourceMapReference(value);
    if (source.parserStatus !== 'succeeded' || source.artifactId !== task.artifactId || source.contentHash !== task.artifact.blobSha256)
      throw new Error('SourceMap identity does not match the ingestion artifact');
    return source;
  } catch (error) {
    throw new IngestionError('VALIDATION_ERROR', 'Hermes scientific review source changed or is unavailable', error);
  }
}

/** Consume the existing scientific review; this performs no new paper analysis. */
export function automaticIngestionReview(task: AutomaticIngestionSource) {
  const result = record(task.agentTask?.result);
  const review = record(result.scientificReview);
  const core = record(result.core);
  const segments = record(result.evidenceSegments);
  const claims = parseReviewedClaimSuggestions(result.reviewedClaimSuggestions,
    Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, Array.isArray(segments[field]) ? segments[field].length : 0])));
  if (task.agentTask?.status !== 'succeeded' || result.canonicalExtractionContract !== 'grounded-passages-v2'
    || review.contractVersion !== '5' || review.status !== 'review_received'
    || result.reason || Object.keys(record(result.fieldDiagnostics)).length
    || !validateSdfDraftCore(core).ok || SDF_CORE_FIELDS.some(field => typeof core[field] !== 'string' || !String(core[field]).trim())
    || !claims?.length || typeof review.responseHash !== 'string' || !/^[a-f0-9]{64}$/.test(review.responseHash)) {
    throw new IngestionError('VALIDATION_ERROR', 'Hermes requires a completed source-grounded scientific review and its reviewed Claims');
  }
  automaticSourceReference(task, result.sourceMapRef);
  return { core: core as Record<string, string>, claims, agentTaskId: task.agentTask.id, responseHash: review.responseHash };
}

/** Select only the two existing upgrade operations; a failed v5 review is never retried automatically. */
export function automaticIngestionReviewStage(task: AutomaticIngestionSource): 'ready' | HermesIngestionReviewStage {
  try { automaticIngestionReview(task); return 'ready'; }
  catch (error) {
    const result = record(task.agentTask?.result);
    const review = record(result.scientificReview);
    const core = record(result.core);
    if (task.agentTask?.status !== 'succeeded' || review.contractVersion === '5'
      || result.canonicalExtractionContract !== 'grounded-passages-v2') throw error;
    automaticSourceReference(task, result.sourceMapRef);
    if (!('semanticStage' in review)) return 'source_composition';
    const stage = record(review.semanticStage);
    const stageSource = record(stage.source);
    if (!['semantic_reduce', 'source_bridge'].includes(String(stage.kind))
      || stageSource.artifactId !== task.artifactId || stageSource.contentHash !== task.artifact.blobSha256 || !validateSdfDraftCore(core).ok
      || SDF_CORE_FIELDS.some(field => typeof core[field] !== 'string' || !String(core[field]).trim())
      || result.reason || Object.keys(record(result.fieldDiagnostics)).length) throw error;
    return 'source_review';
  }
}

export function requireUnchangedAutomaticCore(review: ReturnType<typeof automaticIngestionReview>, core: unknown): void {
  if (!isDeepStrictEqual(review.core, core)) throw new IngestionError('VALIDATION_ERROR', 'Hermes must preserve the reviewed six-dimensional content');
}

import { SDF_CORE_FIELDS, validateSdfDraftCore } from '@openscience/sdf-schema';
import { readNativeAgentExecution, nativeAgentTerminalResult } from '../agent/native-agent-execution';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { IngestionError } from './errors';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const blocked = (): never => { throw new IngestionError('VALIDATION_ERROR', 'Native paper author candidate binding changed'); };

/** Structural proof of the actual completed author output, without inventing a semantic stage or new source hash. */
export function requireNativePaperAuthor(task: { id: string; status: string; result: unknown; executionAttempt?: number }) {
  const marker = readNativeAgentExecution(task.result);
  const cp = marker?.checkpoint;
  const result = task.result;
  if (task.status !== 'succeeded' || marker?.profile !== 'paper-author' || !cp || cp.taskId !== task.id
    || (task.executionAttempt !== undefined && cp.executionAttempt !== task.executionAttempt)
    || !record(result) || !record(result.scientificReview) || !record(result.core)
    || result.canonicalExtractionContract !== 'grounded-passages-v2' || result.reason
    || (record(result.fieldDiagnostics) && Object.keys(result.fieldDiagnostics).length)
    || !validateSdfDraftCore(result.core).ok) return blocked();
  nativeAgentTerminalResult({ ...task, kind: 'sdf.extract' } as never, 'succeeded', result);
  const review = result.scientificReview;
  const core = result.core;
  const fields = review.fieldReviews;
  if (review.contractVersion !== '5' || review.status !== 'review_received' || !record(fields)
    || Object.keys(fields).length !== SDF_CORE_FIELDS.length
    || !Array.isArray(review.draftClaims) || !review.draftClaims.length
    || SDF_CORE_FIELDS.some(field => {
      const value = fields[field];
      return !record(value) || typeof core[field] !== 'string' || !core[field].trim() || value.summary !== core[field]
        || !['accepted', 'revised'].includes(String(value.verdict)) || !Array.isArray(value.issues)
        || !Array.isArray(value.sourcePassageIds) || !value.sourcePassageIds.length
        || value.sourcePassageIds.some(id => typeof id !== 'string' || !/^P\d{5,}$/u.test(id));
    }) || review.draftClaims.some(claim => {
      if (!record(claim) || typeof claim.clientKey !== 'string' || !claim.clientKey.trim()
        || typeof claim.statement !== 'string' || !claim.statement.trim() || !SDF_CORE_FIELDS.includes(claim.sourceField as never)
        || !Array.isArray(claim.conditions) || !Array.isArray(claim.limitations) || !Array.isArray(claim.sourceBindings)
        || !claim.sourceBindings.length) return true;
      const source = fields[String(claim.sourceField)] as Record<string, unknown>;
      return claim.sourceBindings.some(binding => !record(binding) || !(source.sourcePassageIds as unknown[]).includes(binding.sourcePassageId))
        || !claim.sourceBindings.some(binding => record(binding) && binding.relation === 'supports');
    })) return blocked();
  return { marker, checkpoint: cp, sourceMapRef: parseDocumentSourceMapReference(result.sourceMapRef) };
}

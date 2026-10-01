import type { IngestionTaskDetail } from './api';

const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

/** Missing metadata is unknown; blank fields do not imply failed PDF/OCR. */
export function hasEmptyIngestionCore(task: Pick<IngestionTaskDetail['task'], 'state' | 'result'>): boolean {
  if (task.state !== 'needs_review' || !task.result) return false;
  const core = task.result.core;
  return Boolean(core && typeof core === 'object' && !Array.isArray(core)
    && fields.every(field => typeof (core as Record<string, unknown>)[field] === 'string'
      && !(core as Record<string, string>)[field].trim()));
}

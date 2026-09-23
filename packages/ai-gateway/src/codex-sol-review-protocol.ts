import { validateScienceReviewRequest, validateScienceReviewResult, type IllustrationImageReviewSource,
  type IllustrationImageReviewAttachmentRecord, type ScienceReviewErrorCode } from './science-review-protocol';

export const CODEX_SOL_REVIEW_PROVIDER = 'codex-sol-image-review' as const;
export const CODEX_SOL_REVIEW_MODEL = 'gpt-5.6-sol' as const;
export const CODEX_SOL_REVIEW_EFFORT = 'high' as const;

export interface CodexSolReviewRequest {
  schemaVersion: 1;
  provider: typeof CODEX_SOL_REVIEW_PROVIDER;
  model: typeof CODEX_SOL_REVIEW_MODEL;
  reasoningEffort: typeof CODEX_SOL_REVIEW_EFFORT;
  id: string;
  prompt: string;
  promptHash: string;
  source: IllustrationImageReviewSource;
  attachments: [IllustrationImageReviewAttachmentRecord];
  createdAt: number;
  deadlineAt: number;
}

export interface CodexSolReviewResult {
  schemaVersion: 1;
  provider: typeof CODEX_SOL_REVIEW_PROVIDER;
  model: typeof CODEX_SOL_REVIEW_MODEL;
  id: string;
  promptHash: string;
  status: 'succeeded' | 'failed' | 'uncertain';
  responseHash?: string;
  errorCode?: ScienceReviewErrorCode;
}

const fail = (): never => { throw new Error('INVALID_OUTPUT'); };

/** Reuse the already bounded image review contract; the additional fields pin exact model execution. */
export function validateCodexSolReviewRequest(value: unknown, now?: number): CodexSolReviewRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'attachments,createdAt,deadlineAt,id,model,prompt,promptHash,provider,reasoningEffort,schemaVersion,source'
    || v.schemaVersion !== 1 || v.provider !== CODEX_SOL_REVIEW_PROVIDER || v.model !== CODEX_SOL_REVIEW_MODEL
    || v.reasoningEffort !== CODEX_SOL_REVIEW_EFFORT) return fail();
  const { model: _model, reasoningEffort: _effort, ...compatible } = v;
  validateScienceReviewRequest({ ...compatible, schemaVersion: 3, provider: 'chatgpt-web-science-review' }, now);
  return v as unknown as CodexSolReviewRequest;
}

export function validateCodexSolReviewResult(value: unknown): CodexSolReviewResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['schemaVersion', 'provider', 'model', 'id', 'promptHash', 'status', 'responseHash', 'errorCode'].includes(key))
    || v.schemaVersion !== 1 || v.provider !== CODEX_SOL_REVIEW_PROVIDER || v.model !== CODEX_SOL_REVIEW_MODEL) return fail();
  const { model: _model, ...compatible } = v;
  validateScienceReviewResult({ ...compatible, provider: 'chatgpt-web-science-review' });
  return v as unknown as CodexSolReviewResult;
}

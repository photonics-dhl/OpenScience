import { sha256Text, type OcrAuthorizationContext, type OcrSourceIdentity } from './ocr';

// Leave room for the browser runner's fixed safety preface inside ChatGPT's
// 64 KiB submission boundary.
export const SCIENCE_REVIEW_MAX_PROMPT_CHARS = 60 * 1024;
export const SCIENCE_REVIEW_MAX_RESPONSE_BYTES = 64 * 1024;
export const SCIENCE_REVIEW_MAX_JSON_BYTES = 96 * 1024;
export const SCIENCE_REVIEW_MAX_DEADLINE_MS = 600_000;
export const SCIENCE_REVIEW_READY_MAX_AGE_MS = 60_000;
export const SCIENCE_REVIEW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ScienceReviewSource extends OcrSourceIdentity {
  candidateHash: string;
  sourceMapHash: string;
}

export interface ScienceReviewInput {
  requestId: string;
  authorizationContext: OcrAuthorizationContext;
  source: ScienceReviewSource;
  prompt: string;
}

export interface ScienceReviewRequest {
  schemaVersion: 1;
  provider: 'chatgpt-web-science-review';
  id: string;
  prompt: string;
  promptHash: string;
  createdAt: number;
  deadlineAt: number;
  source: ScienceReviewSource;
}

export type ScienceReviewErrorCode = 'EXECUTION_FAILED' | 'UNCERTAIN' | 'EXPIRED' | 'INVALID_OUTPUT';
export interface ScienceReviewResultRecord {
  schemaVersion: 1;
  provider: 'chatgpt-web-science-review';
  id: string;
  promptHash: string;
  responseHash?: string;
  status: 'succeeded' | 'failed' | 'uncertain';
  errorCode?: ScienceReviewErrorCode;
}

export interface ScienceReviewProviderResult {
  text: string;
  promptHash: string;
  responseHash: string;
}

export interface ScienceReviewProvider {
  readonly name: string;
  readonly model: string;
  review(input: ScienceReviewInput): Promise<ScienceReviewProviderResult>;
}

const invalid = (): never => { throw new Error('INVALID_OUTPUT'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function validSource(value: unknown): value is ScienceReviewSource {
  const source = record(value);
  return Object.keys(source).sort().join(',') === 'artifactId,candidateHash,documentSha256,sourceMapHash'
    && typeof source.artifactId === 'string' && source.artifactId.length > 0 && source.artifactId.length <= 256
    && hash(source.documentSha256) && hash(source.candidateHash) && hash(source.sourceMapHash);
}

export function validateScienceReviewRequest(value: unknown, now?: number): ScienceReviewRequest {
  const v = record(value);
  if (Object.keys(v).sort().join(',') !== 'createdAt,deadlineAt,id,prompt,promptHash,provider,schemaVersion,source'
    || v.schemaVersion !== 1 || v.provider !== 'chatgpt-web-science-review'
    || typeof v.id !== 'string' || !SCIENCE_REVIEW_ID_PATTERN.test(v.id)
    || typeof v.prompt !== 'string' || !v.prompt.trim() || v.prompt.length > SCIENCE_REVIEW_MAX_PROMPT_CHARS
    || !hash(v.promptHash) || sha256Text(v.prompt) !== v.promptHash
    || !Number.isSafeInteger(v.createdAt) || (v.createdAt as number) < 0
    || !Number.isSafeInteger(v.deadlineAt) || (v.deadlineAt as number) <= (v.createdAt as number)
    || (v.deadlineAt as number) - (v.createdAt as number) > SCIENCE_REVIEW_MAX_DEADLINE_MS
    || !validSource(v.source)) return invalid();
  if (now !== undefined && ((v.deadlineAt as number) <= now || (v.createdAt as number) > now)) throw new Error('EXPIRED');
  return v as unknown as ScienceReviewRequest;
}

export function validateScienceReviewResult(value: unknown): ScienceReviewResultRecord {
  const v = record(value);
  if (Object.keys(v).some((key) => !['schemaVersion', 'provider', 'id', 'promptHash', 'responseHash', 'status', 'errorCode'].includes(key))
    || v.schemaVersion !== 1 || v.provider !== 'chatgpt-web-science-review'
    || typeof v.id !== 'string' || !SCIENCE_REVIEW_ID_PATTERN.test(v.id) || !hash(v.promptHash)
    || !['succeeded', 'failed', 'uncertain'].includes(String(v.status))
    || (v.status === 'succeeded' ? !hash(v.responseHash) || v.errorCode !== undefined : v.responseHash !== undefined)
    || (v.errorCode !== undefined && !['EXECUTION_FAILED', 'UNCERTAIN', 'EXPIRED', 'INVALID_OUTPUT'].includes(String(v.errorCode)))) return invalid();
  return v as unknown as ScienceReviewResultRecord;
}

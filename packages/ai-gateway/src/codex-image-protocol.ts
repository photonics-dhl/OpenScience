import { sha256Text } from './ocr';
export const CODEX_IMAGE_MAX_JSON_BYTES = 16 * 1024;
export const CODEX_IMAGE_MAX_PNG_BYTES = 10 * 1024 * 1024;
export const CODEX_IMAGE_MAX_DEADLINE_MS = 600_000;
export const CHATGPT_WEB_IMAGE_MAX_DEADLINE_MS = 8 * 900_000 + 300_000;
export const CODEX_IMAGE_READY_MAX_AGE_MS = 60_000;
export const CODEX_IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ImageSpoolProvider = 'codex' | 'chatgpt-web';
/** Planning allowance derived from the existing JSON transport bound, not an editorial character limit. */
export function imageSpoolRequestByteUpperBound(prompt: string): number {
  return Buffer.byteLength(JSON.stringify({ schemaVersion: 1, provider: 'chatgpt-web', id: '0'.repeat(36), prompt,
    promptHash: '0'.repeat(64), reference: { contentHash: '0'.repeat(64), role: 'style' },
    createdAt: Number.MAX_SAFE_INTEGER, deadlineAt: Number.MAX_SAFE_INTEGER }), 'utf8');
}
export interface ImageReferenceMetadata { contentHash: string; role: 'style' }
export interface CodexImageRequest { schemaVersion: 1; provider?: ImageSpoolProvider; id: string; prompt: string; promptHash: string; reference?: ImageReferenceMetadata; createdAt: number; deadlineAt: number }
export type CodexImageErrorCode = 'EXECUTION_FAILED' | 'UNCERTAIN' | 'EXPIRED' | 'INVALID_OUTPUT' | 'USAGE_LIMIT';
export interface CodexImageResult { schemaVersion: 1; provider?: ImageSpoolProvider; id: string; promptHash: string; status: 'succeeded' | 'failed' | 'uncertain'; errorCode?: CodexImageErrorCode }
const invalid = (): never => { throw new Error('INVALID_OUTPUT'); };
function referenceMetadata(value: unknown): ImageReferenceMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['contentHash', 'role'].includes(key)) || typeof v.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.contentHash) || v.role !== 'style') return invalid();
  return { contentHash: v.contentHash, role: 'style' };
}
/** Preserve existing text-only identities; bind reference bytes through their validated digest. */
export function imagePromptHash(prompt: string, reference?: ImageReferenceMetadata): string {
  return reference === undefined ? sha256Text(prompt) : sha256Text(JSON.stringify({ schemaVersion: 1, prompt, reference: referenceMetadata(reference) }));
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || typeof v.id !== 'string' || !CODEX_IMAGE_ID_PATTERN.test(v.id) || typeof v.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.promptHash)) return invalid();
  return v;
}
export function validateCodexImageRequest(value: unknown, now?: number, expectedProvider?: ImageSpoolProvider): CodexImageRequest {
  const v = record(value);
  if (Buffer.byteLength(JSON.stringify(v), 'utf8') > CODEX_IMAGE_MAX_JSON_BYTES) return invalid();
  const provider = v.provider === undefined ? 'codex' : v.provider;
  const maximumDeadline = provider === 'chatgpt-web' ? CHATGPT_WEB_IMAGE_MAX_DEADLINE_MS : CODEX_IMAGE_MAX_DEADLINE_MS;
  const reference = v.reference === undefined ? undefined : referenceMetadata(v.reference);
  if (Object.keys(v).some(k => !['schemaVersion', 'provider', 'id', 'prompt', 'promptHash', 'reference', 'createdAt', 'deadlineAt'].includes(k)) || !['codex', 'chatgpt-web'].includes(provider as string) || (expectedProvider !== undefined && provider !== expectedProvider) || (expectedProvider === 'chatgpt-web' && v.provider === undefined) || (reference !== undefined && provider !== 'chatgpt-web') || typeof v.prompt !== 'string' || !v.prompt.trim() || imagePromptHash(v.prompt, reference) !== v.promptHash || typeof v.createdAt !== 'number' || !Number.isSafeInteger(v.createdAt) || v.createdAt < 0 || typeof v.deadlineAt !== 'number' || !Number.isSafeInteger(v.deadlineAt) || v.deadlineAt <= v.createdAt || v.deadlineAt - v.createdAt > maximumDeadline) return invalid();
  if (now !== undefined && (v.deadlineAt <= now || v.createdAt > now)) throw new Error('EXPIRED');
  return { schemaVersion: 1, ...(v.provider !== undefined ? { provider: provider as ImageSpoolProvider } : {}), id: v.id as string, prompt: v.prompt, promptHash: v.promptHash as string, ...(reference ? { reference } : {}), createdAt: v.createdAt, deadlineAt: v.deadlineAt };
}
export function validateCodexImageResult(value: unknown, expectedProvider?: ImageSpoolProvider): CodexImageResult {
  const v = record(value);
  const provider = v.provider === undefined ? 'codex' : v.provider;
  if (Object.keys(v).some(k => !['schemaVersion', 'provider', 'id', 'promptHash', 'status', 'errorCode'].includes(k)) || !['codex', 'chatgpt-web'].includes(provider as string) || (expectedProvider !== undefined && provider !== expectedProvider) || (expectedProvider === 'chatgpt-web' && v.provider === undefined) || !['succeeded', 'failed', 'uncertain'].includes(v.status as string) || (v.errorCode !== undefined && !['EXECUTION_FAILED', 'UNCERTAIN', 'EXPIRED', 'INVALID_OUTPUT', 'USAGE_LIMIT'].includes(v.errorCode as string)) || (v.status === 'succeeded' && v.errorCode !== undefined)) return invalid();
  return v as unknown as CodexImageResult;
}

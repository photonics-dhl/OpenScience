import { sha256Text } from './ocr';
export const CODEX_IMAGE_MAX_JSON_BYTES = 16 * 1024;
export const CODEX_IMAGE_MAX_PNG_BYTES = 10 * 1024 * 1024;
export const CODEX_IMAGE_MAX_DEADLINE_MS = 600_000;
export const CODEX_IMAGE_READY_MAX_AGE_MS = 60_000;
export const CODEX_IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface CodexImageRequest { schemaVersion: 1; id: string; prompt: string; promptHash: string; createdAt: number; deadlineAt: number }
export type CodexImageErrorCode = 'EXECUTION_FAILED' | 'UNCERTAIN' | 'EXPIRED' | 'INVALID_OUTPUT';
export interface CodexImageResult { schemaVersion: 1; id: string; promptHash: string; status: 'succeeded' | 'failed' | 'uncertain'; errorCode?: CodexImageErrorCode }
const invalid = (): never => { throw new Error('INVALID_OUTPUT'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || typeof v.id !== 'string' || !CODEX_IMAGE_ID_PATTERN.test(v.id) || typeof v.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.promptHash)) return invalid();
  return v;
}
export function validateCodexImageRequest(value: unknown, now?: number): CodexImageRequest {
  const v = record(value);
  if (Object.keys(v).some(k => !['schemaVersion', 'id', 'prompt', 'promptHash', 'createdAt', 'deadlineAt'].includes(k)) || typeof v.prompt !== 'string' || !v.prompt.trim() || v.prompt.length > 1500 || sha256Text(v.prompt) !== v.promptHash || typeof v.createdAt !== 'number' || !Number.isSafeInteger(v.createdAt) || v.createdAt < 0 || typeof v.deadlineAt !== 'number' || !Number.isSafeInteger(v.deadlineAt) || v.deadlineAt <= v.createdAt || v.deadlineAt - v.createdAt > CODEX_IMAGE_MAX_DEADLINE_MS) return invalid();
  if (now !== undefined && (v.deadlineAt <= now || v.createdAt > now)) throw new Error('EXPIRED');
  return { schemaVersion: 1, id: v.id as string, prompt: v.prompt, promptHash: v.promptHash as string, createdAt: v.createdAt, deadlineAt: v.deadlineAt };
}
export function validateCodexImageResult(value: unknown): CodexImageResult {
  const v = record(value);
  if (Object.keys(v).some(k => !['schemaVersion', 'id', 'promptHash', 'status', 'errorCode'].includes(k)) || !['succeeded', 'failed', 'uncertain'].includes(v.status as string) || (v.errorCode !== undefined && !['EXECUTION_FAILED', 'UNCERTAIN', 'EXPIRED', 'INVALID_OUTPUT'].includes(v.errorCode as string)) || (v.status === 'succeeded' && v.errorCode !== undefined)) return invalid();
  return v as unknown as CodexImageResult;
}

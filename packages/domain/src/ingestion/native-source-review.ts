import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AgentTask, Prisma } from '@prisma/client';
import { IngestionError } from './errors';
import { nativeImageReviewProvider } from '../assets/native-image-review';

export type NativeSourceReviewIdentity = { taskId: string; ingestionTaskId: string; compositionTaskId: string;
  artifactId: string; documentSha256: string; sourceMapHash: string; maxAttempts: 1 | 2 };
export type NativeSourceReviewTarget = { provider: string; model: string; promptHash: string };
export type NativeSourceReviewResponse = { text: string; model: string; usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'other' | 'unknown' };
type AttemptBase = NativeSourceReviewIdentity & NativeSourceReviewTarget & {
  executionAttempt: number; ordinal: number; reviewedCandidateHash: string };
type Attempt = (AttemptBase & { state: 'started' }) | (AttemptBase & {
  state: 'completed'; responseHash: string; response: NativeSourceReviewResponse });
export type NativeSourceReviewCheckpoint = { mode: 'model-native'; attempts: Attempt[] };
type Submission = { identity: NativeSourceReviewIdentity; executionAttempt: number; ordinal: number;
  reviewedCandidateHash: string; target: NativeSourceReviewTarget };
const record = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === 'object' && !Array.isArray(x));
const hash = (x: unknown) => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x);
const sha = (x: string) => createHash('sha256').update(x).digest('hex');
const fail = (): never => { throw new IngestionError('VALIDATION_ERROR', '[blocked] Native source review binding changed'); };
const identityKeys = ['taskId', 'ingestionTaskId', 'compositionTaskId', 'artifactId', 'documentSha256', 'sourceMapHash', 'maxAttempts'] as const;
function validResponse(x: unknown): x is NativeSourceReviewResponse {
  return record(x) && Object.keys(x).sort().join(',') === 'finishReason,model,text,usage'
    && typeof x.text === 'string' && x.text.length > 0 && Buffer.byteLength(x.text, 'utf8') <= 131_072
    && typeof x.model === 'string' && ['stop', 'length', 'other', 'unknown'].includes(String(x.finishReason))
    && record(x.usage) && Object.keys(x.usage).sort().join(',') === 'inputTokens,outputTokens'
    && [x.usage.inputTokens, x.usage.outputTokens].every(n => Number.isSafeInteger(n) && Number(n) >= 0);
}
/** Missing is historical text/Web. A malformed marker must never reopen that legacy route. */
export function readNativeSourceReview(result: unknown): NativeSourceReviewCheckpoint | undefined {
  if (!record(result) || !Object.hasOwn(result, 'nativeSourceReview')) return undefined;
  const cp = result.nativeSourceReview;
  if (!record(cp) || Object.keys(cp).sort().join(',') !== 'attempts,mode' || cp.mode !== 'model-native'
    || !Array.isArray(cp.attempts) || cp.attempts.length > 2) return fail();
  const attempts = cp.attempts;
  for (let ordinal = 0; ordinal < attempts.length; ordinal++) {
    const a = attempts[ordinal];
    if (!record(a) || !['started', 'completed'].includes(String(a.state))
      || Object.keys(a).filter(k => k !== 'response' && k !== 'responseHash').sort().join(',')
        !== 'artifactId,compositionTaskId,documentSha256,executionAttempt,ingestionTaskId,maxAttempts,model,ordinal,promptHash,provider,reviewedCandidateHash,sourceMapHash,state,taskId'
      || !['taskId', 'ingestionTaskId', 'compositionTaskId', 'artifactId'].every(k => typeof a[k] === 'string' && a[k])
      || ![a.documentSha256, a.sourceMapHash, a.reviewedCandidateHash, a.promptHash].every(hash)
      || !Number.isSafeInteger(a.executionAttempt) || Number(a.executionAttempt) < 1 || a.ordinal !== ordinal
      || ![1, 2].includes(Number(a.maxAttempts)) || ordinal >= Number(a.maxAttempts)
      || !nativeImageReviewProvider(a.provider, a.model)) return fail();
    if (ordinal && (attempts[ordinal - 1].state !== 'completed'
      || [...identityKeys, 'reviewedCandidateHash', 'provider', 'model'].some(k => a[k] !== attempts[0][k]))) return fail();
    if (a.state === 'started' ? Object.hasOwn(a, 'response') || Object.hasOwn(a, 'responseHash')
      : !validResponse(a.response) || a.response.model !== a.model || a.responseHash !== sha(a.response.text)) return fail();
  }
  return cp as NativeSourceReviewCheckpoint;
}
/** Called only after the existing signed review resolver and policy pass in this transaction. */
export async function startNativeSourceReview(tx: Pick<Prisma.TransactionClient, 'agentTask'>, input: Submission): Promise<NativeSourceReviewResponse | undefined> {
  const task = await tx.agentTask.findUnique({ where: { id: input.identity.taskId } });
  const cp = readNativeSourceReview(task?.result);
  if (!task || task.deletedAt || task.kind !== 'sdf.extract' || task.status !== 'running'
    || task.executionAttempt !== input.executionAttempt || !cp || !Number.isSafeInteger(input.ordinal)
    || input.ordinal < 0 || input.ordinal >= input.identity.maxAttempts) return fail();
  const old = cp.attempts[input.ordinal];
  if (old) {
    if (old.state !== 'completed' || [...identityKeys].some(k => old[k] !== input.identity[k])
      || old.reviewedCandidateHash !== input.reviewedCandidateHash
      || Object.entries(input.target).some(([k, v]) => old[k as keyof NativeSourceReviewTarget] !== v)) return fail();
    return structuredClone(old.response);
  }
  if (cp.attempts.length !== input.ordinal) return fail();
  const next: Attempt = { ...input.identity, ...input.target, reviewedCandidateHash: input.reviewedCandidateHash,
    executionAttempt: input.executionAttempt, ordinal: input.ordinal, state: 'started' };
  const result = { ...task.result as Record<string, unknown>, nativeSourceReview: { mode: 'model-native', attempts: [...cp.attempts, next] } };
  readNativeSourceReview(result);
  const updated = await tx.agentTask.updateMany({ where: { id: task.id, status: 'running', deletedAt: null,
    executionAttempt: input.executionAttempt, result: { equals: task.result as Prisma.InputJsonValue } }, data: { result: result as unknown as Prisma.InputJsonObject } });
  if (updated.count !== 1) return fail();
}
/** Save the already-paid raw response before schema parsing. Revoked policy does not discard paid evidence. */
export async function completeNativeSourceReview(tx: Pick<Prisma.TransactionClient, 'agentTask'>, input: Submission, response: NativeSourceReviewResponse) {
  if (!validResponse(response)) return fail();
  const task = await tx.agentTask.findUnique({ where: { id: input.identity.taskId } });
  const cp = readNativeSourceReview(task?.result); const old = cp?.attempts[input.ordinal];
  if (!task || task.deletedAt || task.kind !== 'sdf.extract'
    || old?.state !== 'started' || old.executionAttempt !== input.executionAttempt
    || [...identityKeys].some(k => old[k] !== input.identity[k]) || old.reviewedCandidateHash !== input.reviewedCandidateHash
    || response.model !== old.model || Object.entries(input.target).some(([k, v]) => old[k as keyof NativeSourceReviewTarget] !== v)) return fail();
  const attempts = [...cp!.attempts]; attempts[input.ordinal] = { ...old, state: 'completed', responseHash: sha(response.text), response: structuredClone(response) };
  const result = { ...task.result as Record<string, unknown>, nativeSourceReview: { mode: 'model-native', attempts } };
  readNativeSourceReview(result);
  const updated = await tx.agentTask.updateMany({ where: { id: task.id, status: task.status, deletedAt: null,
    executionAttempt: task.executionAttempt, result: { equals: task.result as Prisma.InputJsonValue } }, data: { result: result as unknown as Prisma.InputJsonObject } });
  if (updated.count !== 1) return fail();
}
/** Preserve private attempts for failures; every completion-bearing public receipt must bind an actual paid response. */
export function nativeSourceReviewTerminalResult(task: AgentTask, status: string, incoming: unknown): unknown {
  const cp = readNativeSourceReview(task.result);
  if (!cp) { if (record(incoming) && Object.hasOwn(incoming, 'nativeSourceReview')) return fail(); return incoming; }
  if (record(incoming) && Object.hasOwn(incoming, 'nativeSourceReview') && !isDeepStrictEqual(incoming.nativeSourceReview, cp)) return fail();
  if (status === 'succeeded' || (record(incoming) && record(incoming.scientificReview))) {
    if (!record(incoming) || !record(incoming.scientificReview)) return fail();
    const review = incoming.scientificReview; const completed = cp.attempts.filter(a => a.state === 'completed');
    if (review.kind !== 'model_self_check') return fail();
    const last = completed.at(-1);
    const matches = (receipt: Record<string, unknown>, a: Attempt | undefined) => a?.state === 'completed'
      && ['provider', 'model', 'promptHash', 'reviewedCandidateHash'].every(k => receipt[k] === a[k as keyof AttemptBase])
      && receipt.responseHash === a.responseHash && receipt.finishReason === a.response.finishReason
      && isDeepStrictEqual(receipt.usage, a.response.usage);
    if (review.provider != null || review.model != null || review.promptHash != null || review.responseHash != null) {
      if (!matches(review, last)) return fail();
    } else if (completed.length) return fail();
    if (review.status === 'review_received' && (!last || cp.attempts.at(-1)?.state !== 'completed' || last.response.finishReason !== 'stop')) return fail();
    if (last) {
      if (!record(incoming.sourceMapRef) || incoming.sourceMapRef.artifactId !== last.artifactId
        || incoming.sourceMapRef.contentHash !== last.documentSha256 || incoming.sourceMapRef.serializedSha256 !== last.sourceMapHash
        || review.sourceAgentTaskId !== last.compositionTaskId) return fail();
    }
    if (review.rejectedOutputs !== undefined) {
      if (!Array.isArray(review.rejectedOutputs)) return fail();
      for (const receipt of review.rejectedOutputs) {
        if (!record(receipt) || !Number.isSafeInteger(receipt.structuredAttempt)) return fail();
        const a = cp.attempts[Number(receipt.structuredAttempt) - 1];
        if (a?.state !== 'completed' || ['provider', 'model', 'promptHash'].some(k => receipt[k] !== a[k as keyof NativeSourceReviewTarget])
          || receipt.responseHash !== a.responseHash || receipt.finishReason !== a.response.finishReason
          || !isDeepStrictEqual(receipt.usage, a.response.usage) || (receipt.text !== undefined && receipt.text !== a.response.text)) return fail();
      }
    }
  }
  return { ...(record(incoming) ? incoming : {}), nativeSourceReview: cp };
}

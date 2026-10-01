import { isDeepStrictEqual } from 'node:util';
import { PresentationAssetError } from './errors';
import type { GeneratedImageReview, ImageReviewIdentity } from './scene-image';
import type { Prisma } from '@prisma/client';

export type NativeImageReviewTarget = { provider: string; model: string; promptHash: string };
export type NativeImageReviewStarted = ImageReviewIdentity & NativeImageReviewTarget & {
  mode: 'model-native'; state: 'started'; executionAttempt: number;
};
export type NativeImageReviewCompleted = Omit<NativeImageReviewStarted, 'state'> & {
  state: 'completed'; review: GeneratedImageReview;
};
export type NativeImageReviewCheckpoint = { mode: 'model-native'; state: 'not_started' }
  | NativeImageReviewStarted | NativeImageReviewCompleted;

const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const fail = (): never => { throw new PresentationAssetError('VALIDATION_ERROR', 'Native image review checkpoint is invalid'); };

export function nativeImageReviewProvider(provider: unknown, model: unknown): boolean {
  return typeof provider === 'string' && /^minimax-key-[1-9]\d*-model-[1-9]\d*$/u.test(provider)
    && (model === 'MiniMax-M3' || model === 'MiniMax-M3.1-Flash-Preview');
}

/** Private task data. Missing means historical Web/Codex; malformed never means legacy. */
export function readNativeImageReviewCheckpoint(result: unknown): NativeImageReviewCheckpoint | undefined {
  if (!record(result) || !Object.hasOwn(result, 'nativeImageReview')) return undefined;
  const value = result.nativeImageReview;
  if (!record(value) || value.mode !== 'model-native') return fail();
  if (value.state === 'not_started') {
    if (Object.keys(value).sort().join(',') !== 'mode,state') return fail();
    return { mode: 'model-native', state: 'not_started' };
  }
  const keys = 'contentHash,executionAttempt,mode,model,parentIdentity,promptHash,provider,requestId,sourceEvidenceIdentity,state';
  if (!['started', 'completed'].includes(String(value.state))
    || Object.keys(value).filter(key => key !== 'review').sort().join(',') !== keys
    || (value.state === 'started' ? Object.hasOwn(value, 'review') : !record(value.review))
    || !Number.isSafeInteger(value.executionAttempt) || Number(value.executionAttempt) < 1
    || typeof value.requestId !== 'string' || !value.requestId
    || typeof value.parentIdentity !== 'string' || !value.parentIdentity
    || ![value.contentHash, value.sourceEvidenceIdentity, value.promptHash].every(hash)
    || !nativeImageReviewProvider(value.provider, value.model)) return fail();
  if (value.state === 'completed') {
    const review = value.review as Record<string, unknown>;
    if (['requestId', 'contentHash', 'sourceEvidenceIdentity', 'parentIdentity', 'promptHash', 'provider', 'model']
      .some(key => review[key] !== value[key])) return fail();
  }
  return value as unknown as NativeImageReviewCheckpoint;
}

export function nativeImageReviewMatches(checkpoint: NativeImageReviewCheckpoint | undefined,
  expected: ImageReviewIdentity, review: unknown): checkpoint is NativeImageReviewCompleted {
  return checkpoint?.state === 'completed'
    && Object.entries(expected).every(([key, value]) => checkpoint[key as keyof ImageReviewIdentity] === value)
    && isDeepStrictEqual(checkpoint.review, review);
}

/** Existing pre-generation recovery may retain only a fresh, never-submitted native role. */
export function imageReviewHasNoSubmission(result: unknown): boolean {
  if (result === null) return true;
  return record(result) && Object.keys(result).length === 1
    && readNativeImageReviewCheckpoint(result)?.state === 'not_started';
}

/** Caller revalidates existing source/write authority in the same short transaction. */
export async function startNativeImageReview(tx: Pick<Prisma.TransactionClient, 'agentTask'>,
  input: { taskId: string; executionAttempt: number; identity: ImageReviewIdentity; target: NativeImageReviewTarget }) {
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
  const checkpoint = readNativeImageReviewCheckpoint(task?.result);
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'running'
    || task.executionAttempt !== input.executionAttempt || input.identity.requestId !== task.id
    || checkpoint?.state !== 'not_started') return fail();
  const next = { mode: 'model-native' as const, state: 'started' as const, executionAttempt: input.executionAttempt,
    ...input.identity, ...input.target };
  const result = { ...task.result as Record<string, unknown>, nativeImageReview: next };
  readNativeImageReviewCheckpoint(result);
  const changed = await tx.agentTask.updateMany({ where: { id: task.id, deletedAt: null, status: 'running',
    executionAttempt: input.executionAttempt, result: { equals: task.result as Prisma.InputJsonValue } }, data: { result: result as Prisma.InputJsonObject } });
  if (changed.count !== 1) return fail();
  return next;
}

/** Must be committed together with the exact asset.imageReview, never in a separate transaction. */
export async function completeNativeImageReview(tx: Pick<Prisma.TransactionClient, 'agentTask'>,
  input: { taskId: string; executionAttempt: number; review: GeneratedImageReview }) {
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
  const checkpoint = readNativeImageReviewCheckpoint(task?.result);
  if (!task || task.deletedAt || task.status !== 'running' || task.executionAttempt !== input.executionAttempt
    || checkpoint?.state !== 'started' || checkpoint.executionAttempt !== input.executionAttempt
    || input.review.requestId !== task.id) return fail();
  const next: NativeImageReviewCompleted = { ...checkpoint, state: 'completed', review: input.review };
  const result = { ...task.result as Record<string, unknown>, nativeImageReview: next };
  readNativeImageReviewCheckpoint(result);
  const changed = await tx.agentTask.updateMany({ where: { id: task.id, deletedAt: null, status: 'running',
    executionAttempt: input.executionAttempt, result: { equals: task.result as Prisma.InputJsonValue } }, data: { result: result as unknown as Prisma.InputJsonObject } });
  if (changed.count !== 1) return fail();
  return next;
}

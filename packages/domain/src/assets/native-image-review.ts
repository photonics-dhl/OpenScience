import { isDeepStrictEqual } from 'node:util';
import { PresentationAssetError } from './errors';
import type { GeneratedImageReview, ImageReviewIdentity } from './scene-image';
import type { Prisma } from '@prisma/client';
import type { NativeAgentExecution, NativeAgentImageCheckpointReference, NativeAgentRuntimeConfig } from '../agent/native-agent-execution';

export type NativeImageReviewTarget = { provider: string; model: string; promptHash: string };
export type NativeImageReviewStarted = ImageReviewIdentity & NativeImageReviewTarget & {
  mode: 'model-native'; state: 'started'; executionAttempt: number;
};
export type NativeImageReviewCompleted = Omit<NativeImageReviewStarted, 'state'> & {
  state: 'completed'; review: GeneratedImageReview;
};
export type AgentNativeImageReviewPrepared = ImageReviewIdentity & {
  mode: 'agent-native'; state: 'prepared'; preparedAt: number; deadlineAt: number; executionAttempt: number;
  runtimeId: string; skillCatalogueId: string; provider: string; model: string; reservationLedgerId: string;
  maxTurns: 4; maxOutputTokens: 32768; maxTotalOutputTokens: 32768; maxInputBytes: number;
};
export type AgentNativeImageReviewCompleted = Omit<AgentNativeImageReviewPrepared, 'state'> & { state: 'completed'; review: GeneratedImageReview };
export type NativeImageReviewCheckpoint = { mode: 'model-native'; state: 'not_started' }
  | NativeImageReviewStarted | NativeImageReviewCompleted | AgentNativeImageReviewPrepared | AgentNativeImageReviewCompleted;

const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const fail = (): never => { throw new PresentationAssetError('VALIDATION_ERROR', 'Native image review checkpoint is invalid'); };
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const imageIdentityKeys = ['requestId', 'contentHash', 'sourceEvidenceIdentity', 'parentIdentity'] as const;
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');

export function agentNativeImageReviewEnvelope(value: AgentNativeImageReviewPrepared | AgentNativeImageReviewCompleted): AgentNativeImageReviewPrepared {
  const { review: _review, ...envelope } = value as AgentNativeImageReviewCompleted; void _review;
  return { ...envelope, state: 'prepared' };
}

export function nativeImageReviewProvider(provider: unknown, model: unknown): boolean {
  return typeof provider === 'string' && /^minimax-key-[1-9]\d*-model-[1-9]\d*$/u.test(provider)
    && (model === 'MiniMax-M3' || model === 'MiniMax-M3.1-Flash-Preview');
}

/** Private task data. Missing means historical Web/Codex; malformed never means legacy. */
export function readNativeImageReviewCheckpoint(result: unknown): NativeImageReviewCheckpoint | undefined {
  if (!record(result) || !Object.hasOwn(result, 'nativeImageReview')) return undefined;
  const value = result.nativeImageReview;
  if (!record(value)) return fail();
  if (value.mode === 'agent-native') {
    const fields = [...imageIdentityKeys, 'mode', 'state', 'preparedAt', 'deadlineAt', 'executionAttempt', 'runtimeId', 'skillCatalogueId',
      'provider', 'model', 'reservationLedgerId', 'maxTurns', 'maxOutputTokens', 'maxTotalOutputTokens', 'maxInputBytes'];
    if (!['prepared', 'completed'].includes(String(value.state)) || !exact(value, [...fields, ...(value.state === 'completed' ? ['review'] : [])])
      || ![value.requestId, value.runtimeId, value.skillCatalogueId, value.reservationLedgerId].every(text)
      || typeof value.parentIdentity !== 'string' || !value.parentIdentity
      || ![value.contentHash, value.sourceEvidenceIdentity].every(hash) || !nativeImageReviewProvider(value.provider, value.model)
      || !Number.isSafeInteger(value.preparedAt) || Number(value.preparedAt) < 1 || !Number.isSafeInteger(value.deadlineAt)
      || Number(value.deadlineAt) !== Number(value.preparedAt) + 300000 || !Number.isSafeInteger(value.executionAttempt) || Number(value.executionAttempt) < 1
      || value.maxTurns !== 4 || value.maxOutputTokens !== 32768 || value.maxTotalOutputTokens !== 32768
      || !Number.isSafeInteger(value.maxInputBytes) || Number(value.maxInputBytes) < 1 || Number(value.maxInputBytes) > 64000000) return fail();
    if (value.state === 'completed' && (!record(value.review)
      || [...imageIdentityKeys, 'provider', 'model'].some(key => (value.review as Record<string, unknown>)[key] !== value[key]))) return fail();
    return structuredClone(value) as unknown as AgentNativeImageReviewPrepared | AgentNativeImageReviewCompleted;
  }
  if (value.mode !== 'model-native') return fail();
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
  expected: ImageReviewIdentity, review: unknown, owningTaskResult?: unknown): checkpoint is NativeImageReviewCompleted | AgentNativeImageReviewCompleted {
  if (checkpoint?.mode === 'agent-native' && checkpoint.state === 'completed') {
    const execution = readNativeImageAgentExecution(owningTaskResult);
    const cp = execution?.checkpoint;
    const answer = record(review) ? review : undefined;
    if (!cp || cp.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls || !answer
      || ['provider', 'model', 'promptHash'].some(key => answer[key] !== cp.target[key as keyof typeof cp.target])
      || answer.responseHash !== cp.responseHash) return false;
  }
  return checkpoint?.state === 'completed'
    && Object.entries(expected).every(([key, value]) => checkpoint[key as keyof ImageReviewIdentity] === value)
    && isDeepStrictEqual(checkpoint.review, review);
}

/** Existing pre-generation recovery may retain only a fresh, never-submitted native role. */
export function imageReviewHasNoSubmission(result: unknown): boolean {
  if (result === null) return true;
  const execution = readNativeImageAgentExecution(result);
  return record(result) && readNativeImageReviewCheckpoint(result)?.state === 'not_started'
    && (Object.keys(result).length === 1 || exact(result, ['nativeImageReview', 'nativeAgentExecution'])
      && execution?.profile === 'image-review' && execution.checkpoint === undefined);
}

/** The image profile has a truthful image reference; it never fabricates a PDF or SourceMap. */
export function readNativeImageAgentExecution(result: unknown): NativeAgentExecution | undefined {
  if (!record(result) || !record(result.nativeAgentExecution) || result.nativeAgentExecution.profile !== 'image-review') return undefined;
  const marker = result.nativeAgentExecution;
  if (!exact(marker, ['kind', 'profile', 'runtimeId', 'skillCatalogueId', 'model', ...(Object.hasOwn(marker, 'checkpoint') ? ['checkpoint'] : [])])
    || marker.kind !== 'hermes-agent' || ![marker.runtimeId, marker.skillCatalogueId, marker.model].every(text)) return fail();
  const envelope = readNativeImageReviewCheckpoint(result);
  if (!envelope || (envelope.mode === 'model-native' ? envelope.state !== 'not_started' || marker.checkpoint !== undefined
    : marker.runtimeId !== envelope.runtimeId || marker.skillCatalogueId !== envelope.skillCatalogueId || marker.model !== envelope.model)) return fail();
  if (marker.checkpoint !== undefined) {
    const cp = marker.checkpoint;
    if (envelope.mode !== 'agent-native' || !record(cp) || !['started', 'completed'].includes(String(cp.state))
      || !exact(cp, ['taskId', 'objectKey', 'serializedSha256', 'size', 'sourceKind', 'imageIdentity', 'executionAttempt', 'turnCount', 'state', 'target',
        ...(cp.state === 'completed' ? ['responseHash', 'finishReason', 'hasToolCalls'] : [])])
      || cp.taskId !== envelope.requestId || cp.sourceKind !== 'illustration-image' || !record(cp.imageIdentity)
      || !exact(cp.imageIdentity, imageIdentityKeys) || imageIdentityKeys.some(key => (cp.imageIdentity as Record<string, unknown>)[key] !== envelope[key])
      || !hash(cp.serializedSha256) || cp.objectKey !== `derived/native-agent/${cp.serializedSha256}.json`
      || !Number.isSafeInteger(cp.size) || Number(cp.size) < 1 || Number(cp.size) > 128 * 1024 * 1024
      || cp.executionAttempt !== envelope.executionAttempt || !Number.isSafeInteger(cp.turnCount) || Number(cp.turnCount) < 1 || Number(cp.turnCount) > envelope.maxTurns
      || !record(cp.target) || !exact(cp.target, ['provider', 'model', 'promptHash']) || !hash(cp.target.promptHash)
      || cp.target.provider !== envelope.provider || cp.target.model !== envelope.model
      || (cp.state === 'completed' && (!hash(cp.responseHash) || typeof cp.hasToolCalls !== 'boolean'
        || !['stop', 'length', 'tool_calls', 'other', 'unknown'].includes(String(cp.finishReason))))) return fail();
  }
  return structuredClone(marker) as unknown as NativeAgentExecution;
}

/** Read the original task charge only. This never funds, debits, refunds or grants a new allowance. */
export async function requireAgentNativeImageReviewReservation(tx: Pick<Prisma.TransactionClient, 'agentTask' | 'usageLedger'>, taskId: string) {
  const task = await tx.agentTask.findUnique({ where: { id: taskId }, include: { session: true } });
  const reservationKey = `agent-task-reserve:${taskId}`;
  const entry = await tx.usageLedger.findFirst({ where: { idempotencyKey: reservationKey,
    userId: task?.session.userId, resource: 'ai_credit', kind: 'consume' } });
  const metadata = entry?.metadata;
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'running' || task.session.deletedAt || task.session.status !== 'active'
    || !entry || entry.idempotencyKey !== reservationKey || entry.userId !== task.session.userId || entry.resource !== 'ai_credit' || entry.kind !== 'consume' || Number(entry.delta) !== -1
    || !record(metadata) || metadata.taskId !== task.id || metadata.kind !== task.kind || metadata.policy !== 'charged-on-submit') {
    throw new PresentationAssetError('VALIDATION_ERROR', '[blocked] Original AI task reservation cannot authorize this image conversation');
  }
  return entry.id;
}

/** Caller holds the existing image/source/write locks; initialization precedes any Host or paid call. */
export async function prepareAgentNativeImageReview(tx: Pick<Prisma.TransactionClient, 'agentTask' | 'usageLedger'>,
  input: { taskId: string; executionAttempt: number; identity: ImageReviewIdentity; runtime: NativeAgentRuntimeConfig;
    target: Pick<NativeImageReviewTarget, 'provider' | 'model'>; maxInputBytes: number }): Promise<AgentNativeImageReviewPrepared> {
  const reservationLedgerId = await requireAgentNativeImageReviewReservation(tx, input.taskId);
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
  const prior = readNativeImageReviewCheckpoint(task?.result);
  const marker = readNativeImageAgentExecution(task?.result);
  if (!task || task.executionAttempt !== input.executionAttempt || input.identity.requestId !== task.id
    || prior?.mode !== 'model-native' || prior.state !== 'not_started' || !marker || marker.checkpoint
    || marker.runtimeId !== input.runtime.runtimeId || marker.skillCatalogueId !== input.runtime.skillCatalogueId) return fail();
  const preparedAt = Date.now();
  const next: AgentNativeImageReviewPrepared = { mode: 'agent-native', state: 'prepared', ...input.identity,
    preparedAt, deadlineAt: preparedAt + 300000, executionAttempt: input.executionAttempt,
    runtimeId: marker.runtimeId, skillCatalogueId: marker.skillCatalogueId, ...input.target, reservationLedgerId,
    maxTurns: 4, maxOutputTokens: 32768, maxTotalOutputTokens: 32768, maxInputBytes: input.maxInputBytes };
  const result = { ...task.result as Record<string, unknown>, nativeImageReview: next,
    nativeAgentExecution: { ...marker, model: next.model } };
  readNativeImageReviewCheckpoint(result); readNativeImageAgentExecution(result);
  const changed = await tx.agentTask.updateMany({ where: { id: task.id, deletedAt: null, status: 'running', executionAttempt: input.executionAttempt,
    result: { equals: task.result as Prisma.InputJsonValue } }, data: { result: result as unknown as Prisma.InputJsonObject } });
  if (changed.count !== 1) return fail(); return next;
}

/** Caller revalidates existing source/write authority in the same short transaction. */
export async function startNativeImageReview(tx: Pick<Prisma.TransactionClient, 'agentTask'>,
  input: { taskId: string; executionAttempt: number; identity: ImageReviewIdentity; target: NativeImageReviewTarget }) {
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
  const checkpoint = readNativeImageReviewCheckpoint(task?.result);
  if (!task || task.deletedAt || task.kind !== 'presentation.generate' || task.status !== 'running'
    || task.executionAttempt !== input.executionAttempt || input.identity.requestId !== task.id
    || checkpoint?.state !== 'not_started' || readNativeImageAgentExecution(task.result)) return fail();
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
  if (checkpoint?.mode === 'agent-native') {
    const marker = readNativeImageAgentExecution(task?.result);
    const cp = marker?.checkpoint as NativeAgentImageCheckpointReference | undefined;
    if (!task || task.deletedAt || task.status !== 'running' || task.executionAttempt !== input.executionAttempt || checkpoint.state !== 'prepared'
      || !cp || cp.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls
      || input.review.requestId !== task.id || imageIdentityKeys.some(key => input.review[key] !== checkpoint[key])
      || ['provider', 'model', 'promptHash'].some(key => input.review[key as keyof GeneratedImageReview] !== cp.target[key as keyof typeof cp.target])
      || input.review.responseHash !== cp.responseHash) return fail();
    const next: AgentNativeImageReviewCompleted = { ...checkpoint, state: 'completed', review: input.review };
    const result = { ...task.result as Record<string, unknown>, nativeImageReview: next };
    readNativeImageReviewCheckpoint(result);
    const changed = await tx.agentTask.updateMany({ where: { id: task.id, deletedAt: null, status: 'running', executionAttempt: input.executionAttempt,
      result: { equals: task.result as Prisma.InputJsonValue } }, data: { result: result as unknown as Prisma.InputJsonObject } });
    if (changed.count !== 1) return fail(); return next;
  }
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

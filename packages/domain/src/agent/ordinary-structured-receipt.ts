import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { AgentError } from './errors';

export const ORDINARY_STRUCTURED_RECEIPT_KEY = 'ordinaryStructuredReceipt';
export const ORDINARY_STRUCTURED_HOLD = '[blocked] Previous structured request may have been paid; automatic replay is disabled';
const kinds = ['review.analyze', 'visualization.plan', 'workspace.guide', 'presentation.figure-audit'] as const;
export type OrdinaryStructuredKind = typeof kinds[number];
export type OrdinaryStructuredIdentity = { taskId: string; kind: OrdinaryStructuredKind; executionAttempt: number;
  sessionId: string; userId: string; researchObjectId: string | null };
export type OrdinaryStructuredTarget = { provider: string; model: string; promptHash: string };
type Attempt = { ordinal: number; target: OrdinaryStructuredTarget; state: 'prepared' | 'completed' | 'unknown';
  responseJson?: string; failureJson?: string };
export type OrdinaryStructuredReceipt = { identity: OrdinaryStructuredIdentity; sourceJson: string; attempts: Attempt[] };
type Tx = Pick<Prisma.TransactionClient, 'agentTask'>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
function fail(): never { throw new AgentError('ILLEGAL_TRANSITION', '[blocked] Private structured receipt changed'); }
export class OrdinaryStructuredReceiptConflict extends Error {}

export function isOrdinaryStructuredKind(kind: string): kind is OrdinaryStructuredKind {
  return (kinds as readonly string[]).includes(kind);
}
export function hasOrdinaryStructuredReceipt(result: unknown): boolean {
  return record(result) && Object.hasOwn(result, ORDINARY_STRUCTURED_RECEIPT_KEY);
}
/** Compare absence too: SQL NULL and JSON null are both read as null by Prisma. */
export function ordinaryStructuredResultEquals(result: unknown) {
  return { equals: result == null ? Prisma.AnyNull : result as Prisma.InputJsonValue };
}
export function readOrdinaryStructuredReceipt(result: unknown): OrdinaryStructuredReceipt | undefined {
  if (!hasOrdinaryStructuredReceipt(result)) return undefined;
  const cp = (result as Record<string, unknown>)[ORDINARY_STRUCTURED_RECEIPT_KEY];
  if (!record(cp) || Object.keys(cp).sort().join(',') !== 'attempts,identity,sourceJson'
    || !record(cp.identity) || !text(cp.sourceJson) || !Array.isArray(cp.attempts) || !cp.attempts.length || cp.attempts.length > 5) fail();
  const id = cp.identity;
  if (Object.keys(id).sort().join(',') !== 'executionAttempt,kind,researchObjectId,sessionId,taskId,userId'
    || !['taskId', 'sessionId', 'userId'].every(k => text(id[k])) || !text(id.kind) || !isOrdinaryStructuredKind(id.kind)
    || !Number.isSafeInteger(id.executionAttempt) || Number(id.executionAttempt) < 1
    || !(id.researchObjectId === null || text(id.researchObjectId))) fail();
  for (const [ordinal, item] of cp.attempts.entries()) {
    if (!record(item) || item.ordinal !== ordinal || !record(item.target)
      || Object.keys(item.target).sort().join(',') !== 'model,promptHash,provider'
      || !text(item.target.provider) || !text(item.target.model) || typeof item.target.promptHash !== 'string'
      || !/^[a-f0-9]{64}$/u.test(item.target.promptHash)
      || !['prepared', 'completed', 'unknown'].includes(String(item.state))
      || Object.keys(item).sort().join(',') !== (item.state === 'completed'
        ? 'ordinal,responseJson,state,target' : item.state === 'unknown' ? 'failureJson,ordinal,state,target' : 'ordinal,state,target')
      || (item.state === 'completed' && !text(item.responseJson)) || (item.state === 'unknown' && !text(item.failureJson))
      || (ordinal < cp.attempts.length - 1 && item.state !== 'completed')) fail();
  }
  return cp as unknown as OrdinaryStructuredReceipt;
}

/** Caller owns the admission locks. A preexisting intent never grants a fresh publication capability. */
export async function prepareOrdinaryStructuredReceipt(tx: Tx, input: { identity: OrdinaryStructuredIdentity;
  sourceJson: string; ordinal: number; target: OrdinaryStructuredTarget }): Promise<OrdinaryStructuredReceipt> {
  const task = await tx.agentTask.findUnique({ where: { id: input.identity.taskId } });
  if (!task || task.deletedAt || task.id !== input.identity.taskId || task.kind !== input.identity.kind
    || task.sessionId !== input.identity.sessionId || task.status !== 'running' || task.executionAttempt !== input.identity.executionAttempt) fail();
  const old = readOrdinaryStructuredReceipt(task.result);
  if (old && (!isDeepStrictEqual(old.identity, input.identity) || old.sourceJson !== input.sourceJson
    || old.attempts.some(a => a.state !== 'completed'))) fail();
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal !== (old?.attempts.length ?? 0) || input.ordinal >= 5) fail();
  const next: OrdinaryStructuredReceipt = { identity: { ...input.identity }, sourceJson: input.sourceJson,
    attempts: [...old?.attempts ?? [], { ordinal: input.ordinal, target: { ...input.target }, state: 'prepared' }] };
  const result = { ...(record(task.result) ? task.result : {}), [ORDINARY_STRUCTURED_RECEIPT_KEY]: next };
  readOrdinaryStructuredReceipt(result);
  const changed = await tx.agentTask.updateMany({ where: { id: task.id, kind: task.kind, sessionId: task.sessionId,
    status: task.status, deletedAt: null, executionAttempt: task.executionAttempt, result: ordinaryStructuredResultEquals(task.result) },
    data: { result: result as unknown as Prisma.InputJsonObject } });
  if (changed.count !== 1) throw new OrdinaryStructuredReceiptConflict();
  return next;
}

/** Evidence only: the submitting attempt may be stale; a stopped task is never rearmed. */
export async function settleOrdinaryStructuredReceipt(tx: Tx, prepared: OrdinaryStructuredReceipt,
  completion: { responseJson: string } | { failureJson: string }): Promise<void> {
  const task = await tx.agentTask.findUnique({ where: { id: prepared.identity.taskId } });
  const current = readOrdinaryStructuredReceipt(task?.result);
  const original = prepared.attempts.at(-1);
  if (!task || task.deletedAt || task.kind !== prepared.identity.kind || task.sessionId !== prepared.identity.sessionId
    || !original || !current || !isDeepStrictEqual(current.identity, prepared.identity) || current.sourceJson !== prepared.sourceJson) fail();
  const at = current.attempts[original.ordinal];
  if (!at || !isDeepStrictEqual(at.target, original.target)) fail();
  const settled: Attempt = { ordinal: at.ordinal, target: at.target,
    ...('responseJson' in completion ? { state: 'completed' as const, responseJson: completion.responseJson }
      : { state: 'unknown' as const, failureJson: completion.failureJson }) };
  if (at.state !== 'prepared') {
    if (isDeepStrictEqual(at, settled)) return;
    fail();
  }
  const attempts = current.attempts.map((a, i) => i === at.ordinal ? settled : a);
  const next = { ...current, attempts };
  const result = { ...(task.result as Record<string, unknown>), [ORDINARY_STRUCTURED_RECEIPT_KEY]: next };
  readOrdinaryStructuredReceipt(result);
  const changed = await tx.agentTask.updateMany({ where: { id: task.id, kind: task.kind, sessionId: task.sessionId,
    status: task.status, deletedAt: null, executionAttempt: task.executionAttempt, result: ordinaryStructuredResultEquals(task.result) },
    data: { result: result as unknown as Prisma.InputJsonObject } });
  if (changed.count !== 1) throw new OrdinaryStructuredReceiptConflict();
}

/** Handler/model data cannot create or replace this server-owned namespace. */
export function ordinaryStructuredPublicResult(value: unknown): Record<string, unknown> | undefined {
  if (!record(value)) return undefined;
  const copy = { ...value }; delete copy[ORDINARY_STRUCTURED_RECEIPT_KEY]; return copy;
}
export function ordinaryStructuredTerminalResult(current: unknown, incoming: unknown): unknown {
  if (!hasOrdinaryStructuredReceipt(current)) return record(incoming) ? ordinaryStructuredPublicResult(incoming) : incoming;
  return { ...(incoming === undefined && record(current) ? current : ordinaryStructuredPublicResult(incoming)),
    [ORDINARY_STRUCTURED_RECEIPT_KEY]: (current as Record<string, unknown>)[ORDINARY_STRUCTURED_RECEIPT_KEY] };
}

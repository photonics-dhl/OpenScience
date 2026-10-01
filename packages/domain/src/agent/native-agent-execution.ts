import { isDeepStrictEqual } from 'node:util';
import type { AgentTask, Prisma } from '@prisma/client';
import { parseDocumentSourceMapReference } from '../research-intelligence/source-map-ref';
import { AgentError } from './errors';
import { requireActiveMembership } from '../workspace/helpers';
import { lockTrashReferences } from '../trash/trash';

export interface NativeAgentRuntimeConfig { runtimeId: string; skillCatalogueId: string; model: string }
/** Read only these non-secret server fields. Missing installation must not silently select another engine. */
export function nativeAgentRuntimeFromEnv(env: Record<string, string | undefined>): NativeAgentRuntimeConfig | undefined {
  if (!env.HERMES_NATIVE_AGENT_ENABLED || env.HERMES_NATIVE_AGENT_ENABLED === 'false') return undefined;
  if (env.HERMES_NATIVE_AGENT_ENABLED !== 'true') blocked();
  const runtime = { runtimeId: env.HERMES_NATIVE_RUNTIME_ID ?? '', skillCatalogueId: env.HERMES_NATIVE_SKILL_CATALOGUE_ID ?? '',
    model: env.HERMES_NATIVE_AGENT_MODEL ?? 'MiniMax-M3' };
  initialNativeAgentExecution(runtime); return runtime;
}
export interface NativeAgentCheckpointReference {
  taskId: string; objectKey: string; serializedSha256: string; size: number;
  artifactId: string; documentSha256: string; sourceMapHash: string;
  executionAttempt: number; turnCount: number; state: 'started' | 'completed';
  target: { provider: string; model: string; promptHash: string };
  responseHash?: string; finishReason?: string; hasToolCalls?: boolean;
}
export interface NativeAgentExecution extends NativeAgentRuntimeConfig {
  kind: 'hermes-agent'; profile: 'paper-understanding'; checkpoint?: NativeAgentCheckpointReference;
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const hash = (x: unknown): x is string => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x);
const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim() && x.length <= 200;
const exact = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).sort().join(',') === keys.sort().join(',');
function blocked(): never { throw new AgentError('ILLEGAL_TRANSITION', '[blocked] Native Agent execution binding changed'); }

/** Reuse live task/source/membership authority for every native call and for final scientific adoption. */
export async function requireNativeAgentExecutionAuthority(tx: Prisma.TransactionClient, input: { taskId: string; executionAttempt: number }) {
  await lockTrashReferences(tx);
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  const marker = readNativeAgentExecution(task?.result);
  const payload = task?.payload;
  if (!task || task.deletedAt || task.status !== 'running' || task.kind !== 'sdf.extract' || task.executionAttempt !== input.executionAttempt
    || !marker || task.session.deletedAt || task.session.status !== 'active' || !task.session.researchObjectId || !record(payload)
    || !exact(payload, ['artifactId', 'researchObjectId']) || payload.researchObjectId !== task.session.researchObjectId || !text(payload.artifactId)) blocked();
  const ro = await tx.researchObject.findUnique({ where: { id: task.session.researchObjectId } });
  if (!ro || ro.deletedAt) blocked();
  const { workspace, membership } = await requireActiveMembership(tx, ro.workspaceId, task.session.userId);
  if (workspace.status !== 'active' || !['owner', 'maintainer', 'author', 'contributor'].includes(membership.role)) blocked();
  const artifact = await tx.artifact.findUnique({ where: { id: payload.artifactId } });
  const source = await tx.ingestionTask.findUnique({ where: { agentTaskId: task.id }, include: { batch: true } });
  if (!artifact || artifact.deletedAt || artifact.bytesPurgedAt || artifact.workspaceId !== workspace.id
    || !source || source.artifactId !== artifact.id || source.batch.userId !== task.session.userId || source.batch.researchObjectId !== ro.id) blocked();
  if (marker.checkpoint && (!record(task.result) || task.result.sourceMapRef === undefined)) blocked();
  if (record(task.result) && task.result.sourceMapRef !== undefined) {
    const reference = parseDocumentSourceMapReference(task.result.sourceMapRef);
    if (reference.artifactId !== artifact.id || reference.contentHash !== artifact.blobSha256
      || (marker.checkpoint && (reference.parserStatus !== 'succeeded' || marker.checkpoint.taskId !== task.id || marker.checkpoint.artifactId !== reference.artifactId
        || marker.checkpoint.documentSha256 !== reference.contentHash || marker.checkpoint.sourceMapHash !== reference.serializedSha256))) blocked();
  }
  const step = await tx.hermesResearchStep.findFirst({ where: { agentTaskId: task.id, stage: 'source_ingestion' } });
  if (step) {
    const run = await tx.hermesResearchRun.findUnique({ where: { id: step.runId } });
    if (!run || run.actorId !== task.session.userId || run.researchObjectId !== ro.id
      || ['failed', 'cancelled', 'completed'].includes(run.status) || step.ingestionTaskId !== source.id || step.artifactId !== artifact.id) blocked();
  }
  return { task, marker, artifact, researchObject: ro, workspace };
}

/** Only server configuration initializes a new task. Exact replay must return before this runs. */
export function initialNativeAgentExecution(runtime: NativeAgentRuntimeConfig | undefined): { nativeAgentExecution: NativeAgentExecution } | undefined {
  if (!runtime) return undefined;
  const result = { nativeAgentExecution: { ...runtime, kind: 'hermes-agent' as const, profile: 'paper-understanding' as const } };
  readNativeAgentExecution(result); return result;
}

/** Missing means historical execution. A malformed marker cannot reopen the legacy route. */
export function readNativeAgentExecution(result: unknown): NativeAgentExecution | undefined {
  if (!record(result) || !Object.hasOwn(result, 'nativeAgentExecution')) return undefined;
  const marker = result.nativeAgentExecution;
  if (!record(marker) || !exact(marker, ['kind', 'profile', 'runtimeId', 'skillCatalogueId', 'model', ...(Object.hasOwn(marker, 'checkpoint') ? ['checkpoint'] : [])])
    || marker.kind !== 'hermes-agent' || marker.profile !== 'paper-understanding'
    || ![marker.runtimeId, marker.skillCatalogueId, marker.model].every(text)) blocked();
  if (Object.hasOwn(marker, 'checkpoint')) {
    const cp = marker.checkpoint;
    if (!record(cp) || !['started', 'completed'].includes(String(cp.state))
      || !exact(cp, ['taskId', 'objectKey', 'serializedSha256', 'size', 'artifactId', 'documentSha256', 'sourceMapHash', 'executionAttempt', 'turnCount', 'state', 'target',
        ...(cp.state === 'completed' ? ['responseHash', 'finishReason', 'hasToolCalls'] : [])])
      || !text(cp.taskId) || !text(cp.artifactId) || !hash(cp.serializedSha256) || !hash(cp.documentSha256) || !hash(cp.sourceMapHash)
      || cp.objectKey !== `derived/native-agent/${cp.serializedSha256}.json`
      || !Number.isSafeInteger(cp.size) || Number(cp.size) < 1 || Number(cp.size) > 128 * 1024 * 1024
      || !Number.isSafeInteger(cp.executionAttempt) || Number(cp.executionAttempt) < 1
      || !Number.isSafeInteger(cp.turnCount) || Number(cp.turnCount) < 1 || Number(cp.turnCount) > 32
      || !record(cp.target) || !exact(cp.target, ['provider', 'model', 'promptHash']) || !text(cp.target.provider)
      || cp.target.model !== marker.model || !hash(cp.target.promptHash)
      || (cp.state === 'completed' && (!hash(cp.responseHash) || !['stop', 'length', 'tool_calls', 'other', 'unknown'].includes(String(cp.finishReason)) || typeof cp.hasToolCalls !== 'boolean'))) blocked();
  }
  return structuredClone(marker) as unknown as NativeAgentExecution;
}

/** Caller holds existing source/authority locks; this helper owns only the exact task-result CAS. */
export async function compareNativeAgentCheckpoint(tx: Pick<Prisma.TransactionClient, 'agentTask'>, input: {
  taskId: string; executionAttempt: number; expected: NativeAgentCheckpointReference | undefined;
  next: NativeAgentCheckpointReference; paidCompletion: boolean;
}): Promise<void> {
  const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
  const marker = readNativeAgentExecution(task?.result);
  if (!task || task.deletedAt || task.kind !== 'sdf.extract' || !marker || input.next.taskId !== task.id
    || !isDeepStrictEqual(marker.checkpoint, input.expected)) blocked();
  const priorObjects = record(task.result) && Array.isArray(task.result.nativeAgentObjects) ? task.result.nativeAgentObjects : [];
  const oldObject = marker.checkpoint?.objectKey;
  // Older private snapshots are retained as paid/recovery evidence and enter the existing task trash lifecycle.
  const nativeAgentObjects = [...priorObjects, ...(oldObject && !priorObjects.some(ref => record(ref) && ref.objectKey === oldObject) ? [{ objectKey: oldObject }] : [])];
  const result = { ...(task.result as Record<string, unknown>), nativeAgentExecution: { ...marker, checkpoint: input.next }, nativeAgentObjects };
  readNativeAgentExecution(result);
  const old = marker.checkpoint;
  if (input.paidCompletion) {
    // Saving paid evidence grants no right to consume or continue; lease/authority may have changed.
    if (!old || old.state !== 'started' || input.next.state !== 'completed' || old.executionAttempt !== input.executionAttempt
      || ['taskId', 'artifactId', 'documentSha256', 'sourceMapHash', 'executionAttempt', 'turnCount'].some(k =>
        old[k as keyof NativeAgentCheckpointReference] !== input.next[k as keyof NativeAgentCheckpointReference])
      || !isDeepStrictEqual(old.target, input.next.target)) blocked();
  } else {
    if (task.status !== 'running' || task.executionAttempt !== input.executionAttempt || input.next.executionAttempt !== input.executionAttempt
      || input.next.state !== 'started' || input.next.turnCount !== (old?.turnCount ?? 0) + 1 || old?.state === 'started') blocked();
    const source = parseDocumentSourceMapReference((task.result as Record<string, unknown>).sourceMapRef);
    if (source.parserStatus !== 'succeeded' || source.artifactId !== input.next.artifactId || source.contentHash !== input.next.documentSha256
      || source.serializedSha256 !== input.next.sourceMapHash || (old && ['artifactId', 'documentSha256', 'sourceMapHash'].some(k =>
        old[k as keyof NativeAgentCheckpointReference] !== input.next[k as keyof NativeAgentCheckpointReference]))) blocked();
  }
  const changed = await tx.agentTask.updateMany({ where: { id: task.id, kind: task.kind, status: task.status,
    deletedAt: null, executionAttempt: task.executionAttempt, result: { equals: task.result as Prisma.InputJsonValue } },
    data: { result: result as unknown as Prisma.InputJsonObject } });
  if (changed.count !== 1) blocked();
}

/** Adopt only the last actual native response, never a guessed or historical self-check receipt. */
export function nativeAgentTerminalResult(task: AgentTask, status: string, incoming: unknown): unknown {
  const marker = readNativeAgentExecution(task.result);
  if (!marker) { if (record(incoming) && Object.hasOwn(incoming, 'nativeAgentExecution')) blocked(); return incoming; }
  if (record(incoming) && Object.hasOwn(incoming, 'nativeAgentExecution') && !isDeepStrictEqual(incoming.nativeAgentExecution, marker)) blocked();
  if (status === 'succeeded') {
    if (!marker.checkpoint && record(incoming) && incoming.status === 'needs_review' && typeof incoming.reason === 'string'
      && exact(incoming, ['status', 'reason', 'format', 'sourceMapRef'])) {
      const reference = parseDocumentSourceMapReference(incoming.sourceMapRef);
      if (!record(task.payload) || reference.artifactId !== task.payload.artifactId) blocked();
      return { ...incoming, nativeAgentExecution: marker };
    }
    const cp = marker.checkpoint;
    if (!cp || cp.state !== 'completed' || cp.finishReason !== 'stop' || cp.hasToolCalls || !record(incoming) || !record(incoming.scientificReview)) blocked();
    const receipt = incoming.scientificReview;
    if (receipt.kind !== 'hermes_agent_review' || ['provider', 'model', 'promptHash'].some(k => receipt[k] !== cp.target[k as keyof typeof cp.target])
      || receipt.responseHash !== cp.responseHash || receipt.runtimeId !== marker.runtimeId || receipt.skillCatalogueId !== marker.skillCatalogueId) blocked();
    const source = parseDocumentSourceMapReference(incoming.sourceMapRef);
    if (source.parserStatus !== 'succeeded' || source.artifactId !== cp.artifactId || source.contentHash !== cp.documentSha256 || source.serializedSha256 !== cp.sourceMapHash) blocked();
  }
  return { ...(record(incoming) ? incoming : {}), nativeAgentExecution: marker,
    ...(record(task.result) && task.result.sourceMapRef ? { sourceMapRef: task.result.sourceMapRef } : {}),
    ...(record(task.result) && task.result.nativeAgentObjects ? { nativeAgentObjects: task.result.nativeAgentObjects } : {}) };
}

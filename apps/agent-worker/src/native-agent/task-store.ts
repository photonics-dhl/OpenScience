import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { lockTrashReferences, readNativeAgentExecution, compareNativeAgentCheckpoint,
  rememberDiscardedTaskResult,
  type AgentDeps, type NativeAgentCheckpointReference, type NativeAgentExecution } from '@openscience/domain';
import type { Prisma } from '@prisma/client';
import type { StorageAdapter } from '@openscience/storage';
import { nativeImageReviewFinal, type NativeAgentSessionState, type NativeAgentSessionStore } from './session';

const MAX_STATE_BYTES = 128 * 1024 * 1024;
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function blocked(): never { throw new Error('[blocked] Native Agent private checkpoint changed'); }

/** Full SDK histories live only in private object storage. PostgreSQL retains the owned immutable reference. */
export function createNativeTaskStore(input: { prisma: AgentDeps['prisma']; storage: StorageAdapter; taskId: string;
  executionAttempt: number; execution: NativeAgentExecution; authorize: (tx: Prisma.TransactionClient) => Promise<void>;
  authorizeFinal?: (tx: Prisma.TransactionClient) => Promise<void> }): NativeAgentSessionStore {
  const known = new Map<string, NativeAgentCheckpointReference>();
  async function marker(db: Pick<Prisma.TransactionClient, 'agentTask'>) {
    const task = await db.agentTask.findUnique({ where: { id: input.taskId } });
    const execution = readNativeAgentExecution(task?.result);
    if (!task || task.deletedAt || !execution || ['kind', 'profile', 'runtimeId', 'skillCatalogueId', 'model', 'planningContract', 'imageResultPolicy'].some(k =>
      execution[k as keyof NativeAgentExecution] !== input.execution[k as keyof NativeAgentExecution])) blocked();
    return execution;
  }
  function expected(state: NativeAgentSessionState | null) {
    if (!state) return undefined;
    const reference = known.get(sha(Buffer.from(JSON.stringify(state))));
    if (!reference) blocked(); return reference;
  }
  async function persist(state: NativeAgentSessionState) {
    const bytes = Buffer.from(JSON.stringify(state));
    if (bytes.length > MAX_STATE_BYTES) throw new Error('[blocked] Native checkpoint exceeds private storage capacity');
    const hash = sha(bytes); const objectKey = `derived/native-agent/${hash}.json`;
    const turn = state.turns.at(-1); const binding = state.binding;
    if (binding.sourceKind === 'journal-text') blocked();
    if (!turn || binding.taskId !== input.taskId || binding.runtimeId !== input.execution.runtimeId
      || binding.skillCatalogueId !== input.execution.skillCatalogueId || binding.model !== input.execution.model) blocked();
    if (binding.sourceKind === 'illustration-image'
      && binding.imageReview.imageResultPolicy !== input.execution.imageResultPolicy) blocked();
    if (state.validatedFinal) nativeImageReviewFinal(state);
    const rawOnly = turn.state === 'received';
    const source = binding.sourceKind === 'illustration-image' ? { sourceKind: 'illustration-image' as const, imageIdentity: {
        requestId: binding.imageReview.requestId, contentHash: binding.imageReview.contentHash,
        sourceEvidenceIdentity: binding.imageReview.sourceEvidenceIdentity, parentIdentity: binding.imageReview.parentIdentity,
      }, ...(binding.imageReview.imageResultPolicy ? { imageResultPolicy: binding.imageReview.imageResultPolicy,
          ...((turn.state === 'completed' && turn.received) || rawOnly ? { received: rawOnly ? 'raw-only' as const : 'decoded' as const } : {}),
          ...(state.validatedFinal ? { validatedFinal: { policy: state.validatedFinal.policy, rawCheckpoint: state.validatedFinal.rawCheckpoint,
            turnOrdinal: state.validatedFinal.turnOrdinal, resultToolCallId: state.validatedFinal.resultToolCallId,
            responseHash: state.validatedFinal.responseHash } } : {}) } : {}) }
      : { artifactId: binding.artifactId, documentSha256: binding.documentSha256, sourceMapHash: binding.sourceMapHash };
    const reference: NativeAgentCheckpointReference = { taskId: input.taskId, objectKey, serializedSha256: hash, size: bytes.length,
      ...source, executionAttempt: binding.sourceKind === 'illustration-image' ? binding.imageReview.executionAttempt : input.executionAttempt,
      turnCount: state.turns.length, state: rawOnly ? 'completed' : turn.state, target: turn.target,
      ...(turn.state === 'completed' ? { responseHash: sha(turn.response.text), finishReason: turn.response.finishReason,
        hasToolCalls: Boolean(turn.response.toolCalls?.length) } : {}) };
    // Register before writing: even a revoked/losing live task CAS retains the object for existing task trash cleanup.
    // This reference grants neither a completed checkpoint nor permission to consume a reply.
    await input.prisma.$transaction(async tx => {
      await lockTrashReferences(tx); await marker(tx);
      const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
      if (!task || task.deletedAt || !task.result || typeof task.result !== 'object' || Array.isArray(task.result)) blocked();
      const refs = Array.isArray(task.result.nativeAgentObjects) ? task.result.nativeAgentObjects : [];
      if (refs.some(ref => ref && typeof ref === 'object' && !Array.isArray(ref) && ref.objectKey === objectKey)) return;
      const changed = await tx.agentTask.updateMany({ where: { id: input.taskId, executionAttempt: task.executionAttempt,
        deletedAt: null, result: { equals: task.result } },
        data: { result: { ...task.result, nativeAgentObjects: [...refs, { objectKey }] } } });
      if (changed.count !== 1) blocked();
    }, { isolationLevel: 'Serializable' });
    return { reference, bytes };
  }
  async function update(previous: NativeAgentSessionState | null, state: NativeAgentSessionState,
    mode: 'start' | 'paid' | 'final') {
    if (mode === 'final' && (!previous || previous.validatedFinal || !input.authorizeFinal
      || !isDeepStrictEqual(state, { ...previous, validatedFinal: nativeImageReviewFinal(previous) }))) blocked();
    const old = expected(previous); let next: NativeAgentCheckpointReference | undefined;
    try {
      const prepared = await persist(state); next = prepared.reference;
      const object = await input.storage.headObject(next.objectKey);
      if (object && object.size !== prepared.bytes.length) blocked();
      if (!object) await input.storage.putObject(next.objectKey, prepared.bytes,
        { contentType: 'application/json', sha256: next.serializedSha256 });
      const preparedReference = next;
      await input.prisma.$transaction(async tx => {
        await lockTrashReferences(tx);
        if (mode === 'final') await input.authorizeFinal!(tx);
        else if (mode === 'start') await input.authorize(tx);
        await compareNativeAgentCheckpoint(tx, { taskId: input.taskId, executionAttempt: input.executionAttempt, expected: old,
          next: preparedReference, paidCompletion: mode === 'paid', ...(mode === 'final' ? { validatedFinalization: true } : {}),
          expectedExecution: input.execution });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      // A concurrent task deletion must also account for bytes written before its result-CAS failed.
      const task = await input.prisma.agentTask.findUnique({ where: { id: input.taskId } });
      if (next && (!task || task.deletedAt)) await rememberDiscardedTaskResult(input.prisma, input.taskId, { nativeAgentExecution: { checkpoint: next } });
      throw error;
    }
    known.set(next.serializedSha256, next);
  }
  return {
    async read() {
      const cp = (await marker(input.prisma)).checkpoint;
      if (!cp) return null;
      if (cp.taskId !== input.taskId) blocked();
      const object = await input.storage.getObject(cp.objectKey);
      if (object.size !== cp.size || object.size > MAX_STATE_BYTES) blocked();
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of object.body) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > cp.size) { object.body.destroy(); blocked(); } chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      if (size !== cp.size || sha(bytes) !== cp.serializedSha256) blocked();
      const state = JSON.parse(bytes.toString('utf8')) as NativeAgentSessionState;
      const turn = state.turns?.at(-1);
      if (state.binding?.sourceKind === 'journal-text') blocked();
      const binding = state.binding;
      if (state.turns?.some(item => (item.imageResultPolicy !== undefined || item.effectiveRequest !== undefined
        || item.state === 'received' || item.state === 'completed' && item.received !== undefined)
        && (binding?.sourceKind !== 'illustration-image' || binding.imageReview.imageResultPolicy !== 'image-review-tool-final-v1'
          || item.imageResultPolicy !== 'image-review-tool-final-v1' || !item.effectiveRequest))) blocked();
      const sameSource = binding?.sourceKind === 'illustration-image' ? cp.sourceKind === 'illustration-image'
        && isDeepStrictEqual(cp.imageIdentity, { requestId: binding.imageReview.requestId, contentHash: binding.imageReview.contentHash,
          sourceEvidenceIdentity: binding.imageReview.sourceEvidenceIdentity, parentIdentity: binding.imageReview.parentIdentity })
        : cp.sourceKind === undefined && binding.artifactId === cp.artifactId
          && binding.documentSha256 === cp.documentSha256 && binding.sourceMapHash === cp.sourceMapHash;
      if (state.kind !== 'hermes-native-agent' || state.binding?.taskId !== cp.taskId || !sameSource
        || state.binding.runtimeId !== input.execution.runtimeId || state.binding.skillCatalogueId !== input.execution.skillCatalogueId
        || state.binding.model !== input.execution.model || state.turns.length !== cp.turnCount || !turn
        || (turn.state === 'received' ? 'completed' : turn.state) !== cp.state
        || !isDeepStrictEqual(turn.target, cp.target)
        || (turn.state === 'completed' && (sha(turn.response.text) !== cp.responseHash || turn.response.finishReason !== cp.finishReason
          || Boolean(turn.response.toolCalls?.length) !== cp.hasToolCalls))) blocked();
      if (binding.sourceKind === 'illustration-image') {
        if (cp.sourceKind !== 'illustration-image' || cp.imageResultPolicy !== binding.imageReview.imageResultPolicy
          || cp.imageResultPolicy !== input.execution.imageResultPolicy
          || cp.received !== (turn.state === 'received' ? 'raw-only' : turn.state === 'completed' && turn.received ? 'decoded' : undefined)
          || (turn.state === 'received' && (cp.responseHash !== undefined || cp.finishReason !== undefined || cp.hasToolCalls !== undefined
            || Object.hasOwn(turn, 'response')))) blocked();
        if (cp.received !== undefined && (cp.imageResultPolicy !== 'image-review-tool-final-v1'
          || turn.imageResultPolicy !== cp.imageResultPolicy || !turn.effectiveRequest
          || turn.request.messages.flatMap(message => message.images ?? []).length !== 1
          || turn.state === 'started' || !turn.received || turn.received.policy !== cp.imageResultPolicy
          || turn.received.provider !== cp.target.provider
          || (turn.state === 'received' ? turn.received.decoded !== undefined : !turn.received.decoded))) blocked();
        const final = state.validatedFinal;
        if (!isDeepStrictEqual(cp.validatedFinal, final ? { policy: final.policy, rawCheckpoint: final.rawCheckpoint,
          turnOrdinal: final.turnOrdinal, resultToolCallId: final.resultToolCallId, responseHash: final.responseHash } : undefined)) blocked();
        if (final) nativeImageReviewFinal(state);
      } else if (state.validatedFinal || turn.imageResultPolicy || turn.effectiveRequest || turn.state === 'received'
        || (turn.state === 'completed' && turn.received)) blocked();
      known.set(cp.serializedSha256, cp); return state;
    },
    compareAndSet: (previous, state) => update(previous, state, 'start'),
    complete: (previous, state) => update(previous, state, 'paid'),
    finalize: (previous, state) => update(previous, state, 'final'),
    async publish<T>(started: NativeAgentSessionState, submit: () => Promise<T>): Promise<T> {
      const cp = expected(started); let sent: Promise<T> | undefined;
      try {
        await input.prisma.$transaction(async tx => {
          await lockTrashReferences(tx); await input.authorize(tx);
          if (!isDeepStrictEqual((await marker(tx)).checkpoint, cp)) blocked();
          // Invoke HTTP while authority locks are held; never hold the transaction for model execution.
          sent = submit(); void sent.catch(() => undefined);
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        // This transaction is read-only. If sending began, retain the actual paid answer; consumption reauthorizes.
        if (!sent) throw error;
      }
      if (!sent) blocked(); return sent;
    },
  };
}

import { isDeepStrictEqual } from 'node:util';
import { Prisma, type AgentSession, type AgentTask } from '@prisma/client';
import { sha256HexBuffer, type StorageAdapter } from '@openscience/storage';
import type { AuditContext } from '@openscience/observability';
import { lockLiveResearchObject, lockTrashReferences, rememberDiscardedTaskResult } from '../trash/trash';
import { requireActiveMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { isOwnedPrismaIdempotencyConflict } from '../prisma-idempotency-conflict';
import { dispatchAgentTask, persistHermesVoiceTaskInTransaction, taskToView,
  type AgentDeps, type AgentTaskView } from './agent';
import { AgentError } from './errors';
import { HERMES_VOICE_HOLD, HERMES_VOICE_MAX_RECORDING_BYTES, HERMES_VOICE_MAX_RECORDING_SECONDS,
  HERMES_VOICE_RECEIPT_KEY, HERMES_VOICE_REPLY_MAX_UTF8_BYTES, hasHermesVoiceCheckpoint,
  isHermesVoiceTaskKind, isHermesVoiceStopped, isHermesVoiceWriterEnabled, HERMES_VOICE_READER_ONLY, projectHermesVoiceResult, type HermesVoiceAudio, type HermesVoiceCheckpoint,
  type HermesVoiceIdentity, type HermesVoiceLanguage, type HermesVoicePayload, type HermesVoicePreset } from './voice-contract';

export interface HermesVoiceDeps extends AgentDeps { storage: StorageAdapter; voicePresets: readonly HermesVoicePreset[] }
export interface HermesVoiceExecution { identity: HermesVoiceIdentity; payload: HermesVoicePayload; checkpoint?: HermesVoiceCheckpoint }
export type HermesVoiceCheckpointUpdate = { phase: 'submitted'; providerId: string; credits?: number }
  | { phase: 'completed'; transcript?: string; audio?: HermesVoiceAudio; credits?: number } | { phase: 'failed'; credits?: number };
type Tx = Prisma.TransactionClient;
/** Compare absence too: SQL NULL and JSON null are both read as null by Prisma. */
function voiceResultEquals(result: unknown) {
  return { equals: result == null ? Prisma.AnyNull : result as Prisma.InputJsonValue };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const credit = (value: unknown): boolean => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
function blocked(message = HERMES_VOICE_HOLD): never { throw new AgentError('ILLEGAL_TRANSITION', message); }
function unavailable(): never { throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', 'Hermes 语音任务不存在或当前不可访问'); }
function invalid(message: string): never { throw new AgentError('VALIDATION_ERROR', message); }
function requireVoiceWriter(): void {
  if (!isHermesVoiceWriterEnabled()) blocked(HERMES_VOICE_READER_ONLY);
}
function requestKey(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) invalid('语音请求需要有效的 UUID 幂等键');
  return value.toLowerCase();
}
const keysAllowed = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));

/** Only the recorder's canonical PCM16/mono/16kHz WAV subset is accepted. */
export function validateHermesVoiceRecording(recording: Buffer): { bytes: number; durationSeconds: number } {
  const bytes = recording.length;
  if (bytes <= 44 || bytes > HERMES_VOICE_MAX_RECORDING_BYTES || (bytes - 44) % 2 !== 0
    || recording.toString('ascii', 0, 4) !== 'RIFF' || recording.readUInt32LE(4) !== bytes - 8
    || recording.toString('ascii', 8, 12) !== 'WAVE' || recording.toString('ascii', 12, 16) !== 'fmt '
    || recording.readUInt32LE(16) !== 16 || recording.readUInt16LE(20) !== 1
    || recording.readUInt16LE(22) !== 1 || recording.readUInt32LE(24) !== 16_000
    || recording.readUInt32LE(28) !== 32_000 || recording.readUInt16LE(32) !== 2
    || recording.readUInt16LE(34) !== 16 || recording.toString('ascii', 36, 40) !== 'data'
    || recording.readUInt32LE(40) !== bytes - 44) invalid('请录制不超过 60 秒的 16kHz 单声道 PCM16 WAV 语音');
  const durationSeconds = (bytes - 44) / 32_000;
  if (durationSeconds > HERMES_VOICE_MAX_RECORDING_SECONDS) invalid('语音最长为 60 秒，请缩短后重试');
  return { bytes, durationSeconds };
}

function validAudio(audio: unknown): audio is HermesVoiceAudio {
  return record(audio) && keysAllowed(audio, ['objectKey', 'sha256', 'bytes', 'contentType'])
    && nonempty(audio.objectKey) && /^derived\/hermes-voice\/[^\s?#\\]+\.(?:mp3|wav)$/u.test(audio.objectKey)
    && !audio.objectKey.split('/').includes('..') && hash(audio.sha256)
    && Number.isSafeInteger(audio.bytes) && Number(audio.bytes) > 0 && Number(audio.bytes) <= 20 * 1024 * 1024
    && ((audio.contentType === 'audio/mpeg' && audio.objectKey.endsWith('.mp3'))
      || (audio.contentType === 'audio/wav' && audio.objectKey.endsWith('.wav') && Number(audio.bytes) <= 16 * 1024 * 1024));
}
function readPayload(value: unknown, kind: string): HermesVoicePayload {
  if (!record(value)) blocked('语音请求数据已改变');
  if (kind === 'voice.transcribe' && value.operation === 'transcription'
    && keysAllowed(value, ['operation', 'objectKey', 'sha256', 'bytes', 'durationSeconds', 'language'])
    && nonempty(value.objectKey) && /^derived\/hermes-voice\/[^\s?#\\]+\.wav$/u.test(value.objectKey)
    && !value.objectKey.split('/').includes('..') && hash(value.sha256)
    && Number.isSafeInteger(value.bytes) && Number(value.bytes) > 44 && Number(value.bytes) <= HERMES_VOICE_MAX_RECORDING_BYTES
    && (Number(value.bytes) - 44) % 2 === 0 && value.durationSeconds === (Number(value.bytes) - 44) / 32_000
    && (value.language === undefined || value.language === 'zh' || value.language === 'en')) return value as unknown as HermesVoicePayload;
  if (kind === 'voice.reply' && value.operation === 'reply'
    && keysAllowed(value, ['operation', 'sourceTaskId', 'sourceExecutionAttempt', 'spokenText', 'voiceId'])
    && nonempty(value.sourceTaskId) && Number.isSafeInteger(value.sourceExecutionAttempt) && Number(value.sourceExecutionAttempt) >= 0
    && nonempty(value.spokenText) && value.spokenText.trim().length > 0
    && Buffer.byteLength(value.spokenText, 'utf8') <= HERMES_VOICE_REPLY_MAX_UTF8_BYTES && nonempty(value.voiceId)) return value as unknown as HermesVoicePayload;
  blocked('语音请求数据已改变');
}
export function readHermesVoiceCheckpoint(result: unknown): HermesVoiceCheckpoint | undefined {
  if (!hasHermesVoiceCheckpoint(result)) return undefined;
  const cp = (result as Record<string, unknown>)[HERMES_VOICE_RECEIPT_KEY];
  if (!record(cp) || !keysAllowed(cp, ['identity', 'request', 'phase', 'providerId', 'credits', 'transcript', 'audio'])
    || !record(cp.identity) || !keysAllowed(cp.identity, ['taskId', 'sessionId', 'userId', 'researchObjectId', 'kind', 'executionAttempt'])
    || !['taskId', 'sessionId', 'userId'].every(key => nonempty(cp.identity && (cp.identity as Record<string, unknown>)[key]))
    || !nonempty(cp.identity.kind) || !isHermesVoiceTaskKind(cp.identity.kind)
    || !(cp.identity.researchObjectId === null || nonempty(cp.identity.researchObjectId))
    || !Number.isSafeInteger(cp.identity.executionAttempt) || Number(cp.identity.executionAttempt) < 1
    || !['submitting', 'submitted', 'completed', 'failed'].includes(String(cp.phase)) || !credit(cp.credits)
    || (cp.providerId !== undefined && (!nonempty(cp.providerId) || cp.providerId.length > 512 || /[\s\p{Cc}]/u.test(cp.providerId)))
    || (cp.phase !== 'submitting' && !nonempty(cp.providerId))
    || (cp.phase === 'submitting' && (cp.providerId !== undefined || cp.credits !== undefined))
    || (cp.phase !== 'completed' && (cp.transcript !== undefined || cp.audio !== undefined))) blocked('私有语音回执无效');
  const payload = readPayload(cp.request, cp.identity.kind);
  if (payload.operation === 'transcription' && !payload.objectKey.startsWith(`derived/hermes-voice/${encodeURIComponent(String(cp.identity.userId))}/`)) blocked('私有录音身份不匹配');
  if (cp.phase === 'completed' && (payload.operation === 'transcription'
    ? typeof cp.transcript !== 'string' || cp.transcript.length > 20_000 || cp.audio !== undefined
    : !validAudio(cp.audio) || cp.transcript !== undefined
      || cp.audio.objectKey !== `derived/hermes-voice/${encodeURIComponent(String(cp.identity.userId))}/${cp.identity.taskId}/${cp.audio.sha256}.${cp.audio.contentType === 'audio/wav' ? 'wav' : 'mp3'}`)) blocked('私有语音完成回执无效');
  return cp as unknown as HermesVoiceCheckpoint;
}

async function sessionAuthority(tx: Tx, sessionId: string, userId: string): Promise<{ session: AgentSession; workspaceId: string | null }> {
  const session = await tx.agentSession.findUnique({ where: { id: sessionId } });
  if (!session || session.deletedAt || session.status !== 'active' || session.kind !== 'workspace.guide' || session.userId !== userId) unavailable();
  if (!session.researchObjectId) return { session, workspaceId: null };
  const ro = await tx.researchObject.findUnique({ where: { id: session.researchObjectId } });
  if (!ro || ro.deletedAt) unavailable();
  try {
    const { workspace } = await requireActiveMembership(tx, ro.workspaceId, userId);
    if (workspace.status !== 'active') unavailable();
  } catch { unavailable(); }
  return { session, workspaceId: ro.workspaceId };
}
async function sourceAuthority(tx: Tx, sessionId: string, payload: HermesVoicePayload): Promise<void> {
  if (payload.operation !== 'reply') return;
  const source = await tx.agentTask.findUnique({ where: { id: payload.sourceTaskId } });
  if (!source || source.deletedAt || source.sessionId !== sessionId || source.kind !== 'workspace.guide'
    || source.status !== 'succeeded' || isHermesVoiceStopped(source) || source.executionAttempt !== payload.sourceExecutionAttempt
    || !record(source.result) || source.result.summary !== payload.spokenText) unavailable();
}
async function taskAuthority(tx: Tx, taskId: string, userId?: string) {
  const task = await tx.agentTask.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt || !isHermesVoiceTaskKind(task.kind)) unavailable();
  const session = await tx.agentSession.findUnique({ where: { id: task.sessionId } });
  if (!session) unavailable();
  const scope = await sessionAuthority(tx, task.sessionId, userId ?? session.userId);
  const payload = readPayload(task.payload, task.kind);
  if (payload.operation === 'transcription' && (!task.idempotencyKey
    || payload.objectKey !== `derived/hermes-voice/${encodeURIComponent(scope.session.userId)}/${task.idempotencyKey}/${payload.sha256}.wav`)) blocked('录音对象不属于当前请求');
  const checkpoint = readHermesVoiceCheckpoint(task.result);
  if (checkpoint && (checkpoint.identity.taskId !== task.id || checkpoint.identity.kind !== task.kind
    || checkpoint.identity.sessionId !== task.sessionId || checkpoint.identity.userId !== scope.session.userId
    || checkpoint.identity.researchObjectId !== scope.session.researchObjectId || !isDeepStrictEqual(checkpoint.request, payload))) blocked('语音请求身份已改变');
  await sourceAuthority(tx, task.sessionId, payload);
  return { task, ...scope, payload, checkpoint };
}
function voiceView(task: AgentTask, checkpoint: HermesVoiceCheckpoint | undefined): AgentTaskView {
  if (!isHermesVoiceTaskKind(task.kind)) unavailable();
  return { ...taskToView(task), canRetry: false,
    result: projectHermesVoiceResult(task.kind, task.status, checkpoint, isHermesVoiceStopped(task)),
    error: isHermesVoiceStopped(task) ? '语音任务已停止' : task.status === 'failed'
      ? checkpoint?.phase === 'submitting' ? '供应商接收状态未知，已暂停；不会自动重新收费'
        : checkpoint?.phase === 'submitted' || checkpoint?.phase === 'completed' ? '语音任务已暂停，可恢复已保存的供应商任务'
          : '语音处理失败，请检查录音或回复后重新发起' : null };
}
function exactReplay(task: AgentTask, sessionId: string, kind: string, payload: HermesVoicePayload): void {
  if (task.deletedAt) unavailable();
  if (task.sessionId !== sessionId || task.kind !== kind || !isDeepStrictEqual(task.payload, payload)) invalid('幂等键已用于其他录音或语音请求');
}
async function dispatchCommitted(deps: HermesVoiceDeps, task: AgentTask): Promise<void> {
  if (task.status === 'pending') {
    try { await dispatchAgentTask(deps, task.id); } catch { /* The committed pending task remains in the existing DB outbox. */ }
  }
}
async function submissionTransaction<T>(deps: HermesVoiceDeps, run: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await deps.prisma.$transaction(run, { isolationLevel: 'Serializable', timeout: 20_000 }); }
    catch (error) {
      if (attempt >= 2 || ((error as { code?: unknown })?.code !== 'P2034' && !isOwnedPrismaIdempotencyConflict(error))) throw error;
    }
  }
}
async function storeRecording(deps: HermesVoiceDeps, objectKey: string, recording: Buffer, sha256: string): Promise<boolean> {
  const head = await deps.storage.headObject(objectKey);
  if (head) {
    if (head.size !== recording.length || head.sha256 !== sha256) blocked('既有录音对象不匹配，已保护原文件');
    return false;
  }
  const stored = await deps.storage.putObject(objectKey, recording, { contentType: 'audio/wav', sha256 });
  if (stored.key !== objectKey || stored.size !== recording.length) blocked('录音保存失败');
  return true;
}

export async function submitHermesVoiceTranscription(deps: HermesVoiceDeps, input: {
  userId: string; sessionId: string; idempotencyKey: string; recording: Buffer; language?: HermesVoiceLanguage;
}, ctx: AuditContext = {}): Promise<AgentTaskView> {
  requireVoiceWriter();
  const idempotencyKey = requestKey(input.idempotencyKey);
  if (input.language !== undefined && !['zh', 'en'].includes(input.language)) invalid('语音语言仅支持 zh 或 en');
  const meta = validateHermesVoiceRecording(input.recording), sha256 = sha256HexBuffer(input.recording);
  const objectKey = `derived/hermes-voice/${encodeURIComponent(input.userId)}/${idempotencyKey}/${sha256}.wav`;
  const payload: HermesVoicePayload = { operation: 'transcription', objectKey, sha256, ...meta,
    ...(input.language ? { language: input.language } : {}) };
  let createdObject = false;
  let task: AgentTask;
  try {
    task = await submissionTransaction(deps, async tx => {
      await lockTrashReferences(tx);
      await sessionAuthority(tx, input.sessionId, input.userId);
      const existing = await tx.agentTask.findUnique({ where: { idempotencyKey } });
      if (existing) { exactReplay(existing, input.sessionId, 'voice.transcribe', payload); return existing; }
      createdObject = await storeRecording(deps, objectKey, input.recording, sha256) || createdObject;
      return (await persistHermesVoiceTaskInTransaction(deps, tx, { userId: input.userId,
        sessionId: input.sessionId, kind: 'voice.transcribe', payload: { ...payload }, idempotencyKey }, ctx)).task;
    });
  } catch (error) {
    if (createdObject) {
      // Only this producer's known new object; take the normal reference lock before removing an orphan.
      try { await deps.prisma.$transaction(async tx => {
        await lockTrashReferences(tx);
        const existing = await tx.agentTask.findUnique({ where: { idempotencyKey } });
        if (!existing || !record(existing.payload) || existing.payload.objectKey !== objectKey) await deps.storage.deleteObject(objectKey);
      }); } catch { /* Uncertain DB/storage state keeps input for exact replay; never delete referenced/paid data. */ }
    }
    throw error;
  }
  await dispatchCommitted(deps, task);
  return getHermesVoiceTask(deps, { taskId: task.id, userId: input.userId });
}

function permittedVoice(deps: HermesVoiceDeps, voiceId: string): void {
  if (!deps.voicePresets.some(voice => voice.id === voiceId && voice.creditsPerRequest === 1)) invalid('请选择当前可用的标准音色');
}
export async function submitHermesVoiceReply(deps: HermesVoiceDeps, input: {
  userId: string; sourceTaskId: string; voiceId: string; idempotencyKey: string;
}, ctx: AuditContext = {}): Promise<AgentTaskView> {
  requireVoiceWriter();
  const idempotencyKey = requestKey(input.idempotencyKey);
  const task = await submissionTransaction(deps, async tx => {
    await lockTrashReferences(tx);
    const source = await tx.agentTask.findUnique({ where: { id: input.sourceTaskId } });
    if (!source || source.deletedAt || source.kind !== 'workspace.guide' || source.status !== 'succeeded'
      || !record(source.result) || typeof source.result.summary !== 'string' || !source.result.summary.trim()) invalid('请先完成 Hermes 对话，再朗读该回复');
    await sessionAuthority(tx, source.sessionId, input.userId);
    if (Buffer.byteLength(source.result.summary, 'utf8') > HERMES_VOICE_REPLY_MAX_UTF8_BYTES) invalid('这条 Hermes 回复超过 1000 字节，请让 Hermes 给出更简短的回复后再朗读');
    const payload: HermesVoicePayload = { operation: 'reply', sourceTaskId: source.id,
      sourceExecutionAttempt: source.executionAttempt, spokenText: source.result.summary, voiceId: input.voiceId };
    await sourceAuthority(tx, source.sessionId, payload);
    const existing = await tx.agentTask.findUnique({ where: { idempotencyKey } });
    if (existing) { exactReplay(existing, source.sessionId, 'voice.reply', payload); return existing; }
    permittedVoice(deps, input.voiceId);
    return (await persistHermesVoiceTaskInTransaction(deps, tx, { userId: input.userId,
      sessionId: source.sessionId, kind: 'voice.reply', payload: { ...payload }, idempotencyKey }, ctx)).task;
  });
  await dispatchCommitted(deps, task);
  return getHermesVoiceTask(deps, { taskId: task.id, userId: input.userId });
}
export async function getHermesVoiceTask(deps: HermesVoiceDeps, input: { userId: string; taskId: string }): Promise<AgentTaskView> {
  return deps.prisma.$transaction(async tx => {
    const { task, checkpoint } = await taskAuthority(tx, input.taskId, input.userId);
    return voiceView(task, checkpoint);
  });
}
export async function findHermesVoiceSubmission(deps: HermesVoiceDeps, input: { userId: string; idempotencyKey: string }): Promise<AgentTaskView> {
  const idempotencyKey = requestKey(input.idempotencyKey);
  return deps.prisma.$transaction(async tx => {
    const existing = await tx.agentTask.findUnique({ where: { idempotencyKey } });
    if (!existing) unavailable();
    const { task, checkpoint } = await taskAuthority(tx, existing.id, input.userId);
    return voiceView(task, checkpoint);
  });
}

export async function loadHermesVoiceExecution(deps: HermesVoiceDeps, input: { taskId: string; executionAttempt: number }): Promise<HermesVoiceExecution> {
  return deps.prisma.$transaction(async tx => {
    const scope = await taskAuthority(tx, input.taskId);
    if (scope.task.status !== 'running' || scope.task.executionAttempt !== input.executionAttempt || isHermesVoiceStopped(scope.task)) blocked('语音执行已停止或被接管');
    return { identity: { taskId: scope.task.id, sessionId: scope.session.id, userId: scope.session.userId,
      researchObjectId: scope.session.researchObjectId, kind: scope.task.kind as HermesVoiceIdentity['kind'], executionAttempt: input.executionAttempt },
    payload: scope.payload, ...(scope.checkpoint ? { checkpoint: scope.checkpoint } : {}) };
  });
}

/** Match the live-parent triggers' global-first lock order; every authority transaction stays short. */
async function lockExecutionAuthority(tx: Tx, execution: HermesVoiceExecution) {
  await lockTrashReferences(tx);
  if (execution.identity.researchObjectId) await lockLiveResearchObject(tx, execution.identity.researchObjectId);
  await tx.$queryRaw`SELECT id FROM agent_sessions WHERE id = ${execution.identity.sessionId}::uuid FOR UPDATE`;
  const ids = [execution.identity.taskId, ...(execution.payload.operation === 'reply' ? [execution.payload.sourceTaskId] : [])].sort();
  for (const id of ids) await tx.$queryRaw`SELECT id FROM agent_tasks WHERE id = ${id}::uuid FOR UPDATE`;
  const scope = await taskAuthority(tx, execution.identity.taskId, execution.identity.userId);
  if (scope.workspaceId) {
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${scope.workspaceId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM memberships WHERE workspace_id = ${scope.workspaceId}::uuid AND user_id = ${execution.identity.userId}::uuid FOR KEY SHARE`;
  }
  // Under ReadCommitted this read follows any revocation that won the membership row lock.
  const live = await taskAuthority(tx, execution.identity.taskId, execution.identity.userId);
  if (live.task.status !== 'running' || live.task.executionAttempt !== execution.identity.executionAttempt
    || isHermesVoiceStopped(live.task) || live.session.id !== execution.identity.sessionId
    || live.session.researchObjectId !== execution.identity.researchObjectId || live.task.kind !== execution.identity.kind
    || !isDeepStrictEqual(live.payload, execution.payload)) blocked('语音执行已停止或请求已改变');
  return live;
}
async function prepareSubmission(deps: HermesVoiceDeps, execution: HermesVoiceExecution): Promise<HermesVoiceCheckpoint> {
  return deps.prisma.$transaction(async tx => {
    const live = await lockExecutionAuthority(tx, execution);
    if (hasHermesVoiceCheckpoint(live.task.result)) blocked();
    if (live.payload.operation === 'reply') permittedVoice(deps, live.payload.voiceId);
    const checkpoint: HermesVoiceCheckpoint = { identity: { ...execution.identity }, request: execution.payload, phase: 'submitting' };
    const changed = await tx.agentTask.updateMany({ where: { id: live.task.id, status: 'running', deletedAt: null,
      executionAttempt: execution.identity.executionAttempt, result: voiceResultEquals(live.task.result) },
      data: { result: { [HERMES_VOICE_RECEIPT_KEY]: checkpoint } as unknown as Prisma.InputJsonObject } });
    if (changed.count !== 1) blocked();
    return checkpoint;
  }, { isolationLevel: 'ReadCommitted', timeout: 20_000 });
}
/** The callback starts its HTTP request synchronously; only its response is awaited after commit.
 * A saved intent never grants another process a supplier POST. */
export async function withHermesVoiceSubmission(deps: HermesVoiceDeps, execution: HermesVoiceExecution,
  create: (signal: AbortSignal) => Promise<{ providerId: string; credits?: number }>): Promise<HermesVoiceCheckpoint> {
  requireVoiceWriter();
  const prepared = await prepareSubmission(deps, execution);
  let sent: Promise<{ providerId: string; credits?: number }> | undefined;
  try {
    await deps.prisma.$transaction(async tx => {
      const live = await lockExecutionAuthority(tx, execution);
      if (!isDeepStrictEqual(live.checkpoint, prepared)) blocked();
      if (live.payload.operation === 'reply') permittedVoice(deps, live.payload.voiceId);
      sent = create(AbortSignal.timeout(15_000));
      void sent.catch(() => undefined);
    }, { isolationLevel: 'ReadCommitted', timeout: 20_000 });
  } catch (error) {
    // Once sent, commit uncertainty cannot grant a second request or discard its paid response.
    if (!sent) throw error;
  }
  if (!sent) blocked();
  const received = await sent;
  return saveHermesVoiceCheckpoint(deps, prepared.identity, { phase: 'submitted', ...received });
}

/** Receipt retention deliberately does not require a live owner, status or execution generation. */
export async function saveHermesVoiceCheckpoint(deps: HermesVoiceDeps, identity: HermesVoiceIdentity,
  update: HermesVoiceCheckpointUpdate): Promise<HermesVoiceCheckpoint> {
  const checkpoint = await deps.prisma.$transaction(async tx => {
    await lockTrashReferences(tx);
    await tx.$queryRaw`SELECT id FROM agent_tasks WHERE id = ${identity.taskId}::uuid FOR UPDATE`;
    const task = await tx.agentTask.findUnique({ where: { id: identity.taskId } });
    const prior = readHermesVoiceCheckpoint(task?.result);
    if (!task || !prior || !isDeepStrictEqual(prior.identity, identity) || task.kind !== identity.kind
      || task.sessionId !== identity.sessionId || !isDeepStrictEqual(task.payload, prior.request)) blocked('原语音付费请求身份不匹配');
    const next: HermesVoiceCheckpoint = { ...prior, ...update };
    if (isDeepStrictEqual(prior, next)) return prior;
    if ((prior.phase === 'completed' || prior.phase === 'failed')
      || (update.phase === 'submitted' && prior.phase !== 'submitting')
      || (update.phase !== 'submitted' && prior.phase !== 'submitted')) blocked('语音回执终态不可覆盖');
    const result = { ...(record(task.result) ? task.result : {}), [HERMES_VOICE_RECEIPT_KEY]: next };
    readHermesVoiceCheckpoint(result);
    // Only the exact original receipt may survive trash; status/attempt/authority are never rearmed.
    const session = await tx.agentSession.findUnique({ where: { id: task.sessionId } });
    const ro = session?.researchObjectId ? await tx.researchObject.findUnique({ where: { id: session.researchObjectId } }) : null;
    if (task.deletedAt || session?.deletedAt || ro?.deletedAt) {
      await tx.$executeRaw`SELECT set_config('openscience.trash_mutation', 'on', true)`;
    }
    const changed = await tx.agentTask.updateMany({ where: { id: task.id, kind: task.kind, sessionId: task.sessionId,
      result: voiceResultEquals(task.result) }, data: { result: result as unknown as Prisma.InputJsonObject } });
    if (changed.count !== 1) blocked('语音回执已由其他执行更新');
    return next;
  }, { isolationLevel: 'ReadCommitted', timeout: 20_000 });
  if (checkpoint.audio) await rememberDiscardedTaskResult(deps.prisma, identity.taskId, { [HERMES_VOICE_RECEIPT_KEY]: checkpoint });
  return checkpoint;
}
export async function finalizeHermesVoiceTask(deps: HermesVoiceDeps, execution: HermesVoiceExecution): Promise<AgentTaskView> {
  return deps.prisma.$transaction(async tx => {
    const live = await lockExecutionAuthority(tx, execution);
    if (live.checkpoint?.phase !== 'completed') blocked('语音尚未完成');
    const changed = await tx.agentTask.updateMany({ where: { id: live.task.id, deletedAt: null, status: 'running',
      executionAttempt: execution.identity.executionAttempt, result: voiceResultEquals(live.task.result) },
      data: { status: 'succeeded', progress: 100, error: null } });
    if (changed.count !== 1) blocked('语音完成时执行权限已改变');
    const task = await tx.agentTask.findUnique({ where: { id: live.task.id } });
    if (!task) unavailable();
    return voiceView(task, live.checkpoint);
  }, { isolationLevel: 'ReadCommitted', timeout: 20_000 });
}
export async function resumeHermesVoiceTask(deps: HermesVoiceDeps, input: { userId: string; taskId: string }, ctx: AuditContext = {}): Promise<AgentTaskView> {
  const task = await deps.prisma.$transaction(async tx => {
    await lockTrashReferences(tx);
    const live = await taskAuthority(tx, input.taskId, input.userId);
    const cp = live.checkpoint;
    if (isHermesVoiceStopped(live.task) || !cp?.providerId || !['submitted', 'completed'].includes(cp.phase)) blocked('只有已保存供应商任务的暂停语音可以恢复');
    if (live.task.status === 'succeeded' || live.task.status === 'pending' || live.task.status === 'running') return live.task;
    if (live.task.status !== 'failed') blocked();
    const changed = await tx.agentTask.updateMany({ where: { id: live.task.id, status: 'failed', deletedAt: null,
      error: live.task.error, executionAttempt: live.task.executionAttempt, result: voiceResultEquals(live.task.result) },
      data: { status: 'pending', error: null, dispatchedAt: null } });
    if (changed.count !== 1) blocked('语音恢复状态已改变');
    await recordAudit(deps, tx, { actorId: input.userId, action: 'agent.voice.resume', workspaceId: live.workspaceId,
      targetType: 'agent_task', targetId: live.task.id, metadata: { operation: live.payload.operation } }, ctx);
    return (await tx.agentTask.findUnique({ where: { id: live.task.id } }))!;
  }, { isolationLevel: 'ReadCommitted', timeout: 20_000 });
  await dispatchCommitted(deps, task);
  return getHermesVoiceTask(deps, input);
}
export async function getHermesVoiceAudio(deps: HermesVoiceDeps, input: { userId: string; taskId: string }): Promise<HermesVoiceAudio> {
  const audio = await deps.prisma.$transaction(async tx => {
    const live = await taskAuthority(tx, input.taskId, input.userId);
    if (live.task.status !== 'succeeded' || isHermesVoiceStopped(live.task) || live.payload.operation !== 'reply'
      || live.checkpoint?.phase !== 'completed' || !validAudio(live.checkpoint.audio)) unavailable();
    const prefix = `derived/hermes-voice/${encodeURIComponent(input.userId)}/`;
    if (!live.checkpoint.audio.objectKey.startsWith(prefix)) blocked('语音文件身份不匹配');
    return live.checkpoint.audio;
  });
  const head = await deps.storage.headObject(audio.objectKey);
  if (!head || head.size !== audio.bytes || head.sha256 !== audio.sha256 || head.contentType !== audio.contentType) unavailable();
  return audio;
}

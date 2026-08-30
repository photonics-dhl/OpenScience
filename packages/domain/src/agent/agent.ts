import type { Redis } from 'ioredis';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, type AgentSession, type AgentTask } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import { requireActiveMembership, requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { recordEntry } from '../usage/ledger';
import type { WorkspaceDeps } from '../workspace/types';
import { AgentError } from './errors';
import type { InterestContext } from '../research-intelligence/types';
import { buildInterestContext, validateInterestContext } from '../research-intelligence/interest-context';
import { ResearchIdentityProfileError, validateResearchIdentityProfileState } from '../research-intelligence/identity-profile-service';
import { ResearchIntelligenceValidationError } from '../research-intelligence/validation';
import { parseWorkspaceGuidePayload } from './workspace-guide-contract';
import { isOwnedPrismaIdempotencyConflict, throwOwnedPrismaIdempotencyConflict } from '../prisma-idempotency-conflict';

export const AGENT_TASK_QUEUE = 'agent:queue';
export const AI_CREDIT_RESOURCE = 'ai_credit'; // §2.4-7 配额骨架（P1A-7）
export const AGENT_TASK_KINDS = [
  'demo.echo', 'sdf.extract', 'review.analyze', 'visualization.plan', 'workspace.guide', 'search.index', 'source.retrieve',
] as const;
export const PUBLIC_AGENT_TASK_KINDS = [
  'demo.echo', 'sdf.extract', 'review.analyze', 'visualization.plan',
] as const;
export const PUBLIC_AGENT_SESSION_KINDS = [
  'extract', 'review', 'visualization', 'publish', 'ingestion', 'workspace.guide',
] as const;

export type AgentTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/** 状态机合法迁移（§16 幂等：succeeded 终态不可回退）。 */
const ALLOWED: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  pending: ['running', 'failed'],
  running: ['succeeded', 'failed'],
  succeeded: [],
  failed: ['running'], // 重试
};

/** Agent 依赖：WorkspaceDeps + Redis（队列）。 */
export interface AgentDeps extends WorkspaceDeps {
  redis: Redis;
}

export interface AgentTaskView {
  id: string;
  sessionId: string;
  kind: string;
  status: AgentTaskStatus;
  progress: number;
  retryCount: number;
  executionAttempt: number;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSessionView {
  id: string;
  researchObjectId: string | null;
  kind: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface AgentTaskListItem extends AgentTaskView {
  researchObjectId: string | null;
}

function assertSessionReplay(
  existing: { userId: string; researchObjectId: string | null; kind: string; title: string },
  input: { userId: string; researchObjectId?: string; kind: string; title?: string },
): void {
  if (existing.userId !== input.userId || existing.researchObjectId !== (input.researchObjectId ?? null)
    || existing.kind !== input.kind || existing.title !== (input.title ?? '')) {
    throw new AgentError('VALIDATION_ERROR', '幂等键已用于其他 Hermes 会话');
  }
}

function assertTaskReplay(
  existing: { sessionId: string; kind: string; payload: unknown; interestContext: unknown },
  input: { sessionId: string; kind: string; payload: Record<string, unknown> },
  researchObjectId: string | null,
  requestedContext: InterestContext | undefined,
): void {
  if (existing.sessionId !== input.sessionId || existing.kind !== input.kind || !isDeepStrictEqual(existing.payload, input.payload)) {
    throw new AgentError('VALIDATION_ERROR', '幂等键已用于其他 Hermes 任务');
  }
  if (existing.interestContext == null) {
    if (requestedContext?.activeClaimId) {
      throw new AgentError('VALIDATION_ERROR', '幂等键已用于缺少相同目标快照的旧 Hermes 任务');
    }
    if (requestedContext?.currentGoal) {
      let legacyGoal: string | undefined;
      try {
        legacyGoal = existing.kind === 'workspace.guide' ? parseWorkspaceGuidePayload(existing.payload).goal : undefined;
      } catch {
        legacyGoal = undefined;
      }
      if (legacyGoal !== requestedContext.currentGoal) {
        throw new AgentError('VALIDATION_ERROR', '幂等键已用于缺少相同目标快照的旧 Hermes 任务');
      }
    }
    return;
  }
  let snapshot: InterestContext;
  try {
    snapshot = validateInterestContext(existing.interestContext);
  } catch {
    throw new AgentError('VALIDATION_ERROR', '既有 Hermes 任务缺少有效 interest context');
  }
  if (snapshot.activeResearchObjectId !== (researchObjectId ?? undefined)
    || snapshot.currentGoal !== requestedContext?.currentGoal
    || snapshot.activeClaimId !== requestedContext?.activeClaimId) {
    throw new AgentError('VALIDATION_ERROR', '幂等键已用于其他 Hermes 任务');
  }
}

export interface CreateAgentSessionInput {
  userId: string;
  researchObjectId?: string;
  kind: string;
  title?: string;
  idempotencyKey?: string;
}

export interface SubmitAgentTaskInput {
  sessionId: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  interestContext?: InterestContext;
  idempotencyKey?: string;
  dispatch?: boolean;
}

const AGENT_SESSION_IDEMPOTENCY_CONSTRAINT = {
  modelName: 'AgentSession', field: 'idempotencyKey', column: 'idempotency_key',
  constraint: 'agent_sessions_idempotency_key_key',
} as const;

const AGENT_TASK_IDEMPOTENCY_CONSTRAINT = {
  modelName: 'AgentTask', field: 'idempotencyKey', column: 'idempotency_key',
  constraint: 'agent_tasks_idempotency_key_key',
} as const;

async function resolveInterestContext(
  db: Pick<Prisma.TransactionClient, 'researchIdentityProfile'>,
  userId: string,
  researchObjectId: string | null,
  requested: InterestContext | undefined,
): Promise<InterestContext> {
  const row = await db.researchIdentityProfile.findUnique({ where: { userId } });
  try {
    const profile = row ? validateResearchIdentityProfileState({
      identities: row.identities,
      primaryIdentity: row.primaryIdentity,
      disciplines: row.disciplines,
      methods: row.methods,
      topics: row.topics,
      languages: row.languages,
      acceptedSignals: row.acceptedSignals,
      rejectedSignals: row.rejectedSignals,
      profileVersion: row.profileVersion,
    }) : undefined;
    const authoritative = buildInterestContext({
      ...(profile ? { profile } : {}),
      ...(requested?.currentGoal ? { currentGoal: requested.currentGoal } : {}),
      ...(researchObjectId ? { activeResearchObjectId: researchObjectId } : {}),
      ...(requested?.activeClaimId ? { activeClaimId: requested.activeClaimId } : {}),
    });
    if (requested && !isDeepStrictEqual(requested, authoritative)) {
      throw new AgentError('VALIDATION_ERROR', 'Hermes interest context is stale or not server-owned');
    }
    return authoritative;
  } catch (error) {
    if (error instanceof AgentError) throw error;
    if (error instanceof ResearchIdentityProfileError || error instanceof ResearchIntelligenceValidationError) {
      throw new AgentError('VALIDATION_ERROR', 'Hermes interest context is invalid');
    }
    throw error;
  }
}

/** Dashboard task rail: caller-owned tasks with their RO context. */
export async function listAgentTasks(
  deps: AgentDeps,
  input: { userId: string; actionableOnly?: boolean; kind?: string },
): Promise<AgentTaskListItem[]> {
  const rows = await deps.prisma.agentTask.findMany({
    where: {
      session: { userId: input.userId },
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.actionableOnly ? { status: { in: ['pending', 'running', 'failed'] } } : {}),
    },
    include: { session: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  return rows.map((task) => ({ ...taskToView(task), researchObjectId: task.session.researchObjectId }));
}

/**
 * 建 Hermes 会话（§15 AgentSession）：
 * - researchObject 归属 workspace 成员校验（§17 越权）
 */
export async function findOrCreateAgentSessionInTransaction(
  deps: AgentDeps,
  tx: Prisma.TransactionClient,
  input: CreateAgentSessionInput,
  ctx: AuditContext = {},
): Promise<{ session: AgentSession; replayed: boolean }> {
  if (input.researchObjectId) {
    const ro = await tx.researchObject.findUnique({ where: { id: input.researchObjectId } });
    if (!ro) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    await requireMembership({ prisma: tx }, ro.workspaceId, input.userId);
  }
  if (input.idempotencyKey) {
    const existing = await tx.agentSession.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      assertSessionReplay(existing, input);
      return { session: existing, replayed: true };
    }
  }
  let session: AgentSession;
  try {
    session = await tx.agentSession.create({
      data: { userId: input.userId, researchObjectId: input.researchObjectId ?? null, kind: input.kind, title: input.title ?? '', idempotencyKey: input.idempotencyKey },
    });
  } catch (error) {
    if (!input.idempotencyKey) throw error;
    throwOwnedPrismaIdempotencyConflict(error, AGENT_SESSION_IDEMPOTENCY_CONSTRAINT);
  }
  await recordAudit(deps, tx, {
    actorId: input.userId, action: 'agent.session.create', targetType: 'agent_session', targetId: session.id,
    metadata: { kind: input.kind },
  }, ctx);
  return { session, replayed: false };
}

export async function createAgentSession(
  deps: AgentDeps,
  input: CreateAgentSessionInput,
  ctx: AuditContext = {},
): Promise<AgentSessionView> {
  let result: { session: AgentSession; replayed: boolean };
  try {
    result = await deps.prisma.$transaction((tx) => findOrCreateAgentSessionInTransaction(deps, tx, input, ctx));
  } catch (error: unknown) {
    if (!input.idempotencyKey || !isOwnedPrismaIdempotencyConflict(error)) throw error;
    result = await deps.prisma.$transaction((tx) => findOrCreateAgentSessionInTransaction(deps, tx, input, ctx));
  }
  const { session } = result;
  return {
    id: session.id, researchObjectId: session.researchObjectId, kind: session.kind,
    title: session.title, status: session.status, createdAt: session.createdAt,
  };
}

/**
 * 提交异步任务（§9.3 长任务 + §9.1 配额/权限 + §16 幂等）：
 * 1. session 归属 + workspace 成员校验
 * 2. AI Credit 配额校验（getBalance ai_credit ≤ 0 → 拒绝）
 * 3. 幂等键查重（同 key → 返回既有任务）
 * 4. create pending in PostgreSQL; the public wrapper dispatches after commit
 */
export async function persistAgentTaskInTransaction(
  deps: AgentDeps,
  tx: Prisma.TransactionClient,
  input: Omit<SubmitAgentTaskInput, 'dispatch'>,
  ctx: AuditContext = {},
): Promise<{ task: AgentTask; replayed: boolean }> {
  const session = await tx.agentSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.userId !== input.userId) {
    throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '会话不存在');
  }
  if (!(AGENT_TASK_KINDS as readonly string[]).includes(input.kind)) {
    throw new AgentError('VALIDATION_ERROR', '不支持的 Hermes 任务类型');
  }
  if ((session.kind === 'workspace.guide') !== (input.kind === 'workspace.guide')) {
    throw new AgentError('VALIDATION_ERROR', 'Hermes 任务与会话类型不匹配');
  }
  let workspaceId: string | null = null;
  if (session.researchObjectId) {
    const ro = await tx.researchObject.findUnique({ where: { id: session.researchObjectId } });
    if (!ro) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    await requireActiveMembership(tx, ro.workspaceId, input.userId);
    workspaceId = ro.workspaceId;
  }
  const artifactId = input.kind === 'sdf.extract' && typeof input.payload.artifactId === 'string'
    ? input.payload.artifactId
    : null;
  if (artifactId) {
    if (!session.researchObjectId || !workspaceId || input.payload.researchObjectId !== session.researchObjectId) {
      throw new AgentError('VALIDATION_ERROR', 'Artifact 提取任务未绑定当前研究对象');
    }
    const artifact = await tx.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact || artifact.workspaceId !== workspaceId) {
      throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', 'Artifact 不存在或不可访问');
    }
  }
  if (input.kind === 'review.analyze') {
    const versionId = input.payload.versionId;
    const coreText = input.payload.coreText;
    if (session.kind !== 'review' || !session.researchObjectId
      || typeof versionId !== 'string' || typeof coreText !== 'string'
      || !coreText.trim() || coreText.length > 8_000) {
      throw new AgentError('VALIDATION_ERROR', 'review.analyze 任务缺少有效的会话、Version 或 coreText');
    }
    const version = await tx.version.findUnique({ where: { id: versionId } });
    if (!version || version.researchObjectId !== session.researchObjectId) {
      throw new AgentError('VALIDATION_ERROR', 'Version 不属于当前研究对象');
    }
  }
  let requestedContext: InterestContext | undefined;
  try {
    requestedContext = input.interestContext ? validateInterestContext(input.interestContext) : undefined;
  } catch {
    throw new AgentError('VALIDATION_ERROR', 'Hermes interest context is invalid');
  }

  // §16 exact replay precedes balance/debit so the last-credit replay remains valid.
  if (input.idempotencyKey) {
    const existing = await tx.agentTask.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      assertTaskReplay(existing, input, session.researchObjectId, requestedContext);
      return { task: existing, replayed: true };
    }
  }
  const interestContext = await resolveInterestContext(
    tx,
    input.userId,
    session.researchObjectId,
    requestedContext,
  );
  const balance = await tx.usageLedger.aggregate({
    where: { userId: input.userId, resource: AI_CREDIT_RESOURCE },
    _sum: { delta: true },
  });
  if (Number(balance._sum.delta ?? 0) <= 0) {
    throw new AgentError('INSUFFICIENT_CREDIT', 'AI Credit 不足（§2.4-7），请补充后再试');
  }
  let task: AgentTask;
  try {
    task = await tx.agentTask.create({
      data: {
        sessionId: session.id,
        kind: input.kind,
        payload: input.payload as never,
        interestContext: interestContext as never,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (error) {
    if (!input.idempotencyKey) throw error;
    throwOwnedPrismaIdempotencyConflict(error, AGENT_TASK_IDEMPOTENCY_CONSTRAINT);
  }
  await recordEntry(tx, {
    userId: input.userId,
    resource: AI_CREDIT_RESOURCE,
    delta: -1,
    kind: 'consume',
    reason: `Agent task reservation ${input.kind}`,
    idempotencyKey: `agent-task-reserve:${task.id}`,
    metadata: { taskId: task.id, kind: input.kind, policy: 'charged-on-submit' },
  });
  await recordAudit(deps, tx, {
    actorId: input.userId, action: 'agent.task.submit', workspaceId, targetType: 'agent_task', targetId: task.id,
    metadata: { kind: input.kind, sessionId: session.id, creditPolicy: 'charged-on-submit' },
  }, ctx);
  return { task, replayed: false };
}

export async function submitAgentTask(
  deps: AgentDeps,
  input: SubmitAgentTaskInput,
  ctx: AuditContext = {},
): Promise<AgentTaskView> {
  const { dispatch, ...persistenceInput } = input;
  let task: AgentTask | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      ({ task } = await deps.prisma.$transaction(
        (tx) => persistAgentTaskInTransaction(deps, tx, persistenceInput, ctx),
        { isolationLevel: 'Serializable' },
      ));
      break;
    } catch (error: unknown) {
      const code = (error as { code?: unknown })?.code;
      const idempotencyConflict = isOwnedPrismaIdempotencyConflict(error);
      if ((code === 'P2034' || idempotencyConflict) && attempt < 2) continue;
      if (idempotencyConflict) {
        throw new AgentError('DUPLICATE_IDEMPOTENCY_KEY', '幂等键重复（§16）', error);
      }
      throw error;
    }
  }
  if (!task) throw new AgentError('DUPLICATE_IDEMPOTENCY_KEY', '幂等任务并发冲突，请重试');
  if (dispatch !== false) await dispatchAgentTask(deps, task.id);
  return taskToView(task);
}

export async function dispatchAgentTask(deps: AgentDeps, taskId: string): Promise<boolean> {
  const task = await deps.prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task || task.dispatchedAt != null) return false;
  await deps.redis.lpush(AGENT_TASK_QUEUE, task.id);
  await deps.prisma.agentTask.updateMany({
    where: { id: task.id, dispatchedAt: null },
    data: { dispatchedAt: new Date() },
  });
  return true;
}

/** DB task rows with dispatchedAt=null are the durable queue outbox. */
export async function recoverUndispatchedAgentTasks(deps: AgentDeps, limit = 50): Promise<number> {
  const tasks = await deps.prisma.agentTask.findMany({
    where: { kind: { in: ['workspace.guide', 'sdf.extract', 'search.index', 'source.retrieve'] }, status: 'pending', dispatchedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let dispatched = 0;
  for (const task of tasks) {
    if (await dispatchAgentTask(deps, task.id)) dispatched += 1;
  }
  return dispatched;
}

/** Convert an interrupted running claim into the existing retryable failed state. */
export async function prepareAgentTaskForCrashRecovery(deps: AgentDeps, taskId: string): Promise<boolean> {
  const task = await deps.prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task) return false;
  if (task.status === 'pending') return true;
  if (task.status === 'failed' && task.error === '[retryable] worker interrupted') return true;
  if (task.status !== 'running') return false;
  const reset = await deps.prisma.agentTask.updateMany({
    where: { id: taskId, status: 'running' },
    data: { status: 'failed', error: '[retryable] worker interrupted' },
  });
  return reset.count === 1;
}

export async function claimAgentTask(deps: AgentDeps, taskId: string): Promise<AgentTaskView | null> {
  const task = await deps.prisma.$transaction(async (tx) => {
    const claimed = await tx.agentTask.updateMany({
      where: { id: taskId, status: { in: ['pending', 'failed'] } },
      data: { status: 'running', progress: 10, error: null, executionAttempt: { increment: 1 } },
    });
    if (claimed.count !== 1) return null;
    return tx.agentTask.findUnique({ where: { id: taskId } });
  }, { isolationLevel: 'Serializable' });
  if (!task) return null;
  await syncIngestionState(deps, task.id, 'running');
  return taskToView(task);
}

/** 任务进度查询（§18.3 可恢复：轮询拿最新状态，断线后重连自然恢复）。 */
export async function getAgentTask(
  deps: AgentDeps,
  input: { userId: string; taskId: string },
): Promise<AgentTaskView> {
  const task = await deps.prisma.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  if (!task || task.session.userId !== input.userId) {
    throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '任务不存在');
  }
  return taskToView(task);
}

/** One explicit, idempotent-cost retry of a failed task. The original credit reservation is reused. */
export async function retryAgentTask(
  deps: AgentDeps,
  input: { userId: string; taskId: string },
  ctx: AuditContext = {},
): Promise<AgentTaskView> {
  const task = await deps.prisma.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  if (!task || task.session.userId !== input.userId) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '任务不存在');
  if (task.status !== 'failed') throw new AgentError('ILLEGAL_TRANSITION', 'Only failed tasks can be retried');
  const payload = task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload)
    ? task.payload as Record<string, unknown>
    : {};
  const retryableExtractor = task.kind === 'sdf.extract'
    && typeof payload.manuscriptText === 'string'
    && !('artifactId' in payload)
    && !task.error?.startsWith('[blocked]');
  if (!retryableExtractor) throw new AgentError('ILLEGAL_TRANSITION', 'Task is not retryable');
  if (task.retryCount >= 1) throw new AgentError('ILLEGAL_TRANSITION', 'Task was already retried');

  let workspaceId: string | null = null;
  if (task.session.researchObjectId) {
    const ro = await deps.prisma.researchObject.findUnique({ where: { id: task.session.researchObjectId } });
    if (!ro) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    await requireMembership(deps, ro.workspaceId, input.userId);
    workspaceId = ro.workspaceId;
  }

  const updated = await deps.prisma.$transaction(async (tx) => {
    const changed = await tx.agentTask.updateMany({
      where: { id: task.id, status: 'failed', kind: 'sdf.extract', retryCount: 0, error: task.error },
      data: {
        status: 'pending', progress: 0, result: Prisma.JsonNull, error: null, dispatchedAt: null,
        retryCount: 1,
      },
    });
    if (changed.count !== 1) throw new AgentError('ILLEGAL_TRANSITION', 'Task retry is no longer available');
    await recordAudit(deps, tx, {
      actorId: input.userId, action: 'agent.task.retry', workspaceId,
      targetType: 'agent_task', targetId: task.id, metadata: { retryAttempt: 1, creditPolicy: 'reuse-original-reservation' },
    }, ctx);
    return tx.agentTask.findUnique({ where: { id: task.id } });
  });
  if (!updated) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '任务不存在');
  await dispatchAgentTask(deps, task.id);
  return taskToView(updated);
}

/** 会话列表（当前用户）。 */
export async function listAgentSessions(
  deps: AgentDeps,
  input: { userId: string },
): Promise<AgentSessionView[]> {
  const rows = await deps.prisma.agentSession.findMany({
    where: { userId: input.userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((s) => ({
    id: s.id, researchObjectId: s.researchObjectId, kind: s.kind,
    title: s.title, status: s.status, createdAt: s.createdAt,
  }));
}

/**
 * 任务进度推进（worker 调用，§16 幂等 + 状态机）：
 * - 状态机非法迁移 → ILLEGAL_TRANSITION
 * - 已 succeeded → skip（消费者幂等：重放不重复副作用）
 */
export async function markTaskProgress(
  deps: AgentDeps,
  input: {
    taskId: string;
    status: AgentTaskStatus;
    progress?: number;
    result?: Record<string, unknown>;
    error?: string | null;
    expectedExecutionAttempt?: number;
  },
): Promise<AgentTaskView> {
  const task = await deps.prisma.agentTask.findUnique({ where: { id: input.taskId }, include: { session: true } });
  if (!task) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '任务不存在');
  const from = task.status as AgentTaskStatus;
  if (input.expectedExecutionAttempt !== undefined
    && task.executionAttempt !== input.expectedExecutionAttempt) {
    throw new AgentError('ILLEGAL_TRANSITION', '任务执行代际已被新的 worker 接管');
  }

  // 消费者幂等：终态 succeeded 后 skip（§16 重放不重复副作用）
  if (from === 'succeeded') return taskToView(task);

  if (from === input.status) {
    // 同状态仅更新 progress（running→running 进度推进）
    if (input.progress !== undefined && input.progress >= (task.progress ?? 0)) {
      const changed = await deps.prisma.agentTask.updateMany({
        where: {
          id: task.id,
          status: from,
          ...(input.expectedExecutionAttempt === undefined
            ? {}
            : { executionAttempt: input.expectedExecutionAttempt }),
        },
        data: { progress: input.progress },
      });
      if (changed.count !== 1) throw new AgentError('ILLEGAL_TRANSITION', '任务执行代际已被新的 worker 接管');
    }
    await syncIngestionState(deps, task.id, input.status, input.error);
    return taskToView(task);
  }

  if (!(ALLOWED[from] ?? []).includes(input.status)) {
    throw new AgentError('ILLEGAL_TRANSITION', `任务状态 ${from} → ${input.status} 非法`);
  }

  const updated = await deps.prisma.$transaction(async (tx) => {
    const changed = await tx.agentTask.updateMany({
      where: {
        id: task.id,
        status: from,
        ...(input.expectedExecutionAttempt === undefined
          ? {}
          : { executionAttempt: input.expectedExecutionAttempt }),
      },
      data: {
        status: input.status,
        ...(input.progress !== undefined ? { progress: input.progress } : {}),
        ...(input.result !== undefined ? { result: input.result as never } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
      },
    });
    if (changed.count !== 1) throw new AgentError('ILLEGAL_TRANSITION', '任务执行代际已被新的 worker 接管');
    const row = await tx.agentTask.findUnique({ where: { id: task.id } });
    if (!row) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '任务不存在');
    return row;
  });
  await syncIngestionState(deps, task.id, input.status, input.error);
  return taskToView(updated);
}

async function syncIngestionState(
  deps: AgentDeps,
  agentTaskId: string,
  status: AgentTaskStatus,
  error?: string | null,
): Promise<void> {
  const state = status === 'running'
    ? 'parsing'
    : status === 'succeeded'
      ? 'needs_review'
      : status === 'failed'
        ? (error?.startsWith('[blocked]') ? 'failed_blocked' : 'failed_retryable')
        : 'queued';
  await deps.prisma.ingestionTask.updateMany({
    where: { agentTaskId },
    data: { state, ...(status === 'failed' ? { error: error ?? 'Extraction failed' } : { error: null }) },
  });
}

function taskToView(task: {
  id: string; sessionId: string; kind: string; status: AgentTaskStatus;
  progress: number; retryCount: number; executionAttempt: number;
  result: unknown; error: string | null; createdAt: Date; updatedAt: Date;
}): AgentTaskView {
  let result: Record<string, unknown> | null = null;
  if (task.result && typeof task.result === 'object' && !Array.isArray(task.result)) {
    const { sourceMapRef, ...publicResult } = task.result as Record<string, unknown>;
    result = {
      ...publicResult,
      ...(sourceMapRef === undefined ? {} : { sourceMapAvailable: true }),
    };
  }
  return {
    id: task.id, sessionId: task.sessionId, kind: task.kind, status: task.status,
    progress: task.progress, retryCount: task.retryCount, executionAttempt: task.executionAttempt,
    result,
    error: task.error, createdAt: task.createdAt, updatedAt: task.updatedAt,
  };
}

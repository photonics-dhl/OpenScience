import type { Redis } from 'ioredis';
import type { AuditContext } from '@openscience/observability';
import { requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { getBalance } from '../usage/ledger';
import type { WorkspaceDeps } from '../workspace/types';
import { AgentError } from './errors';

export const AGENT_TASK_QUEUE = 'agent:queue';
export const AI_CREDIT_RESOURCE = 'ai_credit'; // §2.4-7 配额骨架（P1A-7）

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

/** Dashboard task rail: caller-owned tasks with their RO context. */
export async function listAgentTasks(
  deps: AgentDeps,
  input: { userId: string; actionableOnly?: boolean },
): Promise<AgentTaskListItem[]> {
  const rows = await deps.prisma.agentTask.findMany({
    where: {
      session: { userId: input.userId },
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
export async function createAgentSession(
  deps: AgentDeps,
  input: { userId: string; researchObjectId?: string; kind: string; title?: string; idempotencyKey?: string },
  ctx: AuditContext = {},
): Promise<AgentSessionView> {
  if (input.researchObjectId) {
    const ro = await deps.prisma.researchObject.findUnique({ where: { id: input.researchObjectId } });
    if (!ro) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    await requireMembership(deps, ro.workspaceId, input.userId);
  }
  if (input.idempotencyKey) {
    const existing = await deps.prisma.agentSession.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.userId !== input.userId || existing.researchObjectId !== (input.researchObjectId ?? null) || existing.kind !== input.kind) {
        throw new AgentError('VALIDATION_ERROR', '幂等键已用于其他 Hermes 会话');
      }
      return { id: existing.id, researchObjectId: existing.researchObjectId, kind: existing.kind, title: existing.title, status: existing.status, createdAt: existing.createdAt };
    }
  }
  const session = await deps.prisma.agentSession.create({
    data: { userId: input.userId, researchObjectId: input.researchObjectId ?? null, kind: input.kind, title: input.title ?? '', idempotencyKey: input.idempotencyKey },
  }).catch(async (error: unknown) => {
    if ((error as { code?: string }).code === 'P2002' && input.idempotencyKey) {
      const existing = await deps.prisma.agentSession.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    throw error;
  });
  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'agent.session.create', targetType: 'agent_session', targetId: session.id,
    metadata: { kind: input.kind },
  }, ctx);
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
 * 4. create pending + 入 Redis 队列
 */
export async function submitAgentTask(
  deps: AgentDeps,
  input: { sessionId: string; userId: string; kind: string; payload: Record<string, unknown>; idempotencyKey?: string },
  ctx: AuditContext = {},
): Promise<AgentTaskView> {
  const session = await deps.prisma.agentSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.userId !== input.userId) {
    throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '会话不存在');
  }
  let workspaceId: string | null = null;
  if (session.researchObjectId) {
    const ro = await deps.prisma.researchObject.findUnique({ where: { id: session.researchObjectId } });
    if (ro) {
      await requireMembership(deps, ro.workspaceId, input.userId);
      workspaceId = ro.workspaceId;
    }
  }

  // §9.1 + §2.4-7：AI Credit 配额校验
  const balance = await getBalance(deps, { userId: input.userId, resource: AI_CREDIT_RESOURCE });
  if (balance <= 0) {
    throw new AgentError('INSUFFICIENT_CREDIT', 'AI Credit 不足（§2.4-7），请补充后再试');
  }

  // §16 幂等键：同 key 已存在 → 返回既有任务
  if (input.idempotencyKey) {
    const existing = await deps.prisma.agentTask.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return taskToView(existing);
  }

  const task = await deps.prisma.agentTask.create({
    data: {
      sessionId: session.id,
      kind: input.kind,
      payload: input.payload as never,
      idempotencyKey: input.idempotencyKey,
    },
  }).catch(async (e: unknown) => {
    if (typeof (e as { code?: unknown })?.code === 'string' && (e as { code: string }).code === 'P2002') {
      const dup = await deps.prisma.agentTask.findUnique({ where: { idempotencyKey: input.idempotencyKey ?? '' } });
      if (dup) return dup;
      throw new AgentError('DUPLICATE_IDEMPOTENCY_KEY', '幂等键重复（§16）', e);
    }
    throw e;
  });

  // 入队（§9.3 长任务异步）
  await deps.redis.lpush(AGENT_TASK_QUEUE, task.id);

  await recordAudit(deps, deps.prisma, {
    actorId: input.userId, action: 'agent.task.submit', workspaceId, targetType: 'agent_task', targetId: task.id,
    metadata: { kind: input.kind, sessionId: session.id },
  }, ctx);
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
  input: { taskId: string; status: AgentTaskStatus; progress?: number; result?: Record<string, unknown>; error?: string | null },
): Promise<AgentTaskView> {
  const task = await deps.prisma.agentTask.findUnique({ where: { id: input.taskId } });
  if (!task) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '任务不存在');
  const from = task.status as AgentTaskStatus;

  // 消费者幂等：终态 succeeded 后 skip（§16 重放不重复副作用）
  if (from === 'succeeded') return taskToView(task);

  if (from === input.status) {
    // 同状态仅更新 progress（running→running 进度推进）
    if (input.progress !== undefined && input.progress >= (task.progress ?? 0)) {
      await deps.prisma.agentTask.update({ where: { id: task.id }, data: { progress: input.progress } });
    }
    await syncIngestionState(deps, task.id, input.status, input.error);
    return taskToView(task);
  }

  if (!(ALLOWED[from] ?? []).includes(input.status)) {
    throw new AgentError('ILLEGAL_TRANSITION', `任务状态 ${from} → ${input.status} 非法`);
  }

  const updated = await deps.prisma.agentTask.update({
    where: { id: task.id },
    data: {
      status: input.status,
      ...(input.progress !== undefined ? { progress: input.progress } : {}),
      ...(input.result !== undefined ? { result: input.result as never } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
    },
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
  const state = status === 'running' ? 'parsing' : status === 'succeeded' ? 'needs_review' : status === 'failed' ? 'failed_retryable' : 'queued';
  await deps.prisma.ingestionTask.updateMany({
    where: { agentTaskId },
    data: { state, ...(status === 'failed' ? { error: error ?? 'Extraction failed' } : { error: null }) },
  });
}

function taskToView(task: {
  id: string; sessionId: string; kind: string; status: AgentTaskStatus;
  progress: number; result: unknown; error: string | null; createdAt: Date; updatedAt: Date;
}): AgentTaskView {
  return {
    id: task.id, sessionId: task.sessionId, kind: task.kind, status: task.status,
    progress: task.progress, result: (task.result ?? null) as Record<string, unknown> | null,
    error: task.error, createdAt: task.createdAt, updatedAt: task.updatedAt,
  };
}

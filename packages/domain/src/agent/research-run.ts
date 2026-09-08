import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import { recordAudit } from '../workspace/audit';
import { requireActiveMembership } from '../workspace/helpers';
import { now, type WorkspaceDeps } from '../workspace/types';

const WRITE_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
const READY_INGESTION_STATES = new Set(['needs_review', 'confirmed', 'written']);
const FAILED_INGESTION_STATES = new Set(['failed_retryable', 'failed_blocked']);
const RUN_INCLUDE = { steps: { orderBy: { ordinal: 'asc' as const } } } as const;

export type HermesResearchRunStatus = 'running' | 'awaiting_source_review' | 'failed' | 'stopped';
export type HermesResearchStepStatus = 'waiting' | 'succeeded' | 'failed' | 'stopped';

export type HermesResearchRunErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESEARCH_OBJECT_NOT_DRAFT'
  | 'SOURCE_NOT_READY'
  | 'CONCURRENT_UPDATE';

export class HermesResearchRunError extends Error {
  constructor(public readonly code: HermesResearchRunErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HermesResearchRunError';
  }
}

export interface HermesResearchRunDeps extends WorkspaceDeps {}

export interface HermesResearchRunView {
  id: string;
  researchObjectId: string;
  actorId: string;
  status: HermesResearchRunStatus;
  version: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    stage: 'source_ingestion';
    ordinal: number;
    status: HermesResearchStepStatus;
    ingestionTaskId: string;
    artifactId: string;
    agentTaskId: string | null;
    error: string | null;
  }>;
}

type RunRow = Prisma.HermesResearchRunGetPayload<{ include: typeof RUN_INCLUDE }>;

function toView(run: RunRow): HermesResearchRunView {
  return {
    id: run.id,
    researchObjectId: run.researchObjectId,
    actorId: run.actorId,
    status: run.status as HermesResearchRunStatus,
    version: run.version,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    steps: run.steps.map((step) => ({
      id: step.id,
      stage: 'source_ingestion',
      ordinal: step.ordinal,
      status: step.status as HermesResearchStepStatus,
      ingestionTaskId: step.ingestionTaskId,
      artifactId: step.artifactId,
      agentTaskId: step.agentTaskId,
      error: step.error,
    })),
  };
}

function requestDigest(input: { actorId: string; researchObjectId: string; ingestionTaskIds: string[] }): string {
  return createHash('sha256').update(JSON.stringify({
    actorId: input.actorId,
    researchObjectId: input.researchObjectId,
    ingestionTaskIds: [...input.ingestionTaskIds].sort(),
  })).digest('hex');
}

export async function createHermesResearchRun(
  deps: HermesResearchRunDeps,
  input: { actorId: string; researchObjectId: string; ingestionTaskIds: string[]; idempotencyKey: string },
  ctx: AuditContext = {},
): Promise<HermesResearchRunView> {
  const taskIds = [...new Set(input.ingestionTaskIds)].sort();
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200 || taskIds.length === 0 || taskIds.length !== input.ingestionTaskIds.length) {
    throw new HermesResearchRunError('VALIDATION_ERROR', 'A non-empty unique ingestion task list and idempotency key are required');
  }
  const digest = requestDigest({ ...input, ingestionTaskIds: taskIds });
  const createOnce = () => deps.prisma.$transaction(async (tx) => {
    const replay = await tx.hermesResearchRun.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: RUN_INCLUDE });
    if (replay) {
      if (replay.actorId !== input.actorId || replay.researchObjectId !== input.researchObjectId || replay.requestDigest !== digest) {
        throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to a different Hermes research run');
      }
      return replay;
    }

    const researchObject = await tx.researchObject.findUnique({ where: { id: input.researchObjectId } });
    if (!researchObject) throw new HermesResearchRunError('NOT_FOUND', 'Research object not found');
    const { workspace, membership } = await requireActiveMembership(tx, researchObject.workspaceId, input.actorId)
      .catch((cause) => { throw new HermesResearchRunError('NOT_FOUND', 'Research object not found', { cause }); });
    if (!WRITE_ROLES.has(membership.role)) throw new HermesResearchRunError('FORBIDDEN', 'Research object write permission is required');
    if (researchObject.status !== 'draft') throw new HermesResearchRunError('RESEARCH_OBJECT_NOT_DRAFT', 'Hermes research runs require a draft research object');

    const tasks = await tx.ingestionTask.findMany({
      where: { id: { in: taskIds } },
      include: { batch: true, agentTask: true },
    });
    if (tasks.length !== taskIds.length) throw new HermesResearchRunError('SOURCE_NOT_READY', 'One or more ingestion tasks are unavailable');
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const ordered = taskIds.map((id) => byId.get(id)!);
    for (const task of ordered) {
      if (task.batch.researchObjectId !== researchObject.id || !task.agentTaskId || !task.agentTask
        || task.agentTask.id !== task.agentTaskId || FAILED_INGESTION_STATES.has(task.state)) {
        throw new HermesResearchRunError('SOURCE_NOT_READY', 'Ingestion source is failed, incomplete, or belongs to another research object');
      }
    }

    const run = await tx.hermesResearchRun.create({
      data: {
        researchObjectId: researchObject.id,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestDigest: digest,
        steps: {
          create: ordered.map((task, ordinal) => ({
            stage: 'source_ingestion', ordinal,
            ingestionTaskId: task.id, artifactId: task.artifactId, agentTaskId: task.agentTaskId,
            status: READY_INGESTION_STATES.has(task.state) ? 'succeeded' : 'waiting',
          })),
        },
      },
      include: RUN_INCLUDE,
    });
    await recordAudit(deps, tx, {
      actorId: input.actorId,
      action: 'hermes.research_run.create',
      workspaceId: workspace.id,
      targetType: 'hermes_research_run',
      targetId: run.id,
      metadata: { researchObjectId: researchObject.id, ingestionTaskCount: ordered.length },
    }, ctx);
    return run;
  }, { isolationLevel: 'Serializable' });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return toView(await createOnce());
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2034' && attempt < 2) continue;
      if (code !== 'P2002') throw error;
      const replay = await deps.prisma.hermesResearchRun.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: RUN_INCLUDE });
      if (!replay || replay.actorId !== input.actorId || replay.researchObjectId !== input.researchObjectId || replay.requestDigest !== digest) {
        throw new HermesResearchRunError('IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to a different Hermes research run', { cause: error });
      }
      return toView(replay);
    }
  }
  throw new HermesResearchRunError('CONCURRENT_UPDATE', 'Hermes research run transaction could not be serialized');
}

export async function getHermesResearchRun(
  deps: HermesResearchRunDeps,
  input: { actorId: string; researchObjectId: string; runId: string },
): Promise<HermesResearchRunView> {
  const run = await deps.prisma.hermesResearchRun.findUnique({ where: { id: input.runId }, include: RUN_INCLUDE });
  if (!run || run.actorId !== input.actorId || run.researchObjectId !== input.researchObjectId) {
    throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
  }
  const ro = await deps.prisma.researchObject.findUnique({ where: { id: run.researchObjectId } });
  if (!ro) throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found');
  await requireActiveMembership(deps.prisma, ro.workspaceId, input.actorId)
    .catch((cause) => { throw new HermesResearchRunError('NOT_FOUND', 'Hermes research run not found', { cause }); });
  return toView(run);
}

type ReconcileCounts = { inspected: number; advanced: number; failed: number; stopped: number; errors: number };

export async function reconcileHermesResearchRuns(
  deps: HermesResearchRunDeps,
  input: { limit?: number } = {},
): Promise<ReconcileCounts> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const cutoff = new Date(now(deps).getTime() - 5_000);
  const candidates = await deps.prisma.hermesResearchRun.findMany({
    where: {
      status: 'running',
      OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lte: cutoff } }],
    },
    include: RUN_INCLUDE,
    orderBy: [{ lastReconciledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }], take: limit,
  });
  const counts: ReconcileCounts = { inspected: candidates.length, advanced: 0, failed: 0, stopped: 0, errors: 0 };
  for (const candidate of candidates) {
    let result: HermesResearchRunStatus | null = null;
    let reconcileError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await deps.prisma.$transaction(async (tx) => {
      const run = await tx.hermesResearchRun.findUnique({
        where: { id: candidate.id },
        include: { steps: { orderBy: { ordinal: 'asc' }, include: { ingestionTask: { include: { batch: true, agentTask: true } } } } },
      });
      if (!run || run.status !== 'running') return null;
      const ro = await tx.researchObject.findUnique({ where: { id: run.researchObjectId } });
      let stopReason: string | null = !ro || ro.status !== 'draft' ? 'research object scope changed' : null;
      if (!stopReason && ro) {
        const authority = await requireActiveMembership(tx, ro.workspaceId, run.actorId).catch(() => null);
        if (!authority || !WRITE_ROLES.has(authority.membership.role)) stopReason = 'authorization scope changed';
      }
      if (!stopReason) {
        for (const step of run.steps) {
          const task = step.ingestionTask;
          if (!task || task.batch.researchObjectId !== run.researchObjectId || task.artifactId !== step.artifactId
            || task.agentTaskId !== step.agentTaskId || !task.agentTask || task.agentTask.id !== step.agentTaskId) {
            stopReason = 'source binding changed';
            break;
          }
        }
      }
      const failure = run.steps.map((step) => step.ingestionTask)
        .find((task) => task && FAILED_INGESTION_STATES.has(task.state));
      const target = stopReason ? 'stopped' : failure ? 'failed' : run.steps.every((step) => READY_INGESTION_STATES.has(step.ingestionTask.state))
        ? 'awaiting_source_review' : null;
      if (!target) {
        await tx.hermesResearchRun.updateMany({
          where: { id: run.id, status: 'running', version: run.version },
          data: { lastReconciledAt: now(deps) },
        });
        return null;
      }
      const error = stopReason ?? failure?.error ?? (failure ? 'Ingestion extraction failed' : null);
      const changed = await tx.hermesResearchRun.updateMany({
        where: { id: run.id, status: 'running', version: run.version },
        data: { status: target, error, version: { increment: 1 } },
      });
      if (changed.count !== 1) return null;
      for (const step of run.steps) {
        const status = target === 'stopped' ? 'stopped'
          : FAILED_INGESTION_STATES.has(step.ingestionTask.state) ? 'failed'
            : READY_INGESTION_STATES.has(step.ingestionTask.state) ? 'succeeded' : step.status;
        await tx.hermesResearchStep.updateMany({ where: { id: step.id, runId: run.id }, data: { status, error: status === 'failed' ? error : null } });
      }
      await recordAudit(deps, tx, {
        actorId: run.actorId,
        action: `hermes.research_run.${target}`,
        workspaceId: ro?.workspaceId,
        targetType: 'hermes_research_run',
        targetId: run.id,
        metadata: { from: 'running', to: target },
      }, {});
      return target;
        }, { isolationLevel: 'Serializable' });
        reconcileError = undefined;
        break;
      } catch (error) {
        reconcileError = error;
        if ((error as { code?: string }).code === 'P2034' && attempt < 2) continue;
        break;
      }
    }
    if (reconcileError) {
      counts.errors += 1;
      await deps.prisma.hermesResearchRun.updateMany({
        where: { id: candidate.id, status: 'running', version: candidate.version },
        data: { lastReconciledAt: now(deps) },
      }).catch(() => undefined);
      continue;
    }
    if (result === 'awaiting_source_review') counts.advanced += 1;
    else if (result === 'failed') counts.failed += 1;
    else if (result === 'stopped') counts.stopped += 1;
  }
  return counts;
}

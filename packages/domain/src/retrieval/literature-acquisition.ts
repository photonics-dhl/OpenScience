import { createHash } from 'node:crypto';
import type { AgentSession, AgentTask, Prisma, ResearchObject } from '@prisma/client';
import type { AuditContext } from '@openscience/observability';
import {
  createSystemResearchObjectInTransaction,
  type ResearchObjectSummary,
} from '../research-object/research-objects';
import {
  dispatchAgentTask, findOrCreateAgentSessionInTransaction, getAgentTask,
  persistSourceRetrieveTaskInTransaction, type AgentDeps, type AgentSessionView, type AgentTaskView,
} from '../agent/agent';
import { AgentError } from '../agent/errors';
import {
  parseDurableSourceRetrievePayload,
  parseSourceRetrieveRequestPayload,
  SOURCE_RETRIEVE_RETRY_CONTRACT_VERSION,
  type DurableSourceRetrievePayload,
  type SourceRetrieveTarget,
} from './retrieve-payload';
import { WorkspaceError } from '../workspace/errors';
import { requireActiveMembership } from '../workspace/helpers';
import { isOwnedPrismaIdempotencyConflict } from '../prisma-idempotency-conflict';

export type LiteratureAcquisitionTarget = SourceRetrieveTarget;

export interface SubmitLiteratureAcquisitionInput {
  userId: string;
  idempotencyKey: string;
  query: string;
  identifier?: string;
  target: LiteratureAcquisitionTarget;
}

export interface LiteratureAcquisitionResult {
  researchObject: ResearchObjectSummary;
  session: AgentSessionView;
  task: AgentTaskView;
}

interface NormalizedAcquisition {
  callerKey: string;
  target: LiteratureAcquisitionTarget;
  payload: DurableSourceRetrievePayload;
  digest: string;
}

function toSummary(researchObject: ResearchObject): ResearchObjectSummary {
  return {
    id: researchObject.id, workspaceId: researchObject.workspaceId, title: researchObject.title,
    status: researchObject.status, visibility: researchObject.visibility, version: researchObject.version,
    createdAt: researchObject.createdAt,
  };
}

function toSessionView(session: AgentSession): AgentSessionView {
  return {
    id: session.id, researchObjectId: session.researchObjectId, kind: session.kind,
    title: session.title, status: session.status, createdAt: session.createdAt,
  };
}

function normalizeAcquisition(input: SubmitLiteratureAcquisitionInput): NormalizedAcquisition {
  const callerKey = input.idempotencyKey.trim();
  if (!callerKey || callerKey.length > 200) throw new AgentError('VALIDATION_ERROR', '幂等键长度需为 1-200 字符');
  const query = input.query.trim();
  if (!query || query.length > 500) throw new AgentError('VALIDATION_ERROR', '文献检索关键词长度需为 1-500 字符');
  let target: LiteratureAcquisitionTarget;
  if (input.target?.kind === 'personal') {
    target = { kind: 'personal' };
  } else if (input.target?.kind === 'research_object'
    && typeof input.target.researchObjectId === 'string'
    && input.target.researchObjectId.trim()) {
    target = { kind: 'research_object', researchObjectId: input.target.researchObjectId.trim() };
  } else {
    throw new AgentError('VALIDATION_ERROR', '文献检索目标无效');
  }
  let payload: DurableSourceRetrievePayload;
  try {
    const request = parseSourceRetrieveRequestPayload(input.identifier
      ? { query, providers: ['scansci'], limit: 1, includeFullText: true, identifier: input.identifier }
      : { query, providers: ['semantic_scholar', 'tavily'], limit: 10, includeFullText: false });
    payload = parseDurableSourceRetrievePayload({
      ...request,
      retryContractVersion: SOURCE_RETRIEVE_RETRY_CONTRACT_VERSION,
      target,
    });
  } catch (error) {
    throw new AgentError('VALIDATION_ERROR', error instanceof Error ? error.message : '文献检索请求无效');
  }
  const digest = createHash('sha256').update(JSON.stringify({
    target, query: payload.query, identifier: payload.identifier ?? null, payload,
  })).digest('hex');
  return { callerKey, target, payload, digest };
}

async function resolveResearchObjectInTransaction(
  deps: AgentDeps,
  tx: Prisma.TransactionClient,
  input: SubmitLiteratureAcquisitionInput,
  normalized: NormalizedAcquisition,
  ctx: AuditContext,
): Promise<ResearchObject> {
  if (normalized.target.kind === 'research_object') {
    const researchObject = await tx.researchObject.findUnique({ where: { id: normalized.target.researchObjectId } });
    if (!researchObject) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    try {
      await requireActiveMembership(tx, researchObject.workspaceId, input.userId);
    } catch (error) {
      if (error instanceof WorkspaceError && error.code === 'WORKSPACE_NOT_FOUND') {
        throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
      }
      throw error;
    }
    return researchObject;
  }
  const workspaces = await tx.workspace.findMany({ where: { type: 'personal', ownerId: input.userId }, take: 2 });
  if (workspaces.length === 0) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '个人空间不存在');
  if (workspaces.length !== 1) throw new AgentError('DUPLICATE_IDEMPOTENCY_KEY', '个人空间状态冲突，请重试');
  return createSystemResearchObjectInTransaction(deps, tx, {
    workspaceId: workspaces[0].id,
    userId: input.userId,
    title: 'Personal Literature Library',
    idempotencyKey: `system:personal-literature:${input.userId}`,
  }, ctx);
}

/** Browser acquisition persistence is one Serializable unit; Redis is post-commit. */
export async function submitLiteratureAcquisition(
  deps: AgentDeps,
  input: SubmitLiteratureAcquisitionInput,
  ctx: AuditContext = {},
): Promise<LiteratureAcquisitionResult> {
  const normalized = normalizeAcquisition(input);
  const sessionKey = `literature-acquisition:session:${input.userId}:${normalized.callerKey}`;
  const taskKey = `literature-acquisition:task:${input.userId}:${normalized.callerKey}`;
  const title = `Literature acquisition:${normalized.digest}`;
  let persisted: { researchObject: ResearchObject; session: AgentSession; task: AgentTask } | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      persisted = await deps.prisma.$transaction(async (tx) => {
        const researchObject = await resolveResearchObjectInTransaction(deps, tx, input, normalized, ctx);
        const { session } = await findOrCreateAgentSessionInTransaction(deps, tx, {
          userId: input.userId, researchObjectId: researchObject.id, kind: 'retrieval', title,
          idempotencyKey: sessionKey,
        }, ctx);
        const { task } = await persistSourceRetrieveTaskInTransaction(deps, tx, {
          userId: input.userId, sessionId: session.id,
          payload: normalized.payload, idempotencyKey: taskKey,
        }, ctx);
        return { researchObject, session, task };
      }, { isolationLevel: 'Serializable' });
      break;
    } catch (error: unknown) {
      const code = (error as { code?: unknown })?.code;
      const idempotencyConflict = isOwnedPrismaIdempotencyConflict(error);
      if ((code === 'P2034' || idempotencyConflict) && attempt < 2) continue;
      if (code === 'P2034' || idempotencyConflict) {
        throw new AgentError('DUPLICATE_IDEMPOTENCY_KEY', '文献检索并发冲突，请重试', error);
      }
      throw error;
    }
  }
  if (!persisted) throw new AgentError('DUPLICATE_IDEMPOTENCY_KEY', '文献检索并发冲突，请重试');
  await dispatchAgentTask(deps, persisted.task.id);
  return {
    researchObject: toSummary(persisted.researchObject),
    session: toSessionView(persisted.session),
    task: await getAgentTask(deps, { userId: input.userId, taskId: persisted.task.id }),
  };
}

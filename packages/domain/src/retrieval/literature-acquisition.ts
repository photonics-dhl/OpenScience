import { createHash } from 'node:crypto';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import type { AuditContext } from '@openscience/observability';
import type { ResearchObjectSummary } from '../research-object/research-objects';
import { SDF_NODE_TYPES } from '../research-object/types';
import { AI_CREDIT_RESOURCE, createAgentSession, getAgentTask, submitAgentTask, type AgentDeps, type AgentSessionView, type AgentTaskView } from '../agent/agent';
import { AgentError } from '../agent/errors';
import { parseSourceRetrievePayload } from './retrieve-payload';
import { requireRoAccess } from '../visibility/access';
import { requireActive, requireMembership } from '../workspace/helpers';
import { recordAudit } from '../workspace/audit';
import { getBalance } from '../usage/ledger';

export type LiteratureAcquisitionTarget =
  | { kind: 'personal' }
  | { kind: 'research_object'; researchObjectId: string };

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

function toSummary(researchObject: {
  id: string; workspaceId: string; title: string; status: ResearchObjectSummary['status'];
  visibility: ResearchObjectSummary['visibility']; version: number; createdAt: Date;
}): ResearchObjectSummary {
  return { id: researchObject.id, workspaceId: researchObject.workspaceId, title: researchObject.title, status: researchObject.status, visibility: researchObject.visibility, version: researchObject.version, createdAt: researchObject.createdAt };
}

function validateAndBuildPayload(input: SubmitLiteratureAcquisitionInput): { payload: Record<string, unknown>; digest: string } {
  const query = input.query.trim();
  if (!query || query.length > 500) throw new AgentError('VALIDATION_ERROR', '文献检索关键词长度需为 1-500 字符');
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) throw new AgentError('VALIDATION_ERROR', '幂等键长度需为 1-200 字符');
  let payload: Record<string, unknown>;
  try {
    payload = parseSourceRetrievePayload(input.identifier
      ? { query, providers: ['scansci'], limit: 1, includeFullText: true, identifier: input.identifier }
      : { query, providers: ['semantic_scholar', 'tavily'], limit: 10, includeFullText: false }) as unknown as Record<string, unknown>;
  } catch (error) {
    throw new AgentError('VALIDATION_ERROR', error instanceof Error ? error.message : '文献检索请求无效');
  }
  const digest = createHash('sha256').update(JSON.stringify({ target: input.target, query, identifier: input.identifier?.trim() ?? null, payload })).digest('hex');
  return { payload, digest };
}

interface ResolvedTarget {
  workspaceId: string;
  researchObject?: ResearchObjectSummary;
}

async function resolveTarget(deps: AgentDeps, input: SubmitLiteratureAcquisitionInput): Promise<ResolvedTarget> {
  if (input.target.kind === 'research_object') {
    const researchObject = await deps.prisma.researchObject.findUnique({ where: { id: input.target.researchObjectId } });
    if (!researchObject) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    await requireRoAccess(deps, { researchObjectId: researchObject.id, userId: input.userId });
    const { workspace } = await requireMembership(deps, researchObject.workspaceId, input.userId);
    requireActive(workspace);
    return { workspaceId: workspace.id, researchObject: toSummary(researchObject) };
  }
  const workspace = await deps.prisma.workspace.findFirst({ where: { type: 'personal', ownerId: input.userId } });
  if (!workspace) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '个人空间不存在');
  const membership = await requireMembership(deps, workspace.id, input.userId);
  requireActive(membership.workspace);
  return { workspaceId: workspace.id };
}

function emptyCore(): Record<string, string> {
  return Object.fromEntries(SDF_CORE_FIELDS.map((field) => [field, '']));
}

function sessionToView(session: {
  id: string; researchObjectId: string | null; kind: string; title: string; status: string; createdAt: Date;
}): AgentSessionView {
  return { id: session.id, researchObjectId: session.researchObjectId, kind: session.kind, title: session.title, status: session.status, createdAt: session.createdAt };
}

async function ensurePersonalLiteratureResearchObject(
  deps: AgentDeps, input: SubmitLiteratureAcquisitionInput, workspaceId: string, ctx: AuditContext,
): Promise<{ researchObject: ResearchObjectSummary; created: boolean }> {
  const key = `system:personal-literature:${input.userId}`;
  const existing = await deps.prisma.researchObject.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    if (existing.workspaceId !== workspaceId || existing.createdBy !== input.userId) throw new AgentError('FORBIDDEN', '个人文献库归属不一致');
    return { researchObject: toSummary(existing), created: false };
  }
  try {
    const core = emptyCore();
    const created = await deps.prisma.$transaction(async (tx) => {
      const researchObject = await tx.researchObject.create({
        data: { workspaceId, createdBy: input.userId, title: 'Personal Literature Library', idempotencyKey: key, sdfDocument: { create: { coreJson: core, nodes: { create: SDF_NODE_TYPES.map((nodeType, sortOrder) => ({ nodeType, content: '', sortOrder })) } } } },
      });
      await recordAudit(deps, tx, { actorId: input.userId, action: 'research_object.create', workspaceId, targetType: 'research_object', targetId: researchObject.id, metadata: { title: researchObject.title, system: 'personal-literature' } }, ctx);
      return researchObject;
    });
    return { researchObject: toSummary(created), created: true };
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const concurrent = await deps.prisma.researchObject.findUnique({ where: { idempotencyKey: key } });
    if (!concurrent || concurrent.workspaceId !== workspaceId || concurrent.createdBy !== input.userId) throw new AgentError('FORBIDDEN', '个人文献库归属不一致');
    return { researchObject: toSummary(concurrent), created: false };
  }
}

/**
 * Browser-facing literature retrieval orchestration. Provider selection and full-text
 * permission are owned here so untrusted clients can never select a retrieval strategy.
 */
export async function submitLiteratureAcquisition(
  deps: AgentDeps,
  input: SubmitLiteratureAcquisitionInput,
  ctx: AuditContext = {},
): Promise<LiteratureAcquisitionResult> {
  const { payload, digest } = validateAndBuildPayload(input);
  const target = await resolveTarget(deps, input);
  const personalKey = `system:personal-literature:${input.userId}`;
  const existingPersonal = input.target.kind === 'personal'
    ? await deps.prisma.researchObject.findUnique({ where: { idempotencyKey: personalKey } })
    : null;
  if (existingPersonal && (existingPersonal.workspaceId !== target.workspaceId || existingPersonal.createdBy !== input.userId)) {
    throw new AgentError('FORBIDDEN', '个人文献库归属不一致');
  }
  const existingResearchObject = input.target.kind === 'personal'
    ? (existingPersonal ? toSummary(existingPersonal) : undefined)
    : target.researchObject!;
  const sessionKey = `literature-acquisition:session:${input.userId}:${input.idempotencyKey}`;
  const taskKey = `literature-acquisition:task:${input.userId}:${input.idempotencyKey}`;
  const expectedTitle = `Literature acquisition:${digest}`;
  const priorSession = await deps.prisma.agentSession.findUnique({ where: { idempotencyKey: sessionKey } });
  if (priorSession) {
    if (!existingResearchObject || priorSession.userId !== input.userId || priorSession.researchObjectId !== existingResearchObject.id
      || priorSession.kind !== 'retrieval' || priorSession.title !== expectedTitle) {
      throw new AgentError('VALIDATION_ERROR', '幂等键已用于其他文献检索请求');
    }
    const existingTask = await deps.prisma.agentTask.findUnique({ where: { idempotencyKey: taskKey } });
    if (existingTask) {
      return { researchObject: existingResearchObject, session: sessionToView(priorSession), task: await getAgentTask(deps, { userId: input.userId, taskId: existingTask.id }) };
    }
  }
  if (await getBalance(deps, { userId: input.userId, resource: AI_CREDIT_RESOURCE }) <= 0) {
    throw new AgentError('INSUFFICIENT_CREDIT', 'AI Credit 不足（§2.4-7），请补充后再试');
  }
  const personal = input.target.kind === 'personal'
    ? existingResearchObject
      ? { researchObject: existingResearchObject, created: false }
      : await ensurePersonalLiteratureResearchObject(deps, input, target.workspaceId, ctx)
    : { researchObject: target.researchObject!, created: false };
  const researchObject = personal.researchObject;
  const session = await createAgentSession(deps, {
    userId: input.userId, researchObjectId: researchObject.id, kind: 'retrieval',
    title: expectedTitle, idempotencyKey: sessionKey,
  }, ctx);
  try {
    const task = await submitAgentTask(deps, {
      userId: input.userId, sessionId: session.id, kind: 'source.retrieve', payload, idempotencyKey: taskKey,
    }, ctx);
    return { researchObject, session, task };
  } catch (error) {
    if (!await deps.prisma.agentTask.findUnique({ where: { idempotencyKey: taskKey } })) {
      const sessionHasTask = await deps.prisma.agentTask.findFirst({ where: { sessionId: session.id } });
      if (!priorSession && !sessionHasTask) await deps.prisma.agentSession.delete({ where: { id: session.id } }).catch(() => undefined);
      if (personal.created && !await deps.prisma.agentSession.findFirst({ where: { researchObjectId: researchObject.id } })) {
        await deps.prisma.researchObject.delete({ where: { id: researchObject.id } }).catch(() => undefined);
      }
    }
    throw error;
  }
}

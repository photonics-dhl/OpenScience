import type { AuditContext } from '@openscience/observability';
import { createResearchObject, type ResearchObjectSummary } from '../research-object/research-objects';
import { createAgentSession, submitAgentTask, type AgentDeps, type AgentSessionView, type AgentTaskView } from '../agent/agent';
import { AgentError } from '../agent/errors';
import { parseSourceRetrievePayload } from './retrieve-payload';
import { requireRoAccess } from '../visibility/access';

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

function normalizedQuery(query: string): string {
  const normalized = query.trim();
  if (!normalized || normalized.length > 500) {
    throw new AgentError('VALIDATION_ERROR', '文献检索关键词长度需为 1-500 字符');
  }
  return normalized;
}

async function resolveResearchObject(
  deps: AgentDeps,
  input: SubmitLiteratureAcquisitionInput,
  ctx: AuditContext,
): Promise<ResearchObjectSummary> {
  if (input.target.kind === 'research_object') {
    const researchObject = await deps.prisma.researchObject.findUnique({ where: { id: input.target.researchObjectId } });
    if (!researchObject) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '研究对象不存在');
    await requireRoAccess(deps, { researchObjectId: researchObject.id, userId: input.userId });
    // createAgentSession performs the authoritative membership check before persisting a session.
    return {
      id: researchObject.id,
      workspaceId: researchObject.workspaceId,
      title: researchObject.title,
      status: researchObject.status,
      visibility: researchObject.visibility,
      version: researchObject.version,
      createdAt: researchObject.createdAt,
    };
  }

  const workspace = await deps.prisma.workspace.findFirst({ where: { type: 'personal', ownerId: input.userId } });
  if (!workspace) throw new AgentError('RESEARCH_OBJECT_NOT_FOUND', '个人空间不存在');
  return createResearchObject(deps, {
    workspaceId: workspace.id,
    userId: input.userId,
    title: 'Personal Literature Library',
    idempotencyKey: `system:personal-literature:${input.userId}`,
  }, ctx);
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
  const query = normalizedQuery(input.query);
  const researchObject = await resolveResearchObject(deps, input, ctx);
  const targetKey = `${input.target.kind}:${researchObject.id}`;
  const requestKey = `${input.userId}:${targetKey}:${input.idempotencyKey}`;
  const payload = parseSourceRetrievePayload(input.identifier
    ? { query, providers: ['scansci'], limit: 1, includeFullText: true, identifier: input.identifier }
    : { query, providers: ['semantic_scholar', 'tavily'], limit: 10, includeFullText: false });
  const session = await createAgentSession(deps, {
    userId: input.userId,
    researchObjectId: researchObject.id,
    kind: 'retrieval',
    title: 'Literature acquisition',
    idempotencyKey: `literature-acquisition:session:${requestKey}`,
  }, ctx);
  const task = await submitAgentTask(deps, {
    userId: input.userId,
    sessionId: session.id,
    kind: 'source.retrieve',
    payload: payload as unknown as Record<string, unknown>,
    idempotencyKey: `literature-acquisition:task:${requestKey}`,
  }, ctx);
  return { researchObject, session, task };
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getCurrentUser, type AuthDeps } from '@openscience/auth';
import { buildErrorBody } from '@openscience/observability';
import { sessionTokenFrom } from './routes/session-guard';

export type JournalBoundaryDeps = Pick<AuthDeps, 'prisma' | 'redis' | 'mailer' | 'audit'>;

type RecordValue = Record<string, unknown>;
type FindUniqueDelegate = { findUnique(args: RecordValue): Promise<unknown> };
type TargetKind =
  | 'workspace'
  | 'researchObject'
  | 'version'
  | 'agentSession'
  | 'agentTask'
  | 'toolApproval'
  | 'artifact'
  | 'presentationAsset'
  | 'trashEntry'
  | 'ingestionBatch'
  | 'ingestionTask'
  | 'workspaceInvitation'
  | 'appeal'
  | 'sandboxJob'
  | 'temporaryDocument'
  | 'editorialSelection';

interface Candidate {
  kind: TargetKind;
  id: string;
}

interface JournalTarget {
  journalId: string;
  workspaceId: string;
  articleId?: string;
  assignedReviewerId?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

function delegate(prisma: unknown, name: string): FindUniqueDelegate | null {
  const candidate = record(prisma)?.[name];
  if (!candidate || typeof candidate !== 'object') return null;
  const findUnique = (candidate as RecordValue).findUnique;
  return typeof findUnique === 'function' ? candidate as FindUniqueDelegate : null;
}

function relationId(row: unknown, relation: string, field: string): string | null {
  return uuid(record(record(row)?.[relation])?.[field]);
}

function scalarId(row: unknown, field: string): string | null {
  return uuid(record(row)?.[field]);
}

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** Journal-owned routes are the only mutation surface allowed to write journal resources. */
export function isJournalWorkflowPath(path: string): boolean {
  return isWithin(path, '/journals') || isWithin(path, '/admin/journals');
}

function requestPath(req: FastifyRequest): string {
  const path = req.url.split('?', 1)[0] ?? req.url;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function push(candidates: Candidate[], kind: TargetKind, value: unknown): void {
  const id = uuid(value);
  if (id && !candidates.some((candidate) => candidate.kind === kind && candidate.id === id)) {
    candidates.push({ kind, id });
  }
}

function collectCandidates(req: FastifyRequest): Candidate[] {
  const path = requestPath(req);
  const params = record(req.params) ?? {};
  const body = record(req.body) ?? {};
  const candidates: Candidate[] = [];

  const workspaceHeader = req.headers['x-workspace-id'];
  // A selected workspace is useful evidence for mutations, but must not hide an
  // otherwise assigned article when a reviewer sends the normal UI context header.
  if (WRITE_METHODS.has(req.method) && typeof workspaceHeader === 'string') {
    push(candidates, 'workspace', workspaceHeader);
  }

  if (path === '/research-objects' || path === '/research-objects/search') {
    // Generic search authorizes a whole workspace, not assigned journal articles.
    // Journal readers use the journal workflow's scoped article listing instead.
    push(candidates, 'workspace', body.workspaceId);
  } else if (isWithin(path, '/research-objects')) {
    push(candidates, 'researchObject', params.roId ?? params.id ?? params.researchObjectId);
    if (path.endsWith('/forks')) push(candidates, 'workspace', body.workspaceId);
  } else if (isWithin(path, '/sdf')) {
    push(candidates, 'researchObject', params.roId);
  } else if (isWithin(path, '/versions')) {
    push(candidates, 'version', params.versionId ?? params.id ?? params.from);
    push(candidates, 'version', record(req.query)?.to);
  } else if (path.startsWith('/workspaces/invitations/')) {
    push(candidates, 'workspaceInvitation', params.id);
  } else if (isWithin(path, '/workspaces') && path !== '/workspaces') {
    push(candidates, 'workspace', params.id);
  } else if (path === '/agent/sessions') {
    push(candidates, 'researchObject', body.researchObjectId);
  } else if (path === '/agent/tasks') {
    push(candidates, 'agentSession', body.sessionId);
    const payload = record(body.payload);
    const target = record(payload?.target);
    push(candidates, 'researchObject', payload?.researchObjectId);
    push(candidates, 'researchObject', target?.researchObjectId);
    push(candidates, 'version', payload?.versionId);
  } else if (path.startsWith('/agent/tasks/')) {
    push(candidates, 'agentTask', params.id);
  } else if (path.startsWith('/agent/approvals/')) {
    push(candidates, 'toolApproval', params.id);
  } else if (path.startsWith('/ingestion/')) {
    if (params.taskId) push(candidates, 'ingestionTask', params.taskId);
    else push(candidates, 'ingestionBatch', params.batchId);
  } else if (path.startsWith('/artifacts/')) {
    push(candidates, 'artifact', params.id);
  } else if (path === '/trash') {
    // Resolve the resource itself: the optional workspace header is not authority.
    const kinds: Record<string, TargetKind> = {
      research_object: 'researchObject', session: 'agentSession', task: 'agentTask',
      asset: 'presentationAsset', artifact: 'artifact',
    };
    const kind = typeof body.kind === 'string' && Object.hasOwn(kinds, body.kind) ? kinds[body.kind] : undefined;
    if (kind) push(candidates, kind, body.resourceId);
  } else if (path.startsWith('/trash/')) {
    push(candidates, 'trashEntry', params.id);
  } else if (path === '/appeals') {
    push(candidates, 'version', body.versionId);
  } else if (path.startsWith('/appeals/')) {
    push(candidates, 'appeal', params.id);
  } else if (path === '/sandbox-jobs') {
    push(candidates, 'workspace', body.workspaceId);
  } else if (path.startsWith('/sandbox-jobs/')) {
    push(candidates, 'sandboxJob', params.jobId);
  } else if (path.startsWith('/temporary-documents/')) {
    push(candidates, 'temporaryDocument', params.id);
  } else if (path === '/literature/acquisitions') {
    push(candidates, 'researchObject', record(body.target)?.researchObjectId);
  } else if (path.startsWith('/admin/editorial/selections/')) {
    push(candidates, 'editorialSelection', params.id);
  } else if (path.startsWith('/admin/editorial/collections/')) {
    push(candidates, 'version', body.versionId);
  } else if (path.startsWith('/admin/quota-policies/') && body.scope === 'workspace') {
    push(candidates, 'workspace', body.scopeKey);
  }

  return candidates;
}

async function journalForWorkspace(deps: JournalBoundaryDeps, workspaceId: string): Promise<JournalTarget | null> {
  const journal = delegate(deps.prisma, 'journal');
  if (!journal) return null;
  const row = await journal.findUnique({ where: { workspaceId }, select: { id: true, workspaceId: true } });
  const journalId = scalarId(row, 'id');
  const ownedWorkspaceId = scalarId(row, 'workspaceId');
  return journalId && ownedWorkspaceId ? { journalId, workspaceId: ownedWorkspaceId } : null;
}

async function journalForResearchObject(deps: JournalBoundaryDeps, researchObjectId: string): Promise<JournalTarget | null> {
  const article = delegate(deps.prisma, 'journalArticle');
  if (!article) return null;
  const row = await article.findUnique({
    where: { researchObjectId },
    select: { id: true, assignedReviewerId: true, journal: { select: { id: true, workspaceId: true } } },
  });
  const journalId = relationId(row, 'journal', 'id');
  const workspaceId = relationId(row, 'journal', 'workspaceId');
  const articleId = scalarId(row, 'id');
  const assignedReviewerId = record(row)?.assignedReviewerId;
  return journalId && workspaceId && articleId
    ? { journalId, workspaceId, articleId, assignedReviewerId: uuid(assignedReviewerId) }
    : null;
}

function idsFromAgentPayload(value: unknown): Candidate[] {
  const payload = record(value);
  const target = record(payload?.target);
  const interestContext = record(payload?.interestContext);
  const candidates: Candidate[] = [];
  push(candidates, 'researchObject', payload?.researchObjectId);
  push(candidates, 'researchObject', target?.researchObjectId);
  push(candidates, 'researchObject', interestContext?.activeResearchObjectId);
  push(candidates, 'version', payload?.versionId);
  return candidates;
}

async function resolveCandidate(deps: JournalBoundaryDeps, candidate: Candidate): Promise<JournalTarget | null> {
  if (candidate.kind === 'workspace') return journalForWorkspace(deps, candidate.id);
  if (candidate.kind === 'researchObject') return journalForResearchObject(deps, candidate.id);

  if (candidate.kind === 'version') {
    const model = delegate(deps.prisma, 'version');
    if (!model) return null;
    const row = await model.findUnique({ where: { id: candidate.id }, select: { researchObjectId: true } });
    const researchObjectId = scalarId(row, 'researchObjectId');
    return researchObjectId ? journalForResearchObject(deps, researchObjectId) : null;
  }

  if (candidate.kind === 'agentSession') {
    const model = delegate(deps.prisma, 'agentSession');
    if (!model) return null;
    const row = await model.findUnique({ where: { id: candidate.id }, select: { researchObjectId: true } });
    const researchObjectId = scalarId(row, 'researchObjectId');
    return researchObjectId ? journalForResearchObject(deps, researchObjectId) : null;
  }

  if (candidate.kind === 'trashEntry') {
    const model = delegate(deps.prisma, 'trashEntry');
    if (!model) return null;
    const row = await model.findUnique({ where: { id: candidate.id }, select: { workspaceId: true, researchObjectId: true } });
    const workspaceId = scalarId(row, 'workspaceId');
    if (workspaceId) {
      const target = await journalForWorkspace(deps, workspaceId);
      if (target) return target;
    }
    const researchObjectId = scalarId(row, 'researchObjectId');
    return researchObjectId ? journalForResearchObject(deps, researchObjectId) : null;
  }

  if (candidate.kind === 'agentTask' || candidate.kind === 'toolApproval') {
    const model = delegate(deps.prisma, candidate.kind === 'agentTask' ? 'agentTask' : 'toolApproval');
    if (!model) return null;
    const select = candidate.kind === 'agentTask'
      ? { payload: true, interestContext: true, session: { select: { researchObjectId: true } } }
      : { task: { select: { payload: true, interestContext: true, session: { select: { researchObjectId: true } } } } };
    const row = await model.findUnique({ where: { id: candidate.id }, select });
    const task = candidate.kind === 'agentTask' ? record(row) : record(record(row)?.task);
    const researchObjectId = relationId(task, 'session', 'researchObjectId');
    if (researchObjectId) {
      const target = await journalForResearchObject(deps, researchObjectId);
      if (target) return target;
    }
    const persistedCandidates = idsFromAgentPayload(task?.payload);
    const interestContext = record(task?.interestContext);
    push(persistedCandidates, 'researchObject', interestContext?.activeResearchObjectId);
    for (const persisted of persistedCandidates) {
      const target = await resolveCandidate(deps, persisted);
      if (target) return target;
    }
    return null;
  }

  const lookup: Record<Exclude<TargetKind, 'workspace' | 'researchObject' | 'version' | 'agentSession' | 'agentTask' | 'toolApproval' | 'trashEntry'>, {
    model: string;
    select: RecordValue;
    workspaceField?: string;
    researchObjectField?: string;
  }> = {
    artifact: { model: 'artifact', select: { workspaceId: true }, workspaceField: 'workspaceId' },
    presentationAsset: {
      model: 'presentationAsset', select: { researchObjectId: true }, researchObjectField: 'researchObjectId',
    },
    ingestionBatch: {
      model: 'ingestionBatch', select: { researchObjectId: true }, researchObjectField: 'researchObjectId',
    },
    ingestionTask: {
      model: 'ingestionTask',
      select: { batch: { select: { researchObjectId: true } } },
      researchObjectField: 'batch.researchObjectId',
    },
    workspaceInvitation: {
      model: 'workspaceInvitation', select: { workspaceId: true }, workspaceField: 'workspaceId',
    },
    appeal: { model: 'appeal', select: { researchObjectId: true }, researchObjectField: 'researchObjectId' },
    sandboxJob: { model: 'sandboxJob', select: { workspaceId: true }, workspaceField: 'workspaceId' },
    temporaryDocument: {
      model: 'temporaryDocument', select: { workspaceId: true }, workspaceField: 'workspaceId',
    },
    editorialSelection: {
      model: 'editorialSelection', select: { researchObjectId: true }, researchObjectField: 'researchObjectId',
    },
  };
  const spec = lookup[candidate.kind];
  const model = delegate(deps.prisma, spec.model);
  if (!model) return null;
  const row = await model.findUnique({ where: { id: candidate.id }, select: spec.select });
  if (spec.workspaceField) {
    const workspaceId = scalarId(row, spec.workspaceField);
    return workspaceId ? journalForWorkspace(deps, workspaceId) : null;
  }
  const researchObjectId = spec.researchObjectField === 'batch.researchObjectId'
    ? relationId(row, 'batch', 'researchObjectId')
    : scalarId(row, spec.researchObjectField ?? 'researchObjectId');
  return researchObjectId ? journalForResearchObject(deps, researchObjectId) : null;
}

async function currentUserId(deps: JournalBoundaryDeps, req: FastifyRequest): Promise<string | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  return (await getCurrentUser(deps, token)).userId;
}

async function canReadThroughGenericRoute(
  deps: JournalBoundaryDeps,
  target: JournalTarget,
  userId: string,
  membershipCache?: Map<string, Promise<unknown>>,
): Promise<boolean> {
  const membership = delegate(deps.prisma, 'membership');
  if (!membership) return true;
  let pending = membershipCache?.get(target.workspaceId);
  if (!pending) {
    pending = membership.findUnique({
      where: { workspaceId_userId: { workspaceId: target.workspaceId, userId } },
      select: { role: true },
    });
    membershipCache?.set(target.workspaceId, pending);
  }
  const row = await pending;
  const role = record(row)?.role;
  if (!role) return true; // Public readers remain governed by the existing public-read rules.
  if (role === 'owner' || role === 'maintainer' || role === 'author') return true;
  if (role === 'reviewer') return target.assignedReviewerId === userId;
  return false;
}

async function denyJournalRead(
  deps: JournalBoundaryDeps,
  req: FastifyRequest,
  reply: FastifyReply,
  target: JournalTarget,
  userId: string,
): Promise<void> {
  await deps.audit?.record({
    actorId: userId,
    action: 'journal.boundary.read_deny',
    workspaceId: target.workspaceId,
    targetType: target.articleId ? 'journal_article' : 'journal',
    targetId: target.articleId ?? target.journalId,
    metadata: { method: req.method, path: requestPath(req), reason: 'reviewer_scope' },
    requestId: String(req.id),
    ip: req.ip,
  });
  void reply.status(404).send(buildErrorBody('NOT_FOUND', '未找到', String(req.id)));
}

function listCandidate(path: string, item: unknown): Candidate | null {
  const row = record(item);
  if (!row) return null;
  if (path === '/research-objects') {
    const id = uuid(row.id);
    return id ? { kind: 'researchObject', id } : null;
  }
  if (path === '/workspaces') {
    const id = uuid(row.id);
    return id ? { kind: 'workspace', id } : null;
  }
  if (path === '/agent/sessions' || path === '/agent/tasks' || path === '/ingestion') {
    const id = uuid(row.researchObjectId);
    return id ? { kind: 'researchObject', id } : null;
  }
  if (path === '/agent/approvals/pending') {
    const id = uuid(row.taskId);
    return id ? { kind: 'agentTask', id } : null;
  }
  if (path === '/appeals') {
    const id = uuid(row.researchObjectId);
    return id ? { kind: 'researchObject', id } : null;
  }
  return null;
}

async function filterReviewerLists(
  deps: JournalBoundaryDeps,
  req: FastifyRequest,
  payload: unknown,
): Promise<unknown> {
  if (req.method !== 'GET') return payload;
  const path = requestPath(req);
  const field = path === '/research-objects' ? 'researchObjects'
    : path === '/workspaces' ? 'workspaces'
      : path === '/agent/sessions' ? 'sessions'
        : path === '/agent/tasks' || path === '/ingestion' ? 'tasks'
          : path === '/agent/approvals/pending' ? 'approvals'
            : path === '/appeals' ? 'appeals'
            : null;
  if (!field) return payload;
  const response = record(payload);
  const items = response?.[field];
  if (!response || !Array.isArray(items) || items.length === 0) return payload;
  const userId = await currentUserId(deps, req);
  if (!userId) return payload;

  const visible: unknown[] = [];
  const membershipCache = new Map<string, Promise<unknown>>();
  // Bound concurrent exact-key lookups so filtering cannot create an unbounded
  // connection spike on the few legacy lists that do not paginate yet.
  for (let offset = 0; offset < items.length; offset += 10) {
    const chunk = items.slice(offset, offset + 10);
    const keep = await Promise.all(chunk.map(async (item) => {
      const candidate = listCandidate(path, item);
      if (!candidate) return true;
      const target = await resolveCandidate(deps, candidate);
      return !target || canReadThroughGenericRoute(deps, target, userId, membershipCache);
    }));
    chunk.forEach((item, index) => { if (keep[index]) visible.push(item); });
  }
  return { ...response, [field]: visible };
}

async function denyJournalMutation(
  deps: JournalBoundaryDeps,
  req: FastifyRequest,
  reply: FastifyReply,
  target: JournalTarget,
  actorId: string,
): Promise<false> {
  await deps.audit?.record({
    actorId,
    action: 'journal.boundary.deny',
    workspaceId: target.workspaceId,
    targetType: 'journal',
    targetId: target.journalId,
    metadata: { method: req.method, path: requestPath(req) },
    requestId: String(req.id),
    ip: req.ip,
  });
  void reply.status(403).send(buildErrorBody(
    'JOURNAL_WORKFLOW_REQUIRED',
    '期刊管理内容只能通过期刊工作流修改',
    String(req.id),
  ));
  return false;
}

/**
 * Late boundary for multipart handlers. Multipart fields are unavailable to the
 * global preHandler until req.file()/req.parts() consumes the stream.
 */
export async function enforceJournalWorkspaceBoundary(
  deps: JournalBoundaryDeps,
  req: FastifyRequest,
  reply: FastifyReply,
  workspaceId: string,
): Promise<boolean> {
  const target = await journalForWorkspace(deps, workspaceId);
  if (!target) return true;
  const userId = await currentUserId(deps, req);
  if (!userId) {
    void reply.status(401).send(buildErrorBody('SESSION_INVALID', '未登录', String(req.id)));
    return false;
  }
  return denyJournalMutation(deps, req, reply, target, userId);
}

/**
 * Register directly on the root Fastify instance before generic routes. Do not
 * wrap this in an otherwise-empty registered plugin: Fastify hook encapsulation
 * would keep the hook away from sibling route plugins.
 */
export function registerJournalBoundary(app: FastifyInstance, deps: JournalBoundaryDeps): void {
  app.addHook('preHandler', async (req, reply) => {
    const path = requestPath(req);
    if (isJournalWorkflowPath(path)) return;

    // Old unit fakes intentionally omit the new journal delegates. Production
    // clients generated from the required schema expose both delegates.
    if (!delegate(deps.prisma, 'journal') || !delegate(deps.prisma, 'journalArticle')) return;

    if (!WRITE_METHODS.has(req.method)) {
      if (req.method !== 'GET') return;
      const userId = await currentUserId(deps, req);
      if (!userId) return;
      for (const candidate of collectCandidates(req)) {
        const target = await resolveCandidate(deps, candidate);
        if (target && !(await canReadThroughGenericRoute(deps, target, userId))) {
          await denyJournalRead(deps, req, reply, target, userId);
          return;
        }
      }
      return;
    }

    for (const candidate of collectCandidates(req)) {
      const target = await resolveCandidate(deps, candidate);
      if (target) {
        const userId = await currentUserId(deps, req);
        if (!userId) {
          void reply.status(401).send(buildErrorBody('SESSION_INVALID', '未登录', String(req.id)));
          return;
        }
        await denyJournalMutation(deps, req, reply, target, userId);
        return;
      }
    }
  });
  app.addHook('preSerialization', async (req, _reply, payload) => {
    if (!delegate(deps.prisma, 'journal') || !delegate(deps.prisma, 'journalArticle')) return payload;
    return filterReviewerLists(deps, req, payload);
  });
}

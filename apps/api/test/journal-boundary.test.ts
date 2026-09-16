import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession, type AuthDeps } from '@openscience/auth';
import {
  enforceJournalWorkspaceBoundary,
  isJournalWorkflowPath,
  registerJournalBoundary,
  type JournalBoundaryDeps,
} from '../src/journal-boundary';
import { createFakeRedis } from './helpers/fakes';

const JOURNAL_ID = '00000000-0000-4000-8000-000000000001';
const JOURNAL_WORKSPACE_ID = '00000000-0000-4000-8000-000000000002';
const JOURNAL_RO_ID = '00000000-0000-4000-8000-000000000004';
const PERSONAL_RO_ID = '00000000-0000-4000-8000-000000000005';
const JOURNAL_VERSION_ID = '00000000-0000-4000-8000-000000000006';
const JOURNAL_SESSION_ID = '00000000-0000-4000-8000-000000000007';
const JOURNAL_TASK_ID = '00000000-0000-4000-8000-000000000008';
const JOURNAL_APPROVAL_ID = '00000000-0000-4000-8000-000000000009';
const JOURNAL_INGESTION_ID = '00000000-0000-4000-8000-000000000010';
const JOURNAL_INVITATION_ID = '00000000-0000-4000-8000-000000000011';
const JOURNAL_APPEAL_ID = '00000000-0000-4000-8000-000000000012';
const JOURNAL_SANDBOX_ID = '00000000-0000-4000-8000-000000000013';
const JOURNAL_SELECTION_ID = '00000000-0000-4000-8000-000000000014';
const ASSIGNED_RO_ID = '00000000-0000-4000-8000-000000000015';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000016';
const OWNER_ID = '00000000-0000-4000-8000-000000000017';

interface QueryArgs {
  where?: { id?: string; workspaceId?: string; researchObjectId?: string };
}

function createBoundaryDeps(): JournalBoundaryDeps {
  const task = {
    payload: { target: { kind: 'research_object', researchObjectId: JOURNAL_RO_ID } },
    interestContext: null,
    session: { researchObjectId: null },
  };
  const prisma = {
    journal: {
      findUnique: async ({ where }: QueryArgs) => where?.workspaceId === JOURNAL_WORKSPACE_ID
        ? { id: JOURNAL_ID, workspaceId: JOURNAL_WORKSPACE_ID }
        : null,
    },
    journalArticle: {
      findUnique: async ({ where }: QueryArgs) => {
        if (where?.researchObjectId === JOURNAL_RO_ID) {
          return { id: JOURNAL_RO_ID, assignedReviewerId: null, journal: { id: JOURNAL_ID, workspaceId: JOURNAL_WORKSPACE_ID } };
        }
        if (where?.researchObjectId === ASSIGNED_RO_ID) {
          return { id: ASSIGNED_RO_ID, assignedReviewerId: REVIEWER_ID, journal: { id: JOURNAL_ID, workspaceId: JOURNAL_WORKSPACE_ID } };
        }
        return null;
      },
    },
    version: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_VERSION_ID
        ? { researchObjectId: JOURNAL_RO_ID }
        : null,
    },
    agentSession: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_SESSION_ID
        ? { researchObjectId: JOURNAL_RO_ID }
        : null,
    },
    agentTask: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_TASK_ID ? task : null,
    },
    toolApproval: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_APPROVAL_ID ? { task } : null,
    },
    ingestionTask: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_INGESTION_ID
        ? { batch: { researchObjectId: JOURNAL_RO_ID } }
        : null,
    },
    workspaceInvitation: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_INVITATION_ID
        ? { workspaceId: JOURNAL_WORKSPACE_ID }
        : null,
    },
    appeal: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_APPEAL_ID
        ? { researchObjectId: JOURNAL_RO_ID }
        : null,
    },
    sandboxJob: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_SANDBOX_ID
        ? { workspaceId: JOURNAL_WORKSPACE_ID }
        : null,
    },
    editorialSelection: {
      findUnique: async ({ where }: QueryArgs) => where?.id === JOURNAL_SELECTION_ID
        ? { researchObjectId: JOURNAL_RO_ID }
        : null,
    },
    membership: {
      findUnique: async ({ where }: { where?: { workspaceId_userId?: { workspaceId: string; userId: string } } }) => {
        const key = where?.workspaceId_userId;
        if (key?.workspaceId !== JOURNAL_WORKSPACE_ID) return null;
        return key.userId === REVIEWER_ID ? { role: 'reviewer' }
          : key.userId === OWNER_ID ? { role: 'owner' }
            : null;
      },
    },
    user: {
      findUnique: async ({ where }: QueryArgs) => where?.id === REVIEWER_ID || where?.id === OWNER_ID
        ? { id: where.id, email: `${where.id}@example.test`, displayName: 'User', status: 'email_verified', level: 'free' }
        : null,
    },
  };
  return {
    prisma: prisma as unknown as AuthDeps['prisma'],
    redis: createFakeRedis(),
    mailer: { send: async () => undefined },
  };
}

const apps: FastifyInstance[] = [];

function appWithBoundary(deps: JournalBoundaryDeps = createBoundaryDeps()): FastifyInstance {
  const app = Fastify({ logger: false });
  apps.push(app);
  void app.register(cookie, { secret: 'test-secret' });
  registerJournalBoundary(app, deps);
  return app;
}

async function ownerCookies(deps: JournalBoundaryDeps): Promise<{ openscience_session: string }> {
  return { openscience_session: await createSession(deps.redis, { userId: OWNER_ID, status: 'email_verified' }) };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('journal generic-write boundary', () => {
  it('blocks direct journal workspace, research object, version, and fork destination writes', async () => {
    const deps = createBoundaryDeps();
    const app = appWithBoundary(deps);
    const cookies = await ownerCookies(deps);
    app.post('/research-objects', async () => ({ ok: true }));
    app.patch('/research-objects/:id', async () => ({ ok: true }));
    app.post('/research-objects/:id/forks', async () => ({ ok: true }));
    app.post('/versions/:versionId/publish', async () => ({ ok: true }));
    app.patch('/workspaces/:id', async () => ({ ok: true }));

    const requests = [
      { method: 'POST' as const, url: '/research-objects', payload: { workspaceId: JOURNAL_WORKSPACE_ID } },
      { method: 'PATCH' as const, url: `/research-objects/${JOURNAL_RO_ID}`, payload: {} },
      { method: 'POST' as const, url: `/research-objects/${PERSONAL_RO_ID}/forks`, payload: { workspaceId: JOURNAL_WORKSPACE_ID } },
      { method: 'POST' as const, url: `/versions/${JOURNAL_VERSION_ID}/publish`, payload: {} },
      { method: 'PATCH' as const, url: `/workspaces/${JOURNAL_WORKSPACE_ID}`, payload: {} },
    ];
    for (const request of requests) {
      const response = await app.inject({ ...request, cookies });
      expect(response.statusCode, request.url).toBe(403);
      expect(response.json().error.code).toBe('JOURNAL_WORKFLOW_REQUIRED');
    }
    const anonymous = await app.inject({
      method: 'PATCH', url: `/research-objects/${JOURNAL_RO_ID}`, payload: {},
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe('SESSION_INVALID');
  });

  it('resolves existing indirect resources before allowing generic mutations', async () => {
    const deps = createBoundaryDeps();
    const app = appWithBoundary(deps);
    const cookies = await ownerCookies(deps);
    app.post('/workspaces/invitations/:id/accept', async () => ({ ok: true }));
    app.post('/ingestion/:taskId/retry', async () => ({ ok: true }));
    app.post('/agent/tasks/:id/retry', async () => ({ ok: true }));
    app.post('/agent/approvals/:id/approve', async () => ({ ok: true }));
    app.post('/appeals/:id/resolve', async () => ({ ok: true }));
    app.post('/sandbox-jobs/:jobId/modify', async () => ({ ok: true }));
    app.post('/admin/editorial/selections/:id/transition', async () => ({ ok: true }));

    const urls = [
      `/workspaces/invitations/${JOURNAL_INVITATION_ID}/accept`,
      `/ingestion/${JOURNAL_INGESTION_ID}/retry`,
      `/agent/tasks/${JOURNAL_TASK_ID}/retry`,
      `/agent/approvals/${JOURNAL_APPROVAL_ID}/approve`,
      `/appeals/${JOURNAL_APPEAL_ID}/resolve`,
      `/sandbox-jobs/${JOURNAL_SANDBOX_ID}/modify`,
      `/admin/editorial/selections/${JOURNAL_SELECTION_ID}/transition`,
    ];
    for (const url of urls) {
      const response = await app.inject({ method: 'POST', url, payload: {}, cookies });
      expect(response.statusCode, url).toBe(403);
      expect(response.json().error.code).toBe('JOURNAL_WORKFLOW_REQUIRED');
    }
  });

  it('blocks new agent activity when either the session or task payload targets a journal article', async () => {
    const deps = createBoundaryDeps();
    const app = appWithBoundary(deps);
    const cookies = await ownerCookies(deps);
    app.post('/agent/sessions', async () => ({ ok: true }));
    app.post('/agent/tasks', async () => ({ ok: true }));
    app.post('/literature/acquisitions', async () => ({ ok: true }));

    const session = await app.inject({
      method: 'POST', url: '/agent/sessions', payload: { researchObjectId: JOURNAL_RO_ID }, cookies,
    });
    const task = await app.inject({
      method: 'POST', url: '/agent/tasks',
      payload: { sessionId: JOURNAL_SESSION_ID, payload: { versionId: JOURNAL_VERSION_ID } }, cookies,
    });
    const acquisition = await app.inject({
      method: 'POST', url: '/literature/acquisitions',
      payload: { target: { kind: 'research_object', researchObjectId: JOURNAL_RO_ID } }, cookies,
    });
    expect([session.statusCode, task.statusCode, acquisition.statusCode]).toEqual([403, 403, 403]);
  });

  it('permits personal resources and keeps old fakes without journal delegates active', async () => {
    const active = appWithBoundary();
    active.patch('/research-objects/:id', async () => ({ ok: true }));
    const personal = await active.inject({ method: 'PATCH', url: `/research-objects/${PERSONAL_RO_ID}`, payload: {} });
    expect(personal.statusCode).toBe(200);

    const inactive = appWithBoundary({
      prisma: {} as AuthDeps['prisma'],
      redis: createFakeRedis(),
      mailer: { send: async () => undefined },
    });
    inactive.patch('/workspaces/:id', async () => ({ ok: true }));
    const legacyFake = await inactive.inject({ method: 'PATCH', url: `/workspaces/${JOURNAL_WORKSPACE_ID}`, payload: {} });
    expect(legacyFake.statusCode).toBe(200);
  });

  it('exempts only the journal route segments and rejects lookalike prefixes', async () => {
    expect(isJournalWorkflowPath('/journals')).toBe(true);
    expect(isJournalWorkflowPath('/journals/id/articles')).toBe(true);
    expect(isJournalWorkflowPath('/admin/journals/id')).toBe(true);
    expect(isJournalWorkflowPath('/journals-legacy')).toBe(false);
    expect(isJournalWorkflowPath('/admin/journals-old')).toBe(false);

    const deps = createBoundaryDeps();
    const app = appWithBoundary(deps);
    const cookies = await ownerCookies(deps);
    app.post('/journals/:id/articles', async () => ({ ok: true }));
    app.post('/admin/journals/:id', async () => ({ ok: true }));
    app.post('/journals-legacy', async () => ({ ok: true }));
    const allowed = await app.inject({
      method: 'POST', url: `/journals/${JOURNAL_ID}/articles`,
      headers: { 'x-workspace-id': JOURNAL_WORKSPACE_ID }, payload: {}, cookies,
    });
    const adminAllowed = await app.inject({
      method: 'POST', url: `/admin/journals/${JOURNAL_ID}`,
      headers: { 'x-workspace-id': JOURNAL_WORKSPACE_ID }, payload: {}, cookies,
    });
    const lookalike = await app.inject({
      method: 'POST', url: '/journals-legacy',
      headers: { 'x-workspace-id': JOURNAL_WORKSPACE_ID }, payload: {}, cookies,
    });
    expect(allowed.statusCode).toBe(200);
    expect(adminAllowed.statusCode).toBe(200);
    expect(lookalike.statusCode).toBe(403);
  });

  it('applies the shared boundary after multipart fields become available', async () => {
    const deps = createBoundaryDeps();
    const app = appWithBoundary(deps);
    const cookies = await ownerCookies(deps);
    app.post('/artifacts/upload', async (req, reply) => {
      if (!(await enforceJournalWorkspaceBoundary(deps, req, reply, JOURNAL_WORKSPACE_ID))) return;
      return { ok: true };
    });
    const response = await app.inject({ method: 'POST', url: '/artifacts/upload', cookies });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('JOURNAL_WORKFLOW_REQUIRED');
  });

  it('allows assigned reviewers and hides unassigned journal resources on generic reads', async () => {
    const deps = createBoundaryDeps();
    const reviewerToken = await createSession(deps.redis, { userId: REVIEWER_ID, status: 'email_verified' });
    const app = appWithBoundary(deps);
    app.get('/research-objects/:id', async () => ({ ok: true }));
    app.get('/versions/:from/comparison', async () => ({ ok: true }));
    app.get('/appeals', async () => ({
      appeals: [
        { id: 'personal', researchObjectId: PERSONAL_RO_ID },
        { id: 'journal', researchObjectId: JOURNAL_RO_ID },
      ],
    }));
    app.get('/research-objects', async () => ({
      researchObjects: [
        ...Array.from({ length: 101 }, (_, index) => ({ id: PERSONAL_RO_ID, title: `Personal ${index}` })),
        { id: JOURNAL_RO_ID, title: 'Unassigned' },
        { id: ASSIGNED_RO_ID, title: 'Assigned' },
      ],
    }));
    const cookies = { openscience_session: reviewerToken };
    const denied = await app.inject({ method: 'GET', url: `/research-objects/${JOURNAL_RO_ID}`, cookies });
    const comparison = await app.inject({ method: 'GET', url: `/versions/${JOURNAL_VERSION_ID}/comparison`, cookies });
    const assigned = await app.inject({
      method: 'GET', url: `/research-objects/${ASSIGNED_RO_ID}`, cookies,
      headers: { 'x-workspace-id': JOURNAL_WORKSPACE_ID },
    });
    const list = await app.inject({ method: 'GET', url: '/research-objects', cookies });
    const appeals = await app.inject({ method: 'GET', url: '/appeals', cookies });
    expect(denied.statusCode).toBe(404);
    expect(comparison.statusCode).toBe(404);
    expect(assigned.statusCode).toBe(200);
    expect(list.json().researchObjects).toHaveLength(102);
    expect(list.json().researchObjects.at(-1).id).toBe(ASSIGNED_RO_ID);
    expect(appeals.json().appeals).toEqual([{ id: 'personal', researchObjectId: PERSONAL_RO_ID }]);
  });

  it('keeps owner access and strictly rejects generic artifact reads for reviewers', async () => {
    const deps = createBoundaryDeps();
    const reviewerToken = await createSession(deps.redis, { userId: REVIEWER_ID, status: 'email_verified' });
    const ownerToken = await createSession(deps.redis, { userId: OWNER_ID, status: 'email_verified' });
    const artifactPrisma = deps.prisma as unknown as { artifact: { findUnique(args: QueryArgs): Promise<unknown> } };
    artifactPrisma.artifact = {
      findUnique: async () => ({ workspaceId: JOURNAL_WORKSPACE_ID }),
    };
    const app = appWithBoundary(deps);
    app.get('/artifacts/:id/download', async () => ({ ok: true }));
    const artifactId = '00000000-0000-4000-8000-000000000018';
    const reviewer = await app.inject({ method: 'GET', url: `/artifacts/${artifactId}/download`, cookies: { openscience_session: reviewerToken } });
    const owner = await app.inject({ method: 'GET', url: `/artifacts/${artifactId}/download`, cookies: { openscience_session: ownerToken } });
    expect(reviewer.statusCode).toBe(404);
    expect(owner.statusCode).toBe(200);
  });
});

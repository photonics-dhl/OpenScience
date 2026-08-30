import { describe, expect, it } from 'vitest';
import { submitLiteratureAcquisition } from '../../src/retrieval/literature-acquisition';
import { createFakeMailer, createFakePrisma, seedUser } from '../helpers/fakes';

function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const pushed: string[] = [];
  const user = seedUser(db);
  const workspace = { id: 'workspace-personal', type: 'personal', ownerId: user.id, name: 'Personal', status: 'active', createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(workspace);
  db.memberships.push({ id: 'membership-personal', workspaceId: workspace.id, userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  db.usageLedger.push({ id: 'credit', userId: user.id, resource: 'ai_credit', delta: 2, kind: 'grant', createdAt: new Date() });
  const audits: unknown[] = [];
  return {
    db,
    user,
    audits,
    deps: {
      prisma,
      mailer: createFakeMailer(),
      redis: { lpush: async (_queue: string, taskId: string) => (pushed.push(taskId), pushed.length) },
      audit: { record: async (event: unknown) => void audits.push(event) },
    },
  };
}

describe('submitLiteratureAcquisition', () => {
  it('creates one private personal-library RO and server-owned identifier retrieval task', async () => {
    const { deps, db, user, audits } = makeDeps();

    const result = await submitLiteratureAcquisition(deps as never, {
      userId: user.id,
      idempotencyKey: 'request-1',
      query: 'attosecond dynamics',
      identifier: '10.1038/nature12373',
      target: { kind: 'personal' },
    }, { requestId: 'request-id', ip: '127.0.0.1' });

    expect(result).toMatchObject({ researchObject: { workspaceId: 'workspace-personal' }, session: { kind: 'retrieval' }, task: { kind: 'source.retrieve' } });
    expect(db.researchObjects).toHaveLength(1);
    expect(db.researchObjects[0]).toMatchObject({ idempotencyKey: `system:personal-literature:${user.id}`, title: 'Personal Literature Library', visibility: 'private' });
    expect(db.agentTasks[0]?.payload).toEqual({
      query: 'attosecond dynamics', providers: ['scansci'], limit: 1,
      includeFullText: true, identifier: '10.1038/nature12373',
    });
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'agent.session.create' }),
      expect.objectContaining({ action: 'agent.task.submit' }),
    ]));
  });

  it('reuses the target, session, and task on an identical personal replay', async () => {
    const { deps, db, user } = makeDeps();
    const input = { userId: user.id, idempotencyKey: 'request-1', query: 'attosecond dynamics', target: { kind: 'personal' as const } };

    const first = await submitLiteratureAcquisition(deps as never, input);
    const replay = await submitLiteratureAcquisition(deps as never, input);

    expect(replay).toMatchObject({ researchObject: { id: first.researchObject.id }, session: { id: first.session.id }, task: { id: first.task.id } });
    expect(db.researchObjects).toHaveLength(1);
    expect(db.agentSessions).toHaveLength(1);
    expect(db.agentTasks).toHaveLength(1);
    expect(db.agentTasks[0]?.payload).toEqual({
      query: 'attosecond dynamics', providers: ['semantic_scholar', 'tavily'], limit: 10, includeFullText: false,
    });
  });

  it('accepts a member research-object target and rejects a cross-workspace target before task creation', async () => {
    const { deps, db, user } = makeDeps();
    db.workspaces.push({ id: 'workspace-team', type: 'team', ownerId: user.id, name: 'Team', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'membership-team', workspaceId: 'workspace-team', userId: user.id, role: 'editor', createdAt: new Date(), updatedAt: new Date() });
    db.researchObjects.push({ id: '00000000-0000-4000-8000-000000000101', workspaceId: 'workspace-team', createdBy: user.id, title: 'Shared RO', status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
    db.researchObjects.push({ id: '00000000-0000-4000-8000-000000000102', workspaceId: 'workspace-private', createdBy: 'other-user', title: 'Private RO', status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
    db.workspaces.push({ id: 'workspace-private', type: 'team', ownerId: 'other-user', name: 'Private', status: 'active', createdAt: new Date(), updatedAt: new Date() });

    const shared = await submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'shared-1', query: 'ultrafast optics', target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000101' },
    });
    expect(shared.researchObject.id).toBe('00000000-0000-4000-8000-000000000101');

    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'cross-1', query: 'blocked', target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000102' },
    })).rejects.toThrow(/研究对象不存在/);
    expect(db.agentTasks).toHaveLength(1);
  });

  it('does not submit a retrieval task when the user has no AI credit', async () => {
    const { deps, db, user } = makeDeps();
    db.usageLedger.splice(0);

    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'no-credit', query: 'attosecond dynamics', target: { kind: 'personal' },
    })).rejects.toThrow(/AI Credit/);

    expect(db.agentTasks).toHaveLength(0);
  });
});

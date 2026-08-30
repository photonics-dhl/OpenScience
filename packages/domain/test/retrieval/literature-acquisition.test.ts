import { describe, expect, it } from 'vitest';
import { submitLiteratureAcquisition } from '../../src/retrieval/literature-acquisition';
import { createResearchObject } from '../../src/research-object/research-objects';
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
    const { deps, db, user, audits } = makeDeps();
    db.usageLedger.splice(0);

    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'no-credit', query: 'attosecond dynamics', target: { kind: 'personal' },
    })).rejects.toThrow(/AI Credit/);

    expect(db.researchObjects).toHaveLength(0);
    expect(db.agentSessions).toHaveLength(0);
    expect(db.agentTasks).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('rejects malformed acquisition input before any database or audit mutation', async () => {
    const { deps, db, user, audits } = makeDeps();
    for (const input of [
      { query: 'attosecond dynamics', identifier: 'not-a-doi' },
      { query: 'x'.repeat(501) },
      { query: 'attosecond dynamics', identifier: '10.1000/'.concat('x'.repeat(301)) },
    ]) {
      await expect(submitLiteratureAcquisition(deps as never, {
        userId: user.id, idempotencyKey: `bad-${input.query.length}-${input.identifier?.length ?? 0}`,
        target: { kind: 'personal' }, ...input,
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(db.researchObjects).toHaveLength(0);
    expect(db.agentSessions).toHaveLength(0);
    expect(db.agentTasks).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('rejects changed payload replays without leaving a session after a credit failure', async () => {
    const { deps, db, user } = makeDeps();
    db.usageLedger.splice(0);
    const first = { userId: user.id, idempotencyKey: 'same-key', query: 'first query', target: { kind: 'personal' as const } };
    await expect(submitLiteratureAcquisition(deps as never, first)).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDIT' });
    db.usageLedger.push({ id: 'credit-retry', userId: user.id, resource: 'ai_credit', delta: 1, kind: 'grant', createdAt: new Date() });
    const accepted = await submitLiteratureAcquisition(deps as never, { ...first, query: 'second query' });
    db.usageLedger.push({ id: 'credit-replay', userId: user.id, resource: 'ai_credit', delta: 1, kind: 'grant', createdAt: new Date() });
    await expect(submitLiteratureAcquisition(deps as never, first)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(accepted.task.id).toBe(db.agentTasks[0]?.id);
    expect(db.agentSessions).toHaveLength(1);
    expect(db.agentTasks).toHaveLength(1);
  });

  it('compensates resources created before the transactional credit recheck fails', async () => {
    const { deps, db, user, audits } = makeDeps();
    const aggregate = deps.prisma.usageLedger.aggregate;
    let checks = 0;
    deps.prisma.usageLedger.aggregate = async (args: never) => {
      checks += 1;
      return checks === 1 ? aggregate(args) : { _sum: { delta: 0 } };
    };

    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'credit-race', query: 'attosecond dynamics', target: { kind: 'personal' },
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDIT' });

    expect(db.researchObjects).toHaveLength(0);
    expect(db.agentSessions).toHaveLength(0);
    expect(db.agentTasks).toHaveLength(0);
    expect(audits.some((audit) => (audit as { action?: string }).action === 'agent.task.submit')).toBe(false);
  });

  it('reuses a renamed personal library but blocks public claims of server system keys', async () => {
    const { deps, db, user } = makeDeps();
    db.researchObjects.push({
      id: '00000000-0000-4000-8000-000000000201', workspaceId: 'workspace-personal', createdBy: user.id,
      title: 'Renamed by researcher', status: 'draft', visibility: 'private', version: 1,
      idempotencyKey: `system:personal-literature:${user.id}`, createdAt: new Date(), updatedAt: new Date(),
    });
    const attacker = seedUser(db, { id: 'attacker' });
    db.workspaces.push({ id: 'workspace-attacker', type: 'personal', ownerId: attacker.id, name: 'Attacker', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'membership-attacker', workspaceId: 'workspace-attacker', userId: attacker.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });

    const reused = await submitLiteratureAcquisition(deps as never, { userId: user.id, idempotencyKey: 'renamed', query: 'attosecond dynamics', target: { kind: 'personal' } });
    expect(reused.researchObject).toMatchObject({ id: '00000000-0000-4000-8000-000000000201', title: 'Renamed by researcher' });
    await expect(createResearchObject(deps as never, {
      workspaceId: 'workspace-attacker', userId: attacker.id, title: 'Collision', idempotencyKey: `system:personal-literature:${user.id}`,
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects archived personal and team workspace targets before resource, credit, or audit mutation', async () => {
    const { deps, db, user, audits } = makeDeps();
    db.workspaces[0].status = 'archived';
    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'archived-personal', query: 'attosecond dynamics', target: { kind: 'personal' },
    })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
    db.workspaces[0].status = 'active';
    db.workspaces.push({ id: 'workspace-archived-team', type: 'team', ownerId: user.id, name: 'Archived', status: 'archived', createdAt: new Date(), updatedAt: new Date() });
    db.memberships.push({ id: 'membership-archived-team', workspaceId: 'workspace-archived-team', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
    db.researchObjects.push({ id: '00000000-0000-4000-8000-000000000301', workspaceId: 'workspace-archived-team', createdBy: user.id, title: 'Archived', status: 'draft', visibility: 'private', version: 1, createdAt: new Date(), updatedAt: new Date() });
    await expect(submitLiteratureAcquisition(deps as never, {
      userId: user.id, idempotencyKey: 'archived-team', query: 'attosecond dynamics', target: { kind: 'research_object', researchObjectId: '00000000-0000-4000-8000-000000000301' },
    })).rejects.toMatchObject({ code: 'WORKSPACE_ARCHIVED' });
    expect(db.agentSessions).toHaveLength(0);
    expect(db.agentTasks).toHaveLength(0);
    expect(db.usageLedger).toHaveLength(1);
    expect(audits).toHaveLength(0);
  });
});

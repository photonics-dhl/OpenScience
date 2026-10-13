import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import {
  cleanTrashObjects, listCleanableContent, listTrash, moveToTrash, purgeExpiredTrash, purgeTrash,
  rememberDiscardedTaskResult, restoreTrash, type TrashDeps,
} from '../../src/trash/trash';

/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory Prisma boundary records observable lifecycle writes. */
const now = new Date('2026-10-13T00:00:00Z');
const checkpointKey = 'derived/native-agent/journal-checkpoint.json';

function table(rows: any[], defaults: Record<string, unknown> = {}) {
  const matches = (row: any, where: any): boolean => !where || Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (key === 'AND') return value.every((part: any) => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return (value.in === undefined || value.in.includes(row[key]))
        && (value.not === undefined || row[key] !== value.not)
        && (value.lte === undefined || row[key] <= value.lte)
        && (value.startsWith === undefined || row[key]?.startsWith(value.startsWith));
    }
    return row[key] === value;
  });
  const update = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data) as [string, any][]) {
      row[key] = value?.increment === undefined ? value : row[key] + value.increment;
    }
    return row;
  };
  const find = (where: any) => rows.find(row => matches(row, where)) ?? null;
  return {
    findUnique: async ({ where }: any) => find(where),
    findUniqueOrThrow: async ({ where }: any) => { const row = find(where); if (!row) throw new Error('Missing fixture row'); return row; },
    findFirst: async ({ where }: any) => find(where),
    findMany: async ({ where, take, cursor, skip = 0, orderBy }: any = {}) => {
      let selected = rows.filter(row => matches(row, where));
      const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      selected = selected.toSorted((left, right) => {
        for (const item of order) for (const [key, direction] of Object.entries(item)) {
          const comparison = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0;
          if (comparison) return direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
      const offset = cursor ? selected.findIndex(row => Object.entries(cursor).every(([key, value]) => row[key] === value)) + skip : skip;
      return selected.slice(offset, take === undefined ? selected.length : offset + take);
    },
    create: async ({ data }: any) => { const row = { id: `row-${rows.length}`, ...defaults, ...data }; rows.push(row); return row; },
    update: async ({ where, data }: any) => update(find(where), data),
    updateMany: async ({ where, data }: any) => { const selected = rows.filter(row => matches(row, where)); selected.forEach(row => update(row, data)); return { count: selected.length }; },
    count: async ({ where }: any) => rows.filter(row => matches(row, where)).length,
    upsert: async ({ where, create, update: data }: any) => {
      const existing = find(where); if (existing) return update(existing, data);
      const row = { ...defaults, ...create }; rows.push(row); return row;
    },
  };
}

function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'journal-owner' });
  const state = Object.assign(db, {
    trashEntries: [] as any[], cleanupObjects: [] as any[],
    journalJobs: [{ id: 'journal-job', state: 'running', leaseToken: 'paid-lease', grantId: 'journal-grant' }],
    journalGrants: [{ id: 'journal-grant', reserved: 1, consumed: 0 }],
  });
  const session = { id: 'journal-session', kind: 'journal-editor', userId: user.id, researchObjectId: null,
    status: 'active', title: 'Internal journal job', deletedAt: null, trashEntryId: null, createdAt: now, updatedAt: now };
  const task = { id: 'journal-task', sessionId: session.id, kind: 'journal.generate', status: 'running',
    deletedAt: null, trashEntryId: null as string | null, executionAttempt: 1, retryCount: 0, progress: 0, error: null,
    payload: { journalJobId: 'journal-job', leaseToken: 'paid-lease' }, result: {
      nativeAgentExecution: { kind: 'hermes-agent', profile: 'journal-editor', runtimeId: 'installed', model: 'MiniMax-M3' },
      journalNativeCheckpoint: { objectKey: checkpointKey, state: 'started', target: { model: 'MiniMax-M3' }, turnCount: 1 },
    }, createdAt: now, updatedAt: now };
  const publicSession = { ...session, id: 'public-session', kind: 'extract', title: 'Ordinary research' };
  const publicTask = { ...task, id: 'public-task', sessionId: publicSession.id, kind: 'demo.echo', status: 'succeeded',
    payload: { message: 'public input' }, result: { message: 'public output', objectKey: 'derived/public-task/output.json' } };
  db.agentSessions.push(session, publicSession);
  db.agentTasks.push(task, publicTask);
  const database = prisma as any;
  const sessionRead = database.agentSession.findUnique;
  database.agentSession.findUnique = async (args: any) => {
    const row = await sessionRead(args);
    return row && { ...row, researchObject: db.researchObjects.find(candidate => candidate.id === row.researchObjectId) ?? null,
      ...(args.include?.tasks ? { tasks: db.agentTasks.filter(candidate => candidate.sessionId === row.id) } : {}) };
  };
  const taskRead = database.agentTask.findMany;
  database.agentTask.findMany = async (args: any) => (await taskRead(args)).filter((row: any) =>
    (args.where.id === undefined || (typeof args.where.id === 'string' ? row.id === args.where.id : args.where.id.in.includes(row.id)))
    && (args.where.sessionId === undefined || row.sessionId === args.where.sessionId));
  database.agentTask.updateMany = async (args: any) => {
    const ids = new Set((await database.agentTask.findMany(args)).map((row: any) => row.id));
    for (const row of db.agentTasks.filter(candidate => ids.has(candidate.id))) {
      Object.assign(row, args.data, { executionAttempt: args.data.executionAttempt?.increment
        ? row.executionAttempt + args.data.executionAttempt.increment : args.data.executionAttempt ?? row.executionAttempt });
    }
    return { count: ids.size };
  };
  database.agentTask.delete = async ({ where }: any) => db.agentTasks.splice(db.agentTasks.findIndex(row => row.id === where.id), 1)[0];
  database.trashEntry = table(state.trashEntries, { ownerId: user.id, state: 'trashed', parentId: null,
    deletedAt: now, purgeAfter: new Date('2026-11-13T00:00:00Z'), lastError: null });
  database.trashObjectCleanup = table(state.cleanupObjects, { state: 'pending', attempts: 0, updatedAt: now, lastError: null });
  database.journalJob = table(state.journalJobs);
  database.journalGrant = table(state.journalGrants);
  database.manifestEntry = table(db.manifestEntries);
  database.sourceRightsDecision = { deleteMany: vi.fn(async () => ({ count: 0 })) };
  database.blob.deleteMany = vi.fn(async () => ({ count: 0 }));
  database.auditLog.updateMany = vi.fn(async () => ({ count: 0 }));
  database.$queryRaw = vi.fn(async () => [{ used: false }]);
  database.$executeRaw = vi.fn(async (query: any) => {
    const text = Array.isArray(query) ? query.join('?') : query.strings.join('?');
    const target = /UPDATE (agent_sessions|agent_tasks|research_objects) SET deleted_at/u.exec(text)?.[1];
    if (target) {
      const rows = target === 'agent_sessions' ? db.agentSessions : target === 'agent_tasks' ? db.agentTasks : db.researchObjects;
      Object.assign(rows.find(row => row.id === query.values[2]), { deletedAt: query.values[0], trashEntryId: query.values[1] });
    }
    return 0;
  });
  const storage = { deleteObject: vi.fn(async () => undefined) };
  const deleteSearchContent = vi.fn(async () => undefined);
  const deletePrivateJobCopies = vi.fn(async () => undefined);
  const setSearchContentVisibility = vi.fn(async () => undefined);
  const deps = { prisma, storage, mailer: {}, now: () => now, deleteSearchContent, deletePrivateJobCopies, setSearchContentVisibility } as unknown as TrashDeps;
  const snapshot = () => structuredClone({ sessions: db.agentSessions, tasks: db.agentTasks, entries: state.trashEntries,
    objects: state.cleanupObjects, jobs: state.journalJobs, grants: state.journalGrants, audits: db.auditLogs });
  const entry = (kind: 'session' | 'task', resourceId: string, status = 'trashed') => {
    const row = { id: `${resourceId}-entry`, kind, resourceId, ownerId: user.id, workspaceId: null,
      researchObjectId: null, parentId: null, state: status, label: 'Old content item', lastError: null,
      deletedAt: now, purgeAfter: new Date('2026-11-13T00:00:00Z'), purgeScope: null };
    state.trashEntries.push(row);
    return row;
  };
  const noCleanup = () => {
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(deleteSearchContent).not.toHaveBeenCalled();
    expect(deletePrivateJobCopies).not.toHaveBeenCalled();
    expect(setSearchContentVisibility).not.toHaveBeenCalled();
  };
  return { deps, db, state, user, session, task, publicSession, publicTask, snapshot, entry, noCleanup, storage,
    deleteSearchContent, deletePrivateJobCopies, setSearchContentVisibility };
}

describe('ordinary content and trash cannot operate journal control state', () => {
  it('does not enumerate internal journal UUIDs as deletable ordinary content', async () => {
    const f = fixture();
    const before = f.snapshot();
    const items = await listCleanableContent(f.deps, { userId: f.user.id });
    expect(items.map(item => item.resourceId)).toEqual([f.publicSession.id, f.publicTask.id]);
    expect(items.every(item => item.canDelete)).toBe(true);
    expect(f.snapshot()).toEqual(before);
  });

  it('hides old internal task/session TrashEntries while retaining ordinary trash', async () => {
    const f = fixture();
    f.entry('session', f.session.id); f.entry('task', f.task.id);
    const ordinary = f.entry('task', f.publicTask.id);
    const before = f.snapshot();
    await expect(listTrash(f.deps, { userId: f.user.id })).resolves.toEqual([ordinary]);
    expect(f.snapshot()).toEqual(before);
  });

  for (const kind of ['session', 'task'] as const) {
    it.each(['started', 'completed'])('rejects direct ' + kind + ' UUID deletion with a paid %s checkpoint', async paidState => {
      const f = fixture();
      f.task.result.journalNativeCheckpoint.state = paidState;
      const before = f.snapshot();
      await expect(moveToTrash(f.deps, { userId: f.user.id, kind, resourceId: kind === 'session' ? f.session.id : f.task.id, deleteUnadopted: true }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(f.snapshot()).toEqual(before); f.noCleanup();
    });

    it.each(['trashed', 'restored'])('rejects old ' + kind + ' restore entries in state %s', async state => {
      const f = fixture();
      const row = f.entry(kind, kind === 'session' ? f.session.id : f.task.id, state);
      const before = f.snapshot();
      await expect(restoreTrash(f.deps, { userId: f.user.id, id: row.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(f.snapshot()).toEqual(before); f.noCleanup();
    });

    it.each(['trashed', 'purge_pending', 'purged', 'retained'])('rejects old ' + kind + ' purge entries in state %s', async state => {
      const f = fixture();
      const row = f.entry(kind, kind === 'session' ? f.session.id : f.task.id, state);
      const before = f.snapshot();
      await expect(purgeTrash(f.deps, { userId: f.user.id, id: row.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(f.snapshot()).toEqual(before); f.noCleanup();
    });
  }

  it.each([['journal.generate', 'extract'], ['demo.echo', 'journal-editor']])(
    'protects a task when either control identity remains (%s / %s)', async (taskKind, sessionKind) => {
      const f = fixture(); f.task.kind = taskKind; f.session.kind = sessionKind;
      const before = f.snapshot();
      await expect(moveToTrash(f.deps, { userId: f.user.id, kind: 'task', resourceId: f.task.id }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(f.snapshot()).toEqual(before);
    },
  );

  it('protects an ordinary parent session containing an internal journal task', async () => {
    const f = fixture(); f.session.kind = 'extract';
    const before = f.snapshot();
    await expect(moveToTrash(f.deps, { userId: f.user.id, kind: 'session', resourceId: f.session.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.snapshot()).toEqual(before); f.noCleanup();
    const items = await listCleanableContent(f.deps, { userId: f.user.id });
    expect(items.map(item => item.resourceId)).toEqual([f.publicSession.id, f.publicTask.id]);
  });

  it('rejects a stored purgeScope containing an internal task before calling external cleanup', async () => {
    const f = fixture(); const row = f.entry('task', f.publicTask.id, 'purge_pending');
    Object.assign(row, { purgeScope: { trashEntryId: row.id, taskIds: [f.task.id], artifactIds: [], assetIds: [] } });
    const before = f.snapshot();
    await expect(purgeTrash(f.deps, { userId: f.user.id, id: row.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it('rejects old child entries pointing to internal tasks before restoring the ordinary parent', async () => {
    const f = fixture(); const row = f.entry('session', f.publicSession.id);
    const child = f.entry('task', f.task.id); Object.assign(child, { parentId: row.id });
    const before = f.snapshot();
    await expect(restoreTrash(f.deps, { userId: f.user.id, id: row.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it('protects a journal session with a previously removed task from research-object cascades', async () => {
    const f = fixture();
    f.db.agentTasks.splice(f.db.agentTasks.findIndex(task => task.id === f.task.id), 1);
    Object.assign(f.session, { researchObjectId: 'research-object' });
    f.db.researchObjects.push({ id: 'research-object', workspaceId: 'space', createdBy: f.user.id, title: 'Research', deletedAt: null });
    f.db.workspaces.push({ id: 'space', status: 'active' });
    f.db.memberships.push({ workspaceId: 'space', userId: f.user.id, role: 'owner' });
    const before = f.snapshot();
    await expect(moveToTrash(f.deps, { userId: f.user.id, kind: 'research_object', resourceId: 'research-object' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it('keeps an ordinary research-object cascade available beside private journal authority', async () => {
    const f = fixture(); Object.assign(f.publicSession, { researchObjectId: 'research-object' });
    f.db.researchObjects.push({ id: 'research-object', workspaceId: 'space', createdBy: f.user.id, title: 'Research', deletedAt: null });
    f.db.workspaces.push({ id: 'space', status: 'active' });
    f.db.memberships.push({ workspaceId: 'space', userId: f.user.id, role: 'owner' });
    const before = structuredClone({ task: f.task, session: f.session, jobs: f.state.journalJobs, grants: f.state.journalGrants });
    const moved = await moveToTrash(f.deps, { userId: f.user.id, kind: 'research_object', resourceId: 'research-object' });
    expect(moved.entry.kind).toBe('research_object');
    await expect(restoreTrash(f.deps, { userId: f.user.id, id: moved.entry.id })).resolves.toMatchObject({ state: 'restored' });
    expect({ task: f.task, session: f.session, jobs: f.state.journalJobs, grants: f.state.journalGrants }).toEqual(before);
  });

  it.each(['pending', 'deleting'])('does not clean a checkpoint already queued by an old trash entry (%s)', async state => {
    const f = fixture(); const row = f.entry('task', f.task.id, 'purge_pending');
    f.state.cleanupObjects.push({ objectKey: checkpointKey, trashEntryId: row.id, state, attempts: 0 });
    const before = f.snapshot();
    await cleanTrashObjects(f.deps, row.id);
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it.each(['pending', 'deleting'])('quarantines a committed old purge when its journal task and session are both missing (%s)', async state => {
    const f = fixture(); const row = f.entry('task', f.task.id, 'purged');
    Object.assign(row, { purgeScope: { trashEntryId: row.id, taskIds: [f.task.id], artifactIds: [], assetIds: [] } });
    const nativeKey = `derived/native-agent/${'a'.repeat(64)}.json`;
    f.state.cleanupObjects.push({ objectKey: nativeKey, trashEntryId: row.id, state, attempts: 0, lastError: null });
    f.db.agentTasks.splice(f.db.agentTasks.findIndex(task => task.id === f.task.id), 1);
    f.db.agentSessions.splice(f.db.agentSessions.findIndex(session => session.id === f.session.id), 1);
    const before = f.snapshot();
    await cleanTrashObjects(f.deps, row.id);
    expect(f.state.cleanupObjects[0]).toMatchObject({ state: 'pending', attempts: 0 });
    expect(f.state.cleanupObjects[0].lastError).toMatch(/identity/u);
    expect({ ...f.snapshot(), objects: before.objects }).toEqual(before);
    f.noCleanup();
  });

  it.each(['pending', 'deleting'])('keeps positive saved journal identity protected after both rows disappear (%s)', async state => {
    const f = fixture(); const row = f.entry('task', f.task.id, 'purged');
    Object.assign(row, { purgeScope: { trashEntryId: row.id, taskIds: [f.task.id], artifactIds: [], assetIds: [],
      taskIdentities: [{ taskId: f.task.id, kind: 'journal.generate', sessionKind: 'journal-editor' }] } });
    f.state.cleanupObjects.push({ objectKey: `derived/native-agent/${'a'.repeat(64)}.json`, trashEntryId: row.id, state, attempts: 0 });
    f.db.agentTasks.splice(f.db.agentTasks.findIndex(task => task.id === f.task.id), 1);
    f.db.agentSessions.splice(f.db.agentSessions.findIndex(session => session.id === f.session.id), 1);
    const before = f.snapshot();
    await cleanTrashObjects(f.deps, row.id);
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it('persists ordinary Native identity privately so cleanup can resume after task/session deletion', async () => {
    const f = fixture(); const nativeKey = `derived/native-agent/${'f'.repeat(64)}.json`;
    Object.assign(f.publicTask, { kind: 'sdf.extract', result: { core: { method: 'Saved research' },
      nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-analysis', checkpoint: { objectKey: nativeKey, state: 'completed' } } } });
    const moved = await moveToTrash(f.deps, { userId: f.user.id, kind: 'session', resourceId: f.publicSession.id, deleteUnadopted: true });
    const result = await purgeTrash(f.deps, { userId: f.user.id, id: moved.entry.id });
    expect(f.db.agentTasks.some(task => task.id === f.publicTask.id)).toBe(false);
    expect(f.db.agentSessions.some(session => session.id === f.publicSession.id)).toBe(false);
    const owner = f.state.trashEntries.find(entry => entry.id === f.state.cleanupObjects[0].trashEntryId);
    expect(owner).toMatchObject({ purgeScope: { taskIdentities: expect.arrayContaining([
      { taskId: f.publicTask.id, kind: 'sdf.extract', sessionKind: 'extract' },
    ]) } });
    expect(JSON.stringify(result)).not.toContain('taskIdentities');
    expect(f.state.cleanupObjects[0]).toMatchObject({ state: 'pending' });
    // The parent core transaction committed with the child-owned cleanup still pending.
    owner.state = 'purge_pending';
    const resumed = await purgeTrash(f.deps, { userId: f.user.id, id: owner.id });
    expect(JSON.stringify(resumed)).not.toContain('taskIdentities');
    expect(JSON.stringify(f.deletePrivateJobCopies.mock.calls)).not.toContain('taskIdentities');
    expect(JSON.stringify(f.deleteSearchContent.mock.calls)).not.toContain('taskIdentities');
    expect(f.state.cleanupObjects[0]).toMatchObject({ state: 'deleted' });
    expect(f.storage.deleteObject).toHaveBeenLastCalledWith(nativeKey);
  });

  it('scans beyond 200 leading internal trash entries to fill the public list', async () => {
    const f = fixture();
    for (let index = 0; index < 205; index += 1) {
      const taskId = `internal-task-${index}`;
      f.db.agentTasks.push({ ...f.task, id: taskId });
      const row = f.entry('task', taskId); Object.assign(row, { id: `internal-entry-${index}`, deletedAt: new Date(now.getTime() + 1_000) });
    }
    const ordinary = f.entry('task', f.publicTask.id);
    await expect(listTrash(f.deps, { userId: f.user.id })).resolves.toEqual([ordinary]);
  });

  it('scans past internal visibility and purge batches so ordinary expired content still advances', async () => {
    const f = fixture();
    for (let index = 0; index < 105; index += 1) {
      const taskId = `internal-task-${index}`;
      f.db.agentTasks.push({ ...f.task, id: taskId });
      const row = f.entry('task', taskId); Object.assign(row, { id: `internal-entry-${index}`,
        deletedAt: new Date(now.getTime() + 1_000), purgeAfter: new Date('2026-09-01T00:00:00Z') });
    }
    const ordinary = f.entry('task', f.publicTask.id); ordinary.purgeAfter = new Date('2026-10-01T00:00:00Z');
    const controlBefore = structuredClone({ session: f.session, task: f.task, jobs: f.state.journalJobs, grants: f.state.journalGrants });
    await expect(purgeExpiredTrash(f.deps)).resolves.toEqual({ purged: 1, failed: 0 });
    expect(f.setSearchContentVisibility).toHaveBeenCalledWith(expect.objectContaining({ trashEntryId: ordinary.id }), false, expect.anything());
    expect(f.state.trashEntries.find(entry => entry.id === ordinary.id)).toMatchObject({ state: 'purged' });
    expect({ session: f.session, task: f.task, jobs: f.state.journalJobs, grants: f.state.journalGrants }).toEqual(controlBefore);
  });

  it('does not let quarantined Native objects occupy the cleanup processing limit', async () => {
    const f = fixture();
    for (let index = 0; index < 105; index += 1) {
      const id = `missing-task-${index}`;
      const row = f.entry('task', id, 'purged'); Object.assign(row, { id: `missing-entry-${index}`,
        purgeScope: { trashEntryId: `missing-entry-${index}`, taskIds: [id], artifactIds: [], assetIds: [] } });
      f.state.cleanupObjects.push({ objectKey: `derived/native-agent/${index.toString(16).padStart(64, '0')}.json`,
        trashEntryId: row.id, state: 'pending', attempts: 0, lastError: null, updatedAt: new Date('2026-09-01T00:00:00Z') });
    }
    const ordinary = f.entry('task', f.publicTask.id, 'purged');
    f.state.cleanupObjects.push({ objectKey: 'derived/public-task/queued-output.json', trashEntryId: ordinary.id,
      state: 'pending', attempts: 0, lastError: null, updatedAt: now });
    await cleanTrashObjects(f.deps);
    expect(f.storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(f.storage.deleteObject).toHaveBeenCalledWith('derived/public-task/queued-output.json');
    expect(f.state.cleanupObjects.filter(row => row.objectKey.startsWith('derived/native-agent/'))
      .every(row => row.state === 'pending' && row.attempts === 0)).toBe(true);
  });

  it('does not register late journal checkpoints for an old trash entry', async () => {
    const f = fixture(); const row = f.entry('task', f.task.id, 'purged');
    f.task.trashEntryId = row.id;
    const before = f.snapshot();
    await rememberDiscardedTaskResult(f.deps.prisma, f.task.id, f.task.result);
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it('still registers ordinary late output cleanup without changing adjacent journal authority', async () => {
    const f = fixture(); const row = f.entry('task', f.publicTask.id, 'purged');
    f.publicTask.trashEntryId = row.id;
    const before = structuredClone({ task: f.task, session: f.session, jobs: f.state.journalJobs, grants: f.state.journalGrants });
    await rememberDiscardedTaskResult(f.deps.prisma, f.publicTask.id, { objectKey: 'derived/public-task/late-output.json' });
    expect(f.state.cleanupObjects).toEqual([expect.objectContaining({ objectKey: 'derived/public-task/late-output.json',
      trashEntryId: row.id, state: 'pending' })]);
    expect(f.state.trashEntries.find(entry => entry.id === row.id)).toMatchObject({ state: 'purge_pending' });
    expect({ task: f.task, session: f.session, jobs: f.state.journalJobs, grants: f.state.journalGrants }).toEqual(before);
    f.noCleanup();
  });

  it('leaves expired internal entries and journal grant authority unchanged during scheduled cleanup', async () => {
    const f = fixture(); const row = f.entry('task', f.task.id);
    row.purgeAfter = new Date('2026-10-01T00:00:00Z');
    const before = f.snapshot();
    await purgeExpiredTrash(f.deps);
    expect(f.snapshot()).toEqual(before); f.noCleanup();
  });

  it('keeps ordinary task move, restore and physical purge working beside a paid journal task', async () => {
    const f = fixture();
    const privateBefore = structuredClone({ session: f.session, task: f.task, jobs: f.state.journalJobs, grants: f.state.journalGrants });
    const moved = await moveToTrash(f.deps, { userId: f.user.id, kind: 'task', resourceId: f.publicTask.id });
    expect(f.db.agentTasks.find(task => task.id === f.publicTask.id)?.deletedAt).toEqual(now);
    await restoreTrash(f.deps, { userId: f.user.id, id: moved.entry.id });
    expect(f.db.agentTasks.find(task => task.id === f.publicTask.id)?.deletedAt).toBeNull();
    const movedAgain = await moveToTrash(f.deps, { userId: f.user.id, kind: 'task', resourceId: f.publicTask.id });
    await expect(purgeTrash(f.deps, { userId: f.user.id, id: movedAgain.entry.id })).resolves.toMatchObject({ state: 'purged' });
    expect(f.db.agentTasks.some(task => task.id === f.publicTask.id)).toBe(false);
    expect(f.storage.deleteObject).toHaveBeenCalledWith('derived/public-task/output.json');
    expect({ session: f.session, task: f.task, jobs: f.state.journalJobs, grants: f.state.journalGrants }).toEqual(privateBefore);
  });
});

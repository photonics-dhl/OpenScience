import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { cancelHermesResearchRun, createHermesResearchRun, getHermesResearchRun, HERMES_RUN_OWNED_STOP_REASON } from '../../src/agent/research-run';

function fakeRedis() {
  return { lpush: async () => 1 };
}

async function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'owner' });
  db.workspaces.push({ id: 'workspace', status: 'active' });
  db.memberships.push({ id: 'membership', workspaceId: 'workspace', userId: user.id, role: 'owner' });
  db.researchObjects.push({ id: 'research-object', workspaceId: 'workspace', createdBy: user.id, status: 'draft', visibility: 'private', deletedAt: null });
  db.artifacts.push({ id: 'artifact', workspaceId: 'workspace', blobSha256: 'a'.repeat(64), mimeType: 'application/pdf', deletedAt: null, bytesPurgedAt: null });
  db.ingestionBatches.push({ id: 'batch', userId: user.id, researchObjectId: 'research-object', agentSessionId: 'session' });
  db.agentSessions.push({ id: 'session', userId: user.id, researchObjectId: 'research-object', kind: 'ingestion', status: 'active', deletedAt: null,
    idempotencyKey: 'session' });
  db.agentTasks.push({ id: 'source-task', sessionId: 'session', kind: 'sdf.extract', status: 'succeeded', progress: 100, retryCount: 0,
    executionAttempt: 1, dispatchedAt: new Date(), deletedAt: null, error: null, payload: { artifactId: 'artifact', researchObjectId: 'research-object' },
    result: { canonicalExtractionContract: 'grounded-passages-v2', sourceMapRef: { schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'artifact',
      contentHash: 'a'.repeat(64), objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 1 } },
    createdAt: new Date(), updatedAt: new Date(), idempotencyKey: 'source-task' });
  db.ingestionTasks.push({ id: 'ingestion', batchId: 'batch', artifactId: 'artifact', agentTaskId: 'source-task', state: 'confirmed', retryCount: 0,
    error: null, createdAt: new Date(), updatedAt: new Date() });
  Object.assign(prisma.hermesResearchRun, {
    findFirst: async () => null,
    findUniqueOrThrow: async (args: { where: { id: string }; include?: unknown }) => prisma.hermesResearchRun.findUnique(args as never),
  });
  const deps = { prisma, redis: fakeRedis(), mailer: {} } as never;
  const run = await createHermesResearchRun(deps, { actorId: user.id, researchObjectId: 'research-object', ingestionTaskIds: ['ingestion'],
    idempotencyKey: 'run', generation: { profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: 'en', style: 'auto', instruction: 'Explain the paper' } });
  return { deps, prisma, db, user, run };
}

describe('owned Hermes run stop', () => {
  it('stops the run, seals directly bound child tasks, and replays without new work', async () => {
    const f = await fixture();
    const task = f.db.agentTasks.find(row => row.id === 'source-task')!;
    task.status = 'running'; task.executionAttempt = 2;
    task.payload = { ...task.payload, hermesRunAuthority: { runId: f.run.id, stage: 'source_ingestion', ordinal: 0, profile: 'visual-narrative-v1' } };
    const stopped = await cancelHermesResearchRun(f.deps, { actorId: f.user.id, researchObjectId: 'research-object', runId: f.run.id, expectedVersion: f.run.version });
    expect(stopped).toMatchObject({ outcome: 'applied', status: 'stopped', error: HERMES_RUN_OWNED_STOP_REASON });
    expect(task).toMatchObject({ status: 'failed', error: HERMES_RUN_OWNED_STOP_REASON, executionAttempt: 3 });
    const replay = await cancelHermesResearchRun(f.deps, { actorId: f.user.id, researchObjectId: 'research-object', runId: f.run.id, expectedVersion: f.run.version });
    expect(replay).toMatchObject({ outcome: 'alreadyApplied', status: 'stopped' });
    const view = await getHermesResearchRun(f.deps, { actorId: f.user.id, researchObjectId: 'research-object', runId: f.run.id });
    expect(view.status).toBe('stopped');
    expect(view.canRetryGeneration).toBeUndefined();
  });

  it('rejects a stale version and leaves a succeeded run terminal', async () => {
    const f = await fixture();
    await expect(cancelHermesResearchRun(f.deps, { actorId: f.user.id, researchObjectId: 'research-object', runId: f.run.id, expectedVersion: 99 }))
      .rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    const row = f.db.hermesResearchRuns.find(candidate => candidate.id === f.run.id)!;
    row.status = 'succeeded';
    await expect(cancelHermesResearchRun(f.deps, { actorId: f.user.id, researchObjectId: 'research-object', runId: f.run.id, expectedVersion: row.version }))
      .resolves.toMatchObject({ outcome: 'terminal', status: 'succeeded' });
  });
});

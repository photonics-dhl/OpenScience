import { describe, expect, it, vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import type { AuditSink } from '@openscience/observability';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { getHermesResearchRun, reconcileHermesResearchRuns, retryHermesGeneration } from '../../src/agent/research-run';
import { retryIngestionTask } from '../../src/ingestion/ingestion-service';

function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  db.workspaces.push({ id: 'ws', status: 'active' });
  db.memberships.push({ workspaceId: 'ws', userId: user.id, role: 'author' });
  db.researchObjects.push({ id: 'ro', workspaceId: 'ws', status: 'draft', deletedAt: null });
  db.artifacts.push({ id: 'artifact', workspaceId: 'ws', blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null });
  db.ingestionBatches.push({ id: 'batch', userId: user.id, researchObjectId: 'ro' });
  db.agentSessions.push({ id: 'session', userId: user.id, researchObjectId: 'ro', status: 'active', deletedAt: null });
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'needs_review', artifactId: 'artifact', contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  db.agentTasks.push({ id: 'task', sessionId: 'session', kind: 'sdf.extract', status: 'succeeded', progress: 100,
    retryCount: 0, executionAttempt: 1, deletedAt: null, dispatchedAt: new Date(), error: null,
    payload: { artifactId: 'artifact', researchObjectId: 'ro' },
    result: { status: 'needs_review', format: 'pdf', reason: 'unresolved pages remain', sourceMapRef } });
  db.ingestionTasks.push({ id: 'ingestion', batchId: 'batch', artifactId: 'artifact', agentTaskId: 'task',
    state: 'needs_review', retryCount: 0, error: null });
  db.hermesResearchRuns.push({ id: 'run', actorId: user.id, researchObjectId: 'ro', status: 'failed', version: 3,
    versionId: null, sourceClaimIds: [], sourceReviewDigest: null, profile: 'visual-narrative-v1', maxAgentTasks: 9,
    generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain the paper' },
    error: 'Hermes requires a completed source-grounded scientific review and its reviewed Claims' });
  db.hermesResearchSteps.push({ id: 'step', runId: 'run', stage: 'source_ingestion', ordinal: 0,
    ingestionTaskId: 'ingestion', artifactId: 'artifact', agentTaskId: 'task', presentationAssetId: null,
    status: 'succeeded', error: null });
  Object.assign(prisma.hermesResearchRun, { findUniqueOrThrow: async (args: Parameters<typeof prisma.hermesResearchRun.findUnique>[0]) =>
    prisma.hermesResearchRun.findUnique(args) });
  Object.assign(prisma.auditLog, { findMany: vi.fn(async ({ where }: { where: { action: string; actorId: string;
    AND: Array<{ metadata: { path: string[]; equals: string } }> } }) => db.auditLogs.filter(row => row.action === where.action
      && row.actorId === where.actorId && where.AND.every(clause => row.metadata[clause.metadata.path[0]!] === clause.metadata.equals))),
    findFirst: vi.fn(async ({ where }: { where: { action: string; actorId: string;
    metadata: { path: string[]; equals: string } } }) => db.auditLogs.find(row => row.action === where.action
      && row.actorId === where.actorId && row.metadata[where.metadata.path[0]!] === where.metadata.equals) ?? null) });
  Object.assign(prisma.hermesResearchStep, { findFirst: vi.fn(async ({ where }: { where: { ingestionTaskId: string } }) =>
    db.hermesResearchSteps.find(step => step.ingestionTaskId === where.ingestionTaskId) ?? null) });
  const updateTask = prisma.agentTask.updateMany.bind(prisma.agentTask);
  const findTasks = prisma.agentTask.findMany.bind(prisma.agentTask);
  vi.spyOn(prisma.agentTask, 'findMany').mockImplementation(async args => {
    const rows = await findTasks(args);
    const ids = typeof args?.where?.id === 'object' ? args.where.id.in : undefined;
    return ids ? rows.filter(row => ids.includes(row.id)) : rows;
  });
  vi.spyOn(prisma.agentTask, 'updateMany').mockImplementation(async args => {
    const task = db.agentTasks.find(row => row.id === args.where?.id);
    const where = args.where;
    if (task && (where?.result && !isDeepStrictEqual((where.result as { equals: unknown }).equals, task.result)
      || where?.payload && !isDeepStrictEqual((where.payload as { equals: unknown }).equals, task.payload))) return { count: 0 };
    return updateTask(args);
  });
  const audit: AuditSink = { record: async (event, tx) => {
    await (tx as typeof prisma).auditLog.create({ data: event as never });
  } };
  const redis = { lpush: vi.fn(async () => 1) };
  const deps = { prisma, redis, audit } as unknown as Parameters<typeof retryHermesGeneration>[0];
  const read = { actorId: user.id, researchObjectId: 'ro', runId: 'run' };
  const input = { ...read, expectedVersion: 3, idempotencyKey: 'explicit-parser-resume' };
  return { deps, prisma, db, redis, read, input, sourceMapRef };
}

describe('explicit source parser recovery', () => {
  it('projects an old failed run as parser incomplete without exposing storage or writing', async () => {
    const f = fixture();
    const view = await getHermesResearchRun(f.deps, f.read);
    expect(view).toMatchObject({ canRetryGeneration: true, chargeableAttempts: 0, generationRecovery: 'source-parser',
      sourceParsing: { status: 'needs_review', ingestionTaskId: 'ingestion', agentTaskId: 'task', providerChargeMayApply: true } });
    expect(view.sourceParsing).not.toHaveProperty('unresolvedPageNumbers');
    expect(JSON.stringify(view)).not.toContain('derived/source-maps');
    expect(f.db.auditLogs).toHaveLength(0); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('atomically resumes the same source task and run, preserving the exact partial checkpoint and original reservation', async () => {
    const f = fixture(); const original = structuredClone(f.db.agentTasks[0].result);
    const view = await retryHermesGeneration(f.deps, f.input);
    expect(view).toMatchObject({ id: 'run', status: 'running', version: 4, maxAgentTasks: 9 });
    expect(view.steps[0]).toMatchObject({ status: 'waiting', agentTaskId: 'task', ingestionTaskId: 'ingestion' });
    expect(f.db.agentTasks[0]).toMatchObject({ status: 'pending', retryCount: 1, executionAttempt: 1,
      result: { sourceMapRef: f.sourceMapRef } });
    expect(f.db.ingestionTasks[0]).toMatchObject({ state: 'queued', retryCount: 1 });
    expect(f.db.agentTasks).toHaveLength(1); expect(f.db.usageLedger).toHaveLength(0);
    expect(f.db.auditLogs).toContainEqual(expect.objectContaining({ action: 'ingestion.task.retry',
      metadata: expect.objectContaining({ recovery: 'unresolved_parser_pages', previousParserResult: original,
        checkpointReused: true, runId: 'run', clientIdempotencyKey: f.input.idempotencyKey,
        previousExecutionAttempt: 1, retryAttempt: 1, creditPolicy: 'reuse-original-reservation' }) }));
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    await expect(retryHermesGeneration(f.deps, f.input)).resolves.toMatchObject({ id: 'run', version: 4 });
    expect(f.redis.lpush).toHaveBeenCalledTimes(1); expect(f.db.auditLogs).toHaveLength(1);
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 4 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('retains the same partial checkpoint through the existing standalone ingestion retry', async () => {
    const f = fixture(); f.db.hermesResearchSteps.length = 0; f.db.hermesResearchRuns.length = 0;
    await retryIngestionTask(f.deps as Parameters<typeof retryIngestionTask>[0], { userId: f.read.actorId, taskId: 'ingestion' });
    expect(f.db.agentTasks[0].result).toEqual({ sourceMapRef: f.sourceMapRef });
    expect(f.db.auditLogs[0].metadata).not.toHaveProperty('runId');
  });

  it('rejects a generic ingestion retry bound to a failed Hermes run', async () => {
    const f = fixture(); const before = structuredClone(f.db);
    await expect(retryIngestionTask(f.deps as Parameters<typeof retryIngestionTask>[0], {
      userId: f.read.actorId, taskId: 'ingestion',
    })).rejects.toMatchObject({ code: 'INGESTION_NOT_RETRYABLE' });
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('fences simultaneous requests to one committed retry and dispatch', async () => {
    const f = fixture();
    const results = await Promise.allSettled([retryHermesGeneration(f.deps, f.input), retryHermesGeneration(f.deps, f.input)]);
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(f.db.auditLogs).toHaveLength(1); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });

  it('rolls back checkpoint, counters and run together when the source step CAS loses', async () => {
    const f = fixture(); const before = structuredClone(f.db);
    vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('rolls back the source retry if the audit cannot commit', async () => {
    const f = fixture(); const before = structuredClone(f.db);
    vi.spyOn(f.deps.audit!, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toThrow('audit unavailable');
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('rejects ambiguous receipts rather than choosing the latest row', async () => {
    const f = fixture(); await retryHermesGeneration(f.deps, f.input);
    f.db.auditLogs.push({ ...structuredClone(f.db.auditLogs[0]), id: 'duplicate' });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });

  it('keeps the original result when the task CAS loses', async () => {
    const f = fixture(); const before = structuredClone(f.db);
    vi.spyOn(f.prisma.agentTask, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'INGESTION_NOT_RETRYABLE' });
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it.each(['actor', 'version', 'hash', 'payload', 'deleted-session', 'purged-source', 'budget', 'reviewed', 'grant', 'viewer'])(
    'rejects changed %s before dispatch or writes', async change => {
    const f = fixture();
    if (change === 'actor') f.input.actorId = 'other';
    if (change === 'version') f.input.expectedVersion = 2;
    if (change === 'hash') f.db.artifacts[0].blobSha256 = 'c'.repeat(64);
    if (change === 'payload') f.db.agentTasks[0].payload.artifactId = 'other';
    if (change === 'deleted-session') f.db.agentSessions[0].deletedAt = new Date();
    if (change === 'purged-source') f.db.artifacts[0].bytesPurgedAt = new Date();
    if (change === 'budget') {
      f.db.ingestionTasks[0].retryCount = 2; f.db.agentTasks[0].retryCount = 2; f.db.agentTasks[0].executionAttempt = 3;
    }
    if (change === 'reviewed') f.db.hermesResearchRuns[0].sourceClaimIds = ['claim'];
    if (change === 'grant') f.db.hermesResearchRuns[0].maxAgentTasks = 11;
    if (change === 'viewer') f.db.memberships[0].role = 'viewer';
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({
      code: expect.stringMatching(/^(NOT_FOUND|FORBIDDEN|CONCURRENT_UPDATE|SOURCE_NOT_READY|INGESTION_NOT_RETRYABLE|VALIDATION_ERROR)$/),
    });
    expect(f.db.auditLogs).toHaveLength(0); expect(f.redis.lpush).not.toHaveBeenCalled();
    expect(f.db.agentTasks[0].status).toBe('succeeded');
  });

  it('keeps diagnostics after the retry allowance is exhausted', async () => {
    const f = fixture(); f.db.ingestionTasks[0].retryCount = 2;
    f.db.agentTasks[0].retryCount = 2; f.db.agentTasks[0].executionAttempt = 3;
    await expect(getHermesResearchRun(f.deps, f.read)).resolves.toMatchObject({
      canRetryGeneration: false, sourceParsing: { status: 'needs_review' } });
  });

  it('projects only available page diagnostics and does not grant recovery to readers', async () => {
    const f = fixture(); f.db.agentTasks[0].result.unresolvedPageNumbers = [23, 4];
    f.db.memberships[0].role = 'viewer';
    await expect(getHermesResearchRun(f.deps, f.read)).resolves.toMatchObject({ canRetryGeneration: false,
      sourceParsing: { unresolvedPageNumbers: [4, 23] } });
    expect(f.db.auditLogs).toHaveLength(0);
  });

  it('stops after another timeout and requires a fresh explicit request for the final bounded attempt', async () => {
    const f = fixture(); const original = structuredClone(f.db.agentTasks[0].result);
    await retryHermesGeneration(f.deps, f.input);
    Object.assign(f.db.agentTasks[0], { status: 'succeeded', executionAttempt: 2, result: original });
    f.db.ingestionTasks[0].state = 'needs_review';
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0].status).toBe('failed');
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    await retryHermesGeneration(f.deps, f.input);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    await retryHermesGeneration(f.deps, { ...f.input, expectedVersion: f.db.hermesResearchRuns[0].version, idempotencyKey: 'final-explicit-retry' });
    Object.assign(f.db.agentTasks[0], { status: 'succeeded', executionAttempt: 3, result: original });
    f.db.ingestionTasks[0].state = 'needs_review';
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0].status).toBe('failed');
    await expect(getHermesResearchRun(f.deps, f.read)).resolves.toMatchObject({ canRetryGeneration: false });
    expect(f.redis.lpush).toHaveBeenCalledTimes(2);
  });

  it('stops parser-incomplete reconciliation before marking understanding complete or creating science tasks', async () => {
    const f = fixture(); f.db.hermesResearchRuns[0].status = 'running'; f.db.hermesResearchSteps[0].status = 'waiting';
    await reconcileHermesResearchRuns(f.deps);
    expect(f.db.hermesResearchRuns[0]).toMatchObject({ status: 'failed', error: 'Source parsing is incomplete; explicit recovery is required' });
    expect(f.db.hermesResearchSteps[0].status).toBe('failed');
    expect(f.db.agentTasks).toHaveLength(1); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
});

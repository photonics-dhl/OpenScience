import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  confirmHermesSourceReview,
  createHermesResearchRun,
  getHermesResearchRun,
  HermesResearchRunError,
  reconcileHermesResearchRuns,
} from '../../src/agent/research-run';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { ONCHIP_SOURCE_CONTENT_HASH } from '../../src/assets/video';

type IdQuery = { where: { id: string } };
type MembershipQuery = { where: { workspaceId_userId: { workspaceId: string; userId: string } } };
type IngestionListQuery = { where: { id: { in: string[] } } };
type RunUniqueQuery = { where: { id?: string; idempotencyKey?: string } };
type RunListQuery = { where: { status: string | { in: string[] } }; take: number };
type RunCreateQuery = { data: Record<string, unknown> & { steps: { create: Array<Record<string, unknown>> } } };
type RunUpdateQuery = { where: { id: string; status: string; version: number }; data: Record<string, unknown> & { version?: { increment?: number } } };
type StepCountQuery = { where: { runId: string; agentTaskId?: { not: null } } };
type StepUpdateQuery = { where: { runId: string; id?: string }; data: Record<string, unknown> };
type AuditCreateQuery = { data: Record<string, unknown> };

function fixture(options: { role?: string; roStatus?: string; taskState?: string; transactionFailures?: string[] } = {}) {
  const now = new Date('2026-09-08T00:00:00.000Z');
  let sequence = 0;
  const db = {
    workspaces: [{ id: 'workspace', status: 'active' }],
    memberships: [{ workspaceId: 'workspace', userId: 'actor', role: options.role ?? 'author' }],
    researchObjects: [{ id: 'ro', workspaceId: 'workspace', status: options.roStatus ?? 'draft' }],
    ingestionBatches: [{ id: 'batch', researchObjectId: 'ro', userId: 'actor' }],
    ingestionTasks: [{ id: 'ingestion', batchId: 'batch', artifactId: 'artifact', agentTaskId: 'agent-task', state: options.taskState ?? 'parsing', error: null }],
    agentTasks: [{ id: 'agent-task', status: options.taskState === 'needs_review' ? 'succeeded' : 'running' }],
    runs: [] as Array<Record<string, unknown>>,
    steps: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
    transactionFailures: [...(options.transactionFailures ?? [])],
  };
  const withRun = (run: Record<string, unknown>) => ({
    ...run,
    steps: db.steps.filter((step) => step.runId === run.id).map((step) => {
      const ingestionTask = db.ingestionTasks.find((task) => task.id === step.ingestionTaskId) ?? null;
      return {
        ...step,
        ingestionTask: ingestionTask ? {
          ...ingestionTask,
          batch: db.ingestionBatches.find((batch) => batch.id === ingestionTask.batchId) ?? null,
          agentTask: db.agentTasks.find((agentTask) => agentTask.id === ingestionTask.agentTaskId) ?? null,
        } : null,
      };
    }),
  });
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const failure = db.transactionFailures.shift();
      if (failure) throw Object.assign(new Error(failure), { code: failure });
      return callback(prisma);
    },
    workspace: { findUnique: async ({ where }: IdQuery) => db.workspaces.find((row) => row.id === where.id) ?? null },
    membership: {
      findUnique: async ({ where }: MembershipQuery) => db.memberships.find((row) => row.workspaceId === where.workspaceId_userId.workspaceId && row.userId === where.workspaceId_userId.userId) ?? null,
    },
    researchObject: { findUnique: async ({ where }: IdQuery) => db.researchObjects.find((row) => row.id === where.id) ?? null },
    ingestionTask: {
      findMany: async ({ where }: IngestionListQuery) => db.ingestionTasks.filter((task) => where.id.in.includes(task.id)).map((task) => ({
        ...task,
        batch: db.ingestionBatches.find((batch) => batch.id === task.batchId),
        agentTask: db.agentTasks.find((agentTask) => agentTask.id === task.agentTaskId),
      })),
    },
    hermesResearchRun: {
      findUnique: async ({ where }: RunUniqueQuery) => {
        const run = db.runs.find((row) => where.id ? row.id === where.id : row.idempotencyKey === where.idempotencyKey);
        return run ? withRun(run) : null;
      },
      findMany: async ({ where, take }: RunListQuery) => db.runs.filter((run) => typeof where.status !== 'string'
        ? where.status.in.includes(String(run.status)) : run.status === where.status).slice(0, take).map(withRun),
      create: async ({ data }: RunCreateQuery) => {
        const row = { id: `run-${++sequence}`, status: 'running', version: 1, versionId: null, profile: null,
          maxAgentTasks: null, sourceClaimIds: [], sourceReviewDigest: null, error: null, lastReconciledAt: null,
          createdAt: now, updatedAt: now, ...data };
        db.runs.push(row);
        for (const step of data.steps.create) db.steps.push({ id: `step-${++sequence}`, status: 'waiting', createdAt: now, updatedAt: now, runId: row.id, ...step });
        return withRun(row);
      },
      updateMany: async ({ where, data }: RunUpdateQuery) => {
        const rows = db.runs.filter((run) => run.id === where.id && run.status === where.status && run.version === where.version);
        rows.forEach((run) => Object.assign(run, data, { version: Number(run.version) + (data.version?.increment ?? 0), updatedAt: now }));
        return { count: rows.length };
      },
    },
    hermesResearchStep: {
      count: async ({ where }: StepCountQuery) => db.steps.filter((step) => step.runId === where.runId && (where.agentTaskId === undefined || step.agentTaskId != null)).length,
      updateMany: async ({ where, data }: StepUpdateQuery) => {
        const rows = db.steps.filter((step) => step.runId === where.runId && (where.id === undefined || step.id === where.id));
        rows.forEach((step) => Object.assign(step, data, { updatedAt: now }));
        return { count: rows.length };
      },
    },
    auditLog: { create: async ({ data }: AuditCreateQuery) => void db.audits.push(data) },
  };
  return { deps: { prisma, now: () => now, audit: { record: async (event: Record<string, unknown>) => void db.audits.push(event) } } as never, db };
}

describe('Hermes durable research run', () => {
  it('atomically binds an authorized draft run to existing ingestion source tasks', async () => {
    const { deps, db } = fixture();
    const run = await createHermesResearchRun(deps, {
      actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'run-key',
    });

    expect(run).toMatchObject({ status: 'running', version: 1, researchObjectId: 'ro', actorId: 'actor' });
    expect(run.steps).toEqual([expect.objectContaining({ stage: 'source_ingestion', ordinal: 0, ingestionTaskId: 'ingestion', artifactId: 'artifact', agentTaskId: 'agent-task', status: 'waiting' })]);
    expect(db.audits).toHaveLength(1);
  });

  it('replays the exact request and rejects the same idempotency key with a different source binding', async () => {
    const { deps, db } = fixture();
    const input = { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'run-key' };
    const first = await createHermesResearchRun(deps, input);
    await expect(createHermesResearchRun(deps, input)).resolves.toEqual(first);
    await expect(createHermesResearchRun(deps, { ...input, ingestionTaskIds: ['other-ingestion'] })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    db.memberships.length = 0;
    await expect(createHermesResearchRun(deps, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('retries serializable creation conflicts without duplicating the run', async () => {
    const { deps, db } = fixture({ transactionFailures: ['P2034', 'P2034'] });
    await expect(createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' })).resolves.toMatchObject({ status: 'running' });
    expect(db.runs).toHaveLength(1);
  });

  it.each([
    [{ role: 'viewer' }, 'FORBIDDEN'],
    [{ roStatus: 'published' }, 'RESEARCH_OBJECT_NOT_DRAFT'],
  ])('rejects invalid write scope %#', async (options, code) => {
    const { deps } = fixture(options);
    await expect(createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' }))
      .rejects.toMatchObject({ code });
  });

  it('scopes reads to the actor and current workspace membership', async () => {
    const { deps, db } = fixture();
    const created = await createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' });
    await expect(getHermesResearchRun(deps, { actorId: 'other', researchObjectId: 'ro', runId: created.id })).rejects.toBeInstanceOf(HermesResearchRunError);
    db.memberships.length = 0;
    await expect(getHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', runId: created.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('advances completed extraction to source review without claiming Claims are ready', async () => {
    const { deps, db } = fixture({ taskState: 'needs_review' });
    const created = await createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' });
    expect(await reconcileHermesResearchRuns(deps, { limit: 10 })).toEqual({ inspected: 1, advanced: 1, failed: 0, stopped: 0, errors: 0 });
    const run = db.runs.find((row) => row.id === created.id);
    expect(run).toMatchObject({ status: 'awaiting_source_review', version: 2, error: null });
    expect(db.steps[0]).toMatchObject({ status: 'succeeded' });
    expect(db.audits).toHaveLength(2);
    expect((db as unknown as { claimNodes?: unknown[] }).claimNodes).toBeUndefined();
  });

  it('reopens a completed source step while its bound extraction retries, then observes its result', async () => {
    const success = fixture({ taskState: 'needs_review' });
    await createHermesResearchRun(success.deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'success' });
    await reconcileHermesResearchRuns(success.deps);
    success.db.ingestionTasks[0]!.state = 'queued';
    success.db.agentTasks[0]!.status = 'pending';
    expect(await reconcileHermesResearchRuns(success.deps)).toMatchObject({ advanced: 0, failed: 0 });
    expect(success.db.runs[0]).toMatchObject({ status: 'awaiting_source_review', version: 2 });
    expect(success.db.steps[0]).toMatchObject({ status: 'waiting', ingestionTaskId: 'ingestion', agentTaskId: 'agent-task' });
    success.db.ingestionTasks[0]!.state = 'needs_review';
    success.db.agentTasks[0]!.status = 'succeeded';
    expect(await reconcileHermesResearchRuns(success.deps)).toMatchObject({ advanced: 0, failed: 0 });
    expect(success.db.runs[0]).toMatchObject({ status: 'awaiting_source_review', version: 2 });
    expect(success.db.steps[0]).toMatchObject({ status: 'succeeded', ingestionTaskId: 'ingestion', agentTaskId: 'agent-task' });

    const failure = fixture({ taskState: 'needs_review' });
    await createHermesResearchRun(failure.deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'failure' });
    await reconcileHermesResearchRuns(failure.deps);
    failure.db.ingestionTasks[0]!.state = 'failed_retryable';
    failure.db.ingestionTasks[0]!.error = 'structured output exhausted';
    failure.db.agentTasks[0]!.status = 'failed';
    expect(await reconcileHermesResearchRuns(failure.deps)).toMatchObject({ failed: 1 });
    expect(failure.db.runs[0]).toMatchObject({ status: 'failed', error: 'structured output exhausted' });
    expect(failure.db.steps[0]).toMatchObject({
      status: 'failed', error: 'structured output exhausted', ingestionTaskId: 'ingestion', agentTaskId: 'agent-task',
    });
  });

  it('leaves pending extraction waiting without consuming or requeueing a task', async () => {
    const { deps, db } = fixture();
    await createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' });
    expect(await reconcileHermesResearchRuns(deps)).toEqual({ inspected: 1, advanced: 0, failed: 0, stopped: 0, errors: 0 });
    expect(db.runs[0]).toMatchObject({ status: 'running', version: 1, lastReconciledAt: new Date('2026-09-08T00:00:00.000Z') });
    expect(db.agentTasks[0]).toMatchObject({ status: 'running' });
  });

  it('stops on membership or source binding drift and fails on extraction failure', async () => {
    const membership = fixture();
    await createHermesResearchRun(membership.deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' });
    membership.db.memberships.length = 0;
    expect(await reconcileHermesResearchRuns(membership.deps)).toMatchObject({ stopped: 1 });
    expect(membership.db.runs[0]).toMatchObject({ status: 'stopped', error: 'authorization scope changed' });

    const source = fixture();
    await createHermesResearchRun(source.deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' });
    source.db.ingestionTasks[0]!.artifactId = 'changed-artifact';
    expect(await reconcileHermesResearchRuns(source.deps)).toMatchObject({ stopped: 1 });

    const failure = fixture();
    await createHermesResearchRun(failure.deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'key' });
    failure.db.ingestionTasks[0]!.state = 'failed_blocked';
    failure.db.ingestionTasks[0]!.error = 'malware blocked';
    expect(await reconcileHermesResearchRuns(failure.deps)).toMatchObject({ failed: 1 });
    expect(failure.db.runs[0]).toMatchObject({ status: 'failed', error: 'malware blocked' });
  });

  it('contains a poison candidate and continues reconciling the bounded batch', async () => {
    const { deps, db } = fixture({ taskState: 'needs_review' });
    await createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'first' });
    await createHermesResearchRun(deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion'], idempotencyKey: 'second' });
    db.transactionFailures.push('POISON');
    expect(await reconcileHermesResearchRuns(deps, { limit: 2 })).toEqual({ inspected: 2, advanced: 1, failed: 0, stopped: 0, errors: 1 });
    expect(db.runs.filter((run) => run.status === 'awaiting_source_review')).toHaveLength(1);
  });

  it('durably creates exactly one storyboard, five images, and one video without charging source steps', async () => {
    const ids = {
      user: '10000000-0000-4000-8000-000000000001', workspace: '20000000-0000-4000-8000-000000000001',
      ro: '30000000-0000-4000-8000-000000000001', version: '40000000-0000-4000-8000-000000000001',
      run: '50000000-0000-4000-8000-000000000001', claim: '60000000-0000-4000-8000-000000000001',
      ingestion: '70000000-0000-4000-8000-000000000001', artifact: '80000000-0000-4000-8000-000000000001',
      ingestionAgent: '90000000-0000-4000-8000-000000000001',
    };
    const { prisma, db } = createFakePrisma();
    seedUser(db, { id: ids.user });
    db.workspaces.push({ id: ids.workspace, status: 'active' });
    db.memberships.push({ id: 'membership', workspaceId: ids.workspace, userId: ids.user, role: 'author' });
    db.researchObjects.push({ id: ids.ro, workspaceId: ids.workspace, status: 'draft' });
    db.versions.push({ id: ids.version, researchObjectId: ids.ro, status: 'draft', versionNo: 1 });
    db.artifacts.push({ id: ids.artifact, workspaceId: ids.workspace, blobSha256: ONCHIP_SOURCE_CONTENT_HASH });
    db.ingestionBatches.push({ id: 'batch', researchObjectId: ids.ro, userId: ids.user });
    db.agentTasks.push({ id: ids.ingestionAgent, status: 'succeeded' });
    db.ingestionTasks.push({ id: ids.ingestion, batchId: 'batch', artifactId: ids.artifact,
      agentTaskId: ids.ingestionAgent, state: 'confirmed', error: null });
    db.claimNodes.push({ id: ids.claim, researchObjectId: ids.ro, versionId: ids.version, extractionStatus: 'succeeded',
      provenance: { source: 'reviewed_ingestion', sourceTaskId: ids.ingestion, sourceTaskLineage: ids.ingestion } });
    db.evidenceRecords.push({ id: 'evidence', claimId: ids.claim, researchObjectId: ids.ro, versionId: ids.version,
      artifactId: ids.artifact, contentHash: ONCHIP_SOURCE_CONTENT_HASH, extractionStatus: 'succeeded',
      provenance: { source: 'reviewed_ingestion', sourceTaskId: ids.ingestion } });
    db.hermesResearchRuns.push({ id: ids.run, actorId: ids.user, researchObjectId: ids.ro, versionId: ids.version,
      profile: 'onchip-field-sampling-v1', maxAgentTasks: 7, sourceClaimIds: [ids.claim], sourceReviewDigest: 'digest',
      status: 'awaiting_claim_review', version: 2, error: null, lastReconciledAt: null, createdAt: new Date(), updatedAt: new Date() });
    db.hermesResearchSteps.push({ id: 'source-step', runId: ids.run, stage: 'source_ingestion', ordinal: 0,
      status: 'succeeded', ingestionTaskId: ids.ingestion, artifactId: ids.artifact, agentTaskId: ids.ingestionAgent });
    const deps = { prisma, redis: { lpush: async () => 1 } } as never;
    const generationTasks = () => db.agentTasks.filter((task) => task.kind === 'presentation.generate');
    const finishStage = (stage: string, kind: string) => {
      const steps = db.hermesResearchSteps.filter((step) => step.stage === stage);
      for (const step of steps) {
        const task = db.agentTasks.find((candidate) => candidate.id === step.agentTaskId)!;
        task.status = 'succeeded';
        db.presentationAssets.push({ id: task.id, researchObjectId: ids.ro, versionId: ids.version,
          kind, status: 'draft', contentHash: `hash-${stage}-${step.ordinal}`, provenance: {}, createdAt: new Date(), updatedAt: new Date() });
        db.presentationAssetClaims.push({ presentationAssetId: task.id, claimId: ids.claim, researchObjectId: ids.ro, versionId: ids.version });
      }
    };

    await reconcileHermesResearchRuns(deps);
    expect(generationTasks()).toHaveLength(0);
    expect(db.hermesResearchRuns[0].error).toMatch(/Credit/);
    db.usageLedger.push({ id: 'grant', userId: ids.user, resource: 'ai_credit', delta: 20, kind: 'grant' });
    db.hermesResearchRuns[0].lastReconciledAt = null;
    await reconcileHermesResearchRuns(deps);
    expect(generationTasks()).toHaveLength(1);
    await reconcileHermesResearchRuns(deps);
    expect(generationTasks()).toHaveLength(1);
    finishStage('storyboard', 'interactive_html');
    await reconcileHermesResearchRuns(deps);
    db.presentationAssets.find((asset) => asset.id === generationTasks()[0].id)!.status = 'approved';
    await reconcileHermesResearchRuns(deps);
    expect(generationTasks()).toHaveLength(6);
    finishStage('scene_image', 'image');
    await reconcileHermesResearchRuns(deps);
    db.presentationAssets.filter((asset) => asset.kind === 'image').forEach((asset) => { asset.status = 'approved'; });
    await reconcileHermesResearchRuns(deps);
    expect(generationTasks()).toHaveLength(7);
    finishStage('video', 'video');
    await reconcileHermesResearchRuns(deps);
    db.presentationAssets.find((asset) => asset.kind === 'video')!.status = 'approved';
    await reconcileHermesResearchRuns(deps);
    expect(db.hermesResearchRuns[0]).toMatchObject({ status: 'succeeded', error: null });
    expect(db.usageLedger.filter((entry) => entry.kind === 'consume')).toHaveLength(7);
  });

  it('replays an exact source review after advancement without storage access or private SourceMap coordinates', async () => {
    const { prisma, db } = createFakePrisma();
    const user = '10000000-0000-4000-8000-000000000001';
    const workspace = '20000000-0000-4000-8000-000000000001';
    const ro = '30000000-0000-4000-8000-000000000001';
    const versionId = '40000000-0000-4000-8000-000000000001';
    const runId = '50000000-0000-4000-8000-000000000001';
    const ingestionTaskId = '60000000-0000-4000-8000-000000000001';
    const claimId = '70000000-0000-4000-8000-000000000001';
    seedUser(db, { id: user });
    db.workspaces.push({ id: workspace, status: 'active' });
    db.memberships.push({ id: 'membership', workspaceId: workspace, userId: user, role: 'author' });
    db.researchObjects.push({ id: ro, workspaceId: workspace, status: 'draft' });
    db.versions.push({ id: versionId, researchObjectId: ro, status: 'draft', versionNo: 1 });
    const reviews = [{ ingestionTaskId, snapshotToken: 'a'.repeat(64), selections: [{ clientKey: 'core',
      sourceField: 'results' as const, kind: 'core' as const, statement: 'Reviewed result', attachSourceQuote: true as const }] }];
    const generationGrant = { profile: 'onchip-field-sampling-v1' as const, maxAgentTasks: 7 as const };
    const idempotencyKey = 'source-review-key';
    const sourceReviewDigest = createHash('sha256').update(JSON.stringify({ actorId: user, researchObjectId: ro, runId,
      versionId, generationGrant, reviews })).digest('hex');
    db.hermesResearchRuns.push({ id: runId, actorId: user, researchObjectId: ro, versionId,
      profile: generationGrant.profile, maxAgentTasks: 7, sourceClaimIds: [claimId], sourceReviewDigest,
      status: 'generating_storyboard', version: 3, error: null, createdAt: new Date(), updatedAt: new Date() });
    db.hermesResearchSteps.push({ id: 'source-step', runId, stage: 'source_ingestion', ordinal: 0,
      status: 'succeeded', ingestionTaskId });
    db.claimNodes.push({ id: claimId, researchObjectId: ro, versionId, extractionStatus: 'succeeded', provenance: {} });
    db.evidenceRecords.push({ id: 'evidence', claimId, researchObjectId: ro, versionId, extractionStatus: 'succeeded',
      provenance: { source: 'reviewed_ingestion', sourceTaskId: ingestionTaskId, sourceMapRef: { objectKey: 'private/key' } } });
    const deps = { prisma, redis: { lpush: async () => 1 }, storage: { getObject: async () => { throw new Error('storage must not be read'); } } } as never;
    const result = await confirmHermesSourceReview(deps, { actorId: user, researchObjectId: ro, runId, versionId,
      expectedVersion: 2, idempotencyKey, generationGrant, reviews });
    expect(result.run.status).toBe('generating_storyboard');
    expect(result.evidence[0].provenance).not.toHaveProperty('sourceMapRef');
    db.memberships.length = 0;
    await expect(confirmHermesSourceReview(deps, { actorId: user, researchObjectId: ro, runId, versionId,
      expectedVersion: 2, idempotencyKey, generationGrant, reviews })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

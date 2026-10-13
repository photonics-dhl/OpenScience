import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { prepareAgentTaskForCrashRecovery, claimAgentTask, recoverUndispatchedAgentTasks } from '../../src/agent/agent';
import { VISUAL_NARRATIVE_PROFILE } from '../../src/assets/video';
import { describeIllustrationBrief, type IllustrationBrief } from '../../src/assets/illustration-brief';
import { presentationClaimContent, presentationEvidenceIdentity, readVisualNarrativeSource } from '../../src/assets/illustration-source';
import { parseStoryboardDocument } from '../../src/assets/storyboard';
import type { NativeAgentCheckpointReference } from '../../src/agent/native-agent-execution';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  confirmHermesSourceReview,
  createHermesResearchRun,
  getHermesResearchRun,
  HermesResearchRunError,
  reconcileHermesResearchRuns, recoverCompletedHermesSceneImageResults, retryHermesGeneration, type HermesResearchRunDeps,
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
    failure.db.ingestionTasks.push({ id: 'ingestion-2', batchId: 'batch', artifactId: 'artifact-2', agentTaskId: 'agent-task-2', state: 'needs_review', error: null });
    failure.db.agentTasks.push({ id: 'agent-task-2', status: 'succeeded' });
    await createHermesResearchRun(failure.deps, { actorId: 'actor', researchObjectId: 'ro', ingestionTaskIds: ['ingestion', 'ingestion-2'], idempotencyKey: 'failure' });
    await reconcileHermesResearchRuns(failure.deps);
    failure.db.ingestionTasks[0]!.state = 'failed_retryable';
    failure.db.ingestionTasks[0]!.error = 'structured output exhausted';
    failure.db.agentTasks[0]!.status = 'failed';
    failure.db.ingestionTasks[1]!.state = 'failed_blocked';
    failure.db.ingestionTasks[1]!.error = 'second source blocked';
    failure.db.agentTasks[1]!.status = 'failed';
    expect(await reconcileHermesResearchRuns(failure.deps)).toMatchObject({ failed: 1 });
    expect(failure.db.runs[0]).toMatchObject({ status: 'failed', error: 'structured output exhausted' });
    expect(failure.db.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'failed', error: 'structured output exhausted', ingestionTaskId: 'ingestion', agentTaskId: 'agent-task' }),
      expect.objectContaining({ status: 'failed', error: 'second source blocked', ingestionTaskId: 'ingestion-2', agentTaskId: 'agent-task-2' }),
    ]));
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

// Reuse the existing native-video source fixture shape with image-only output and the shared rollback-capable Prisma fake.
const paidUuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`;
const paidIds = { actor: paidUuid(1), ro: paidUuid(2), version: paidUuid(3), run: paidUuid(4), claim: paidUuid(5), artifact: paidUuid(6),
  ingestion: paidUuid(7), sourceTask: paidUuid(8), workspace: paidUuid(9), manifest: paidUuid(10), session: paidUuid(11), evidence: paidUuid(12) };
const paidTime = new Date('2026-10-08T00:00:00Z');
const paidSettings = { locale: 'zh' as const, style: 'scientific', instruction: 'Explain the supported transfer.' };
function paidResultFixture(output: 'video' | null = null) {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: paidIds.actor });
  db.workspaces.push({ id: paidIds.workspace, status: 'active' });
  db.memberships.push({ workspaceId: paidIds.workspace, userId: paidIds.actor, role: 'author' });
  db.researchObjects.push({ id: paidIds.ro, workspaceId: paidIds.workspace, status: 'draft', visibility: 'private', deletedAt: null });
  db.commits.push({ id: paidUuid(13), branchId: paidUuid(14) });
  db.versions.push({ id: paidIds.version, researchObjectId: paidIds.ro, status: 'draft', versionNo: 1, commitId: paidUuid(13), publicVersionId: null });
  db.versionManifests.push({ id: paidIds.manifest, versionId: paidIds.version, coreJson: {}, createdAt: paidTime });
  db.manifestEntries.push({ manifestId: paidIds.manifest, artifactId: paidIds.artifact, blobSha256: 'a'.repeat(64) });
  db.artifacts.push({ id: paidIds.artifact, workspaceId: paidIds.workspace, mimeType: 'application/pdf', blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null });
  db.ingestionBatches.push({ id: 'source-batch', researchObjectId: paidIds.ro, userId: paidIds.actor });
  db.agentSessions.push({ id: paidIds.session, userId: paidIds.actor, researchObjectId: paidIds.ro, kind: 'ingestion', status: 'active', deletedAt: null });
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: paidIds.artifact, contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  db.agentTasks.push({ id: paidIds.sourceTask, sessionId: paidIds.session, kind: 'sdf.extract', status: 'succeeded', deletedAt: null, updatedAt: paidTime,
    result: { sourceMapRef, scientificReview: { status: 'review_received', contractVersion: 4, responseHash: 'c'.repeat(64) },
      core: { problem: 'Problem', insight: 'Insight', method: 'Method', results: 'Results', limitations: 'Limitations', reproducibility: 'Reproducibility' } } });
  db.ingestionTasks.push({ id: paidIds.ingestion, batchId: 'source-batch', artifactId: paidIds.artifact, agentTaskId: paidIds.sourceTask, state: 'confirmed', error: null });
  db.claimNodes.push({ id: paidIds.claim, researchObjectId: paidIds.ro, versionId: paidIds.version, parentClaimId: null, kind: 'finding',
    statement: 'The source transfers energy to the receiver.', assessment: 'supported', conditions: [], limitations: [], extractionStatus: 'succeeded', updatedAt: paidTime,
    provenance: { source: 'reviewed_ingestion', sourceTaskId: paidIds.ingestion } });
  db.evidenceRecords.push({ id: paidIds.evidence, claimId: paidIds.claim, researchObjectId: paidIds.ro, versionId: paidIds.version,
    artifactId: paidIds.artifact, contentHash: 'a'.repeat(64), exactQuote: 'The source transfers energy to the receiver.', relation: 'supports', locator: { page: 1 },
    extractionStatus: 'succeeded', updatedAt: paidTime, provenance: { source: 'reviewed_ingestion', sourceTaskId: paidIds.ingestion } });
  db.usageLedger.push({ id: 'existing-credit', userId: paidIds.actor, resource: 'ai_credit', delta: 100, kind: 'grant' });
  db.hermesResearchRuns.push({ id: paidIds.run, actorId: paidIds.actor, researchObjectId: paidIds.ro, versionId: paidIds.version,
    profile: VISUAL_NARRATIVE_PROFILE, maxAgentTasks: 9, generationSettings: { ...paidSettings, ...(output === null ? {} : { output }) },
    sourceClaimIds: [paidIds.claim], sourceReviewDigest: 'existing-reviewed-source', status: 'awaiting_claim_review', version: 1,
    error: null, lastReconciledAt: null, createdAt: paidTime, updatedAt: paidTime });
  const step = (stage: string, extra: Record<string, unknown> = {}) => ({ id: `run-${stage}`, runId: paidIds.run, stage, ordinal: 0,
    status: 'succeeded', ingestionTaskId: null, artifactId: null, agentTaskId: null, presentationAssetId: null, error: null, ...extra });
  db.hermesResearchSteps.push(step('source_ingestion', { ingestionTaskId: paidIds.ingestion, artifactId: paidIds.artifact, agentTaskId: paidIds.sourceTask }),
    step('source_composition'), step('source_review'));

  // Supply the missing database operations locally, retaining the shared fake's transaction rollback and real task billing.
  Object.assign(prisma.hermesResearchRun, {
    findFirst: async ({ where, include }: { where: { actorId: string; researchObjectId: string; profile: string;
      generationSettings?: { path: string[]; equals: string }; steps: { some: { ingestionTaskId: string } } }; include?: Prisma.HermesResearchRunInclude }) => {
      const row = db.hermesResearchRuns.find(run => run.actorId === where.actorId && run.researchObjectId === where.researchObjectId && run.profile === where.profile
        && (!where.generationSettings || run.generationSettings.output === where.generationSettings.equals)
        && db.hermesResearchSteps.some(item => item.runId === run.id && item.stage === 'source_ingestion' && item.ingestionTaskId === where.steps.some.ingestionTaskId));
      return row ? prisma.hermesResearchRun.findUnique({ where: { id: row.id }, include }) : null;
    },
    findUniqueOrThrow: async (args: Parameters<typeof prisma.hermesResearchRun.findUnique>[0]) => {
      const row = await prisma.hermesResearchRun.findUnique(args);
      if (!row) throw new Error('Run missing');
      return row;
    },
  });
  Object.assign(prisma.agentTask, { count: async ({ where }: { where: { kind: string; payload: { path: string[]; equals: string } } }) =>
    db.agentTasks.filter(task => task.kind === where.kind && task.payload?.hermesRunAuthority?.runId === where.payload.equals).length });
  Object.assign(prisma.auditLog, { findMany: async ({ where }: { where: { action?: string; actorId?: string; targetId?: string; targetType?: string } }) =>
    db.auditLogs.filter(row => Object.entries(where).filter(([key]) => ['action', 'actorId', 'targetId', 'targetType'].includes(key))
      .every(([key, value]) => row[key] === value)) });
  const errors: unknown[] = [];
  const transaction = prisma.$transaction.bind(prisma) as (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
  Object.assign(prisma, { $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    try { return await transaction(callback); } catch (error) { errors.push(error); throw error; }
  } });
  const deps: HermesResearchRunDeps = { prisma, nativeSceneImageEnabled: true,
    nativeAgentRuntime: { runtimeId: 'installed-hermes', skillCatalogueId: 'science-skills', model: 'MiniMax-M3' },
    redis: { lpush: vi.fn(async () => 1) } as unknown as HermesResearchRunDeps['redis'], now: () => paidTime };
  return { prisma, db, deps, sourceMapRef, step, errors,
    run: () => db.hermesResearchRuns[0]!,
    generated: () => db.agentTasks.filter(task => task.kind === 'presentation.generate'),
    debits: () => db.usageLedger.filter(row => row.kind === 'consume') };
}

async function failedPaidScenes(sceneCount = 1) {
  const f = paidResultFixture();
  await reconcileHermesResearchRuns(f.deps);
  const parent = f.generated().find(item => item.payload.kind === 'interactive_html')!;
  const illustration: IllustrationBrief = { schemaVersion: 2, message: 'The source transfers energy to the receiver.', domain: 'real-space',
    encoding: 'The supported transfer runs left to right.', subjects: [{ description: 'A source left of a receiver',
      basis: { claimId: paidIds.claim, evidenceId: paidIds.evidence, quote: 'The source transfers energy to the receiver.' } }],
    composition: 'Both objects remain visible.', treatment: 'Scientific linework.', labels: ['Source', 'Receiver'], constraints: ['No invented apparatus.'] };
  const document = parseStoryboardDocument({ schemaVersion: 1, title: 'Energy transfer',
    narrative: { mainMessage: 'Explain the supported transfer.', audience: 'Researchers' },
    scenes: Array.from({ length: sceneCount }, () => ({ title: 'Transfer', narration: 'The source transfers energy to the receiver.',
      visualAction: describeIllustrationBrief(illustration), illustration: structuredClone(illustration), durationSeconds: 10, sourceClaimIds: [paidIds.claim] })) },
  [paidIds.claim], 'image');
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const source = await readVisualNarrativeSource(f.prisma, { userId: paidIds.actor, workspaceId: paidIds.workspace,
    researchObjectId: paidIds.ro, versionId: paidIds.version, sourceClaimIds: [paidIds.claim] });
  const sourceEvidenceIdentity = presentationEvidenceIdentity(f.db.evidenceRecords);
  const context = { payload: structuredClone(parent.payload), sourceEvidenceIdentity, claimContent: presentationClaimContent(f.db.claimNodes),
    baseIdentity: null, narrativeSourceIdentity: source.identity };
  const checkpoint: NativeAgentCheckpointReference = { taskId: parent.id, objectKey: `derived/native-agent/${'d'.repeat(64)}.json`, serializedSha256: 'd'.repeat(64),
    size: 100, artifactId: paidIds.artifact, documentSha256: f.sourceMapRef.contentHash, sourceMapHash: f.sourceMapRef.serializedSha256,
    executionAttempt: 1, turnCount: 4, state: 'completed', target: { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'e'.repeat(64) },
    responseHash: 'f'.repeat(64), finishReason: 'stop', hasToolCalls: false };
  const review = { stage: 'final-brief', decision: 'accepted', requestId: parent.id, candidateHash: hash(document), sourceEvidenceIdentity,
    summary: 'Supported by the saved paper.', ...checkpoint.target, responseHash: checkpoint.responseHash };
  Object.assign(parent, { status: 'succeeded', executionAttempt: 1, error: null, result: { ...parent.result,
    sourceMapRef: structuredClone(f.sourceMapRef), assetId: parent.id, contentHash: hash(document), nativeIllustrationContext: context,
    storyboardCheckpoint: { ...context, executionAttempt: 1, planned: { document, promptHash: review.promptHash, reviewFormat: 2 } },
    storyboardReview: review, illustrationPrompts: document.scenes.map((_, sceneIndex) => ({ sceneIndex, prompt: `Verified frame ${sceneIndex}` })) } });
  parent.result.nativeAgentExecution.checkpoint = checkpoint;
  f.db.presentationAssets.push({ id: parent.id, researchObjectId: paidIds.ro, versionId: paidIds.version, kind: 'interactive_html', status: 'draft', deletedAt: null,
    contentHash: parent.result.contentHash, createdAt: paidTime, updatedAt: paidTime,
    provenance: { source: 'verified_claims', subtype: 'sourced_storyboard', taskId: parent.id, sourceEvidenceIdentity,
      storyboardSettings: structuredClone(parent.payload.storyboard), storyboardDocument: document, illustrationReview: review } });
  f.db.presentationAssetClaims.push({ presentationAssetId: parent.id, claimId: paidIds.claim });
  await reconcileHermesResearchRuns(f.deps);
  await reconcileHermesResearchRuns(f.deps);
  const images = f.generated().filter(item => item.payload.kind === 'image');
  expect(images).toHaveLength(sceneCount);
  expect(f.errors.map(String)).toEqual([]);
  for (const image of images) Object.assign(image, { status: 'failed', executionAttempt: 1, retryCount: 0, error: 'image generation failed' });
  for (const step of f.db.hermesResearchSteps.filter(item => item.stage === 'scene_image')) Object.assign(step, { status: 'failed', error: 'image generation failed' });
  Object.assign(f.run(), { status: 'failed', error: 'image generation failed' });
  // The shared fake supplies rollback/serialization; extend only ORM fields needed for the real cursor and JSON CAS contract.
  const runFind = f.prisma.hermesResearchRun.findMany.bind(f.prisma.hermesResearchRun);
  vi.spyOn(f.prisma.hermesResearchRun, 'findMany').mockImplementation(async args => {
    const rows = await runFind(args);
    const after = (args?.where?.id as { gt?: string } | undefined)?.gt;
    return rows.filter(row => !after || row.id > after).sort((a, b) => a.id.localeCompare(b.id));
  });
  const updateTask = f.prisma.agentTask.updateMany.bind(f.prisma.agentTask);
  vi.spyOn(f.prisma.agentTask, 'updateMany').mockImplementation(async args => {
    const task = f.db.agentTasks.find(row => row.id === args.where?.id);
    const payload = args.where?.payload as { equals?: unknown } | undefined;
    const result = args.where?.result as { equals?: unknown } | undefined;
    if (payload && !isDeepStrictEqual(task?.payload, payload.equals)
      || result && !isDeepStrictEqual(task?.result ?? Prisma.DbNull, result.equals)) return { count: 0 };
    return updateTask(args);
  });
  const baseline = structuredClone({ tasks: f.db.agentTasks, ledger: f.db.usageLedger, assets: f.db.presentationAssets });
  return { ...f, parent, images, baseline };
}

describe('completed paid Native scene result recovery', () => {
  it('waits for a completed local result then restores the original task, step and run without a new reservation', async () => {
    const f = await failedPaidScenes();
    let completed = false;
    f.deps.inspectImageRecoveryState = vi.fn(async () => completed ? 'completed' : 'uncertain');
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(0);
    expect(f.images[0].status).toBe('failed');
    completed = true;
    const original = structuredClone(f.images[0]);
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(1);
    expect(f.images[0]).toMatchObject({ id: original.id, status: 'pending', executionAttempt: 1, retryCount: 1, dispatchedAt: null, result: original.result, payload: original.payload });
    expect(f.run().status).toBe('generating_scene_images');
    expect(f.db.hermesResearchSteps.find(step => step.agentTaskId === original.id)).toMatchObject({ status: 'running', presentationAssetId: null });
    expect(f.db.agentTasks.map(task => task.id)).toEqual(f.baseline.tasks.map(task => task.id));
    expect(f.db.usageLedger).toEqual(f.baseline.ledger);
    expect(f.db.presentationAssets).toEqual(f.baseline.assets);
    expect(f.deps.redis!.lpush).not.toHaveBeenCalled(); // existing outbox owns dispatch after commit
  });

  it('recovers the exact startup-reclaimed attempt2 refusal, but not unrelated attempt2 failures', async () => {
    const f = await failedPaidScenes();
    Object.assign(f.images[0], { status: 'running' });
    expect(await prepareAgentTaskForCrashRecovery(f.deps, f.images[0].id)).toBe(true);
    const claimed = await claimAgentTask(f.deps, f.images[0].id);
    expect(claimed).toMatchObject({ executionAttempt: 2 });
    Object.assign(f.images[0], { status: 'failed', error: '[blocked] Previous paid image attempt has no saved result; explicit new generation is required' });
    f.deps.inspectImageRecoveryState = async () => 'uncertain';
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(0);
    f.deps.inspectImageRecoveryState = async () => 'completed';
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(1);
    expect(f.images[0]).toMatchObject({ executionAttempt: 2, status: 'pending', retryCount: 1 });
    expect(f.db.usageLedger).toEqual(f.baseline.ledger);
    const unrelated = await failedPaidScenes();
    Object.assign(unrelated.images[0], { executionAttempt: 2, error: '[blocked] source binding changed' });
    unrelated.deps.inspectImageRecoveryState = async () => 'completed';
    expect((await recoverCompletedHermesSceneImageResults(unrelated.deps)).resumed).toBe(0);
  });

  it('leaves an unknown sibling untouched while admitting the completed original image', async () => {
    const f = await failedPaidScenes(2);
    const sibling = structuredClone(f.images[0]);
    f.deps.inspectImageRecoveryState = async id => id === sibling.id ? 'uncertain' : 'completed';
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(1);
    expect(f.images[0]).toEqual(sibling);
    expect(f.images[1].status).toBe('pending');
    expect(f.db.usageLedger).toEqual(f.baseline.ledger);
    await reconcileHermesResearchRuns(f.deps);
    expect(f.run().status).toBe('generating_scene_images');
  });

  it.each(['uncertain', 'submitted_without_result', 'before_submission', 'not_submitted', 'failed', 'unsafe'] as const)(
    'never rearms %s local proof or makes a new image task', async state => {
      const f = await failedPaidScenes();
      f.deps.inspectImageRecoveryState = async () => state;
      expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(0);
      expect(f.db.agentTasks).toEqual(f.baseline.tasks);
      expect(f.db.usageLedger).toEqual(f.baseline.ledger);
    });

  it.each(['membership', 'published', 'stopped', 'session', 'deleted', 'parent', 'source', 'reservation', 'review-started', 'review-rejected'])(
    'refuses changed %s authority even if the saved local result is complete', async reason => {
      const f = await failedPaidScenes();
      if (reason === 'membership') f.db.memberships[0].role = 'reader';
      if (reason === 'published') f.db.versions[0].status = 'published';
      if (reason === 'stopped') f.run().status = 'stopped';
      if (reason === 'session') f.db.agentSessions.find(session => session.id === f.images[0].sessionId)!.status = 'closed';
      if (reason === 'deleted') f.images[0].deletedAt = paidTime;
      if (reason === 'parent') f.parent.result.storyboardReview.model = 'different-model';
      if (reason === 'source') f.db.claimNodes[0].statement = 'Changed source';
      if (reason === 'reservation') f.db.usageLedger.splice(0, f.db.usageLedger.length);
      if (reason === 'review-started' || reason === 'review-rejected') f.images[0].result = { nativeImageReview: { mode: 'model-native', state: 'started' } };
      if (reason === 'review-rejected') f.images[0].error = '[blocked] scientific review rejected this image';
      const before = structuredClone(f.db.agentTasks);
      f.deps.inspectImageRecoveryState = async () => 'completed';
      expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(0);
      expect(f.db.agentTasks).toEqual(before);
    });

  it('rolls back task/run changes when the managed scene step CAS loses', async () => {
    const f = await failedPaidScenes();
    f.deps.inspectImageRecoveryState = async () => 'completed';
    vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockResolvedValueOnce({ count: 0 });
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(0);
    expect(f.db.agentTasks).toEqual(f.baseline.tasks);
    expect(f.run().status).toBe('failed');
    expect(f.db.usageLedger).toEqual(f.baseline.ledger);
  });

  it('serializes a manual/tick race and keeps pending delivery durable when dispatch fails after commit', async () => {
    const f = await failedPaidScenes();
    f.deps.inspectImageRecoveryState = async () => 'completed';
    const tasksBefore = f.db.agentTasks.length;
    await Promise.allSettled([recoverCompletedHermesSceneImageResults(f.deps), retryHermesGeneration(f.deps, {
      actorId: paidIds.actor, researchObjectId: paidIds.ro, runId: paidIds.run, expectedVersion: f.run().version, idempotencyKey: 'manual-race',
    })]);
    expect(f.db.agentTasks).toHaveLength(tasksBefore);
    expect(f.db.usageLedger).toEqual(f.baseline.ledger);
    const image = f.db.agentTasks.find(task => task.id === f.images[0].id)!;
    expect(image).toMatchObject({ status: 'pending', retryCount: 1 });
    image.dispatchedAt = null;
    vi.mocked(f.deps.redis!.lpush).mockRejectedValueOnce(new Error('dispatch interrupted'));
    await recoverUndispatchedAgentTasks(f.deps).catch(() => undefined);
    expect(image.dispatchedAt).toBeNull();
    expect(await recoverUndispatchedAgentTasks(f.deps)).toBeGreaterThan(0);
    expect(image.dispatchedAt).not.toBeNull();
    expect((await recoverCompletedHermesSceneImageResults(f.deps)).resumed).toBe(0);
  });
});

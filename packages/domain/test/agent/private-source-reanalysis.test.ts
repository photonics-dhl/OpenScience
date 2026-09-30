import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { ensureHermesIngestionReview, reanalyzeConfirmedIngestion } from '../../src/ingestion/ingestion-service';
import { getHermesResearchRun, reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { resolveHermesPrivateSourceReanalysisExecution } from '../../src/ingestion/source-review-recovery';
import { advancePrivateSourceReanalysisToReview, privateSourceReanalysisFixture } from './private-source-reanalysis-fixture';

describe('new paid private source analysis', () => {
  it('starts fresh composition from the current full SourceMap without altering exhausted history', async () => {
    const f = await privateSourceReanalysisFixture();
    const old = structuredClone(f.db);
    const result = await reanalyzeConfirmedIngestion(f.deps, f.input);
    expect(result).toMatchObject({ state: 'queued', artifactId: f.ids.artifact });
    expect(result.id).not.toBe(f.ids.source);
    expect(f.db.hermesResearchRuns).toEqual(old.hermesResearchRuns);
    expect(f.db.hermesResearchSteps).toEqual(old.hermesResearchSteps);
    expect(f.db.ingestionTasks[0]).toEqual(old.ingestionTasks[0]);
    expect(f.db.agentTasks.slice(0, old.agentTasks.length)).toEqual(old.agentTasks);
    expect(f.db.usageLedger.slice(0, old.usageLedger.length)).toEqual(old.usageLedger);
    expect(f.db.agentTasks.at(-1)).toMatchObject({ result: null, kind: 'sdf.extract',
      payload: { artifactId: f.ids.artifact, researchObjectId: f.ids.ro } });
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(old.usageLedger.filter(row => row.kind === 'consume').length + 1);
    expect(f.verifier).not.toHaveBeenCalled();
  });

  it.each(['same', 'different'])('replays %s client keys with one fresh task, session, dispatch and debit, even on the last credit', async keyMode => {
    const f = await privateSourceReanalysisFixture();
    const before = { tasks: f.db.agentTasks.length, sessions: f.db.agentSessions.length, batches: f.db.ingestionBatches.length,
      ledger: f.db.usageLedger.length, dispatches: f.redis.lpush.mock.calls.length };
    f.db.usageLedger[0].delta = f.db.usageLedger.filter(row => row.kind === 'consume').length + 1;
    const results = await Promise.all([reanalyzeConfirmedIngestion(f.deps, f.input), reanalyzeConfirmedIngestion(f.deps, {
      ...f.input, idempotencyKey: keyMode === 'same' ? f.input.idempotencyKey : 'different-client-key' })]);
    expect(results[0].id).toBe(results[1].id);
    expect(f.db.agentTasks).toHaveLength(before.tasks + 1); expect(f.db.agentSessions).toHaveLength(before.sessions + 1);
    expect(f.db.ingestionBatches).toHaveLength(before.batches + 1); expect(f.db.usageLedger).toHaveLength(before.ledger + 1);
    expect(f.redis.lpush).toHaveBeenCalledTimes(before.dispatches + 1);
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'last-credit-replay' })).toEqual(results[0]);
    expect(f.db.usageLedger).toHaveLength(before.ledger + 1);
    const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.reanalyze')!;
    expect(receipt.metadata).toMatchObject({ intent: 'new_paid_private_analysis', sourceRunId: f.ids.run, expectedRunVersion: 22,
      creditPolicy: 'fresh_task_charge', sourceIngestionTaskId: f.ids.source, sourceAgentTaskId: f.current.id,
      sourceMapSha256: f.reference.serializedSha256 });
  });

  it('accepts typed private intent property order as the same paid request', async () => {
    const f = await privateSourceReanalysisFixture();
    const first = await reanalyzeConfirmedIngestion(f.deps, f.input);
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'reordered', sourceReanalysis: {
      expectedRunVersion: 22, sourceRunId: f.ids.run, intent: 'new_paid_private_analysis',
    } })).toEqual(first);
  });

  it('uses canonical persisted UUID case for the fixed batch, digest and receipt across client keys', async () => {
    const f = await privateSourceReanalysisFixture(); const before = f.db.usageLedger.length;
    const first = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const uppercase = f.ids.run.toUpperCase(); expect(uppercase).not.toBe(f.ids.run);
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'uppercase-client', sourceReanalysis: {
      intent: 'new_paid_private_analysis', sourceRunId: uppercase, expectedRunVersion: 22,
    } })).toEqual(first);
    expect(f.db.ingestionBatches.at(-1)!.idempotencyKey).toBe('ingestion-private-source-reanalysis:3aaa6e8c-8168-4a12-9ccb-03e6c7b70c5c:22');
    expect(f.db.auditLogs.find(row => row.action === 'ingestion.task.reanalyze')!.metadata.sourceRunId).toBe(f.ids.run);
    expect(f.db.usageLedger).toHaveLength(before + 1);
  });

  it('recovers a lost first-tab response after the existing fresh run advances to independent review', async () => {
    const f = await privateSourceReanalysisFixture(); const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const { original, successor } = await advancePrivateSourceReanalysisToReview(f, created.id);
    expect(successor.id).not.toBe(original.id);
    expect(f.db.ingestionTasks.at(-1)!.agentTaskId).toBe(successor.id);
    const before = structuredClone(f.db.usageLedger); const tasks = f.db.agentTasks.length;
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-first-tab' }))
      .toMatchObject({ id: created.id, agentTaskId: successor.id });
    expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: f.ids.run }))
      .sourceReanalysis?.existingIngestionTaskId).toBe(created.id);
    expect(f.db.usageLedger).toEqual(before); expect(f.db.agentTasks).toHaveLength(tasks);
  });

  it('recovers the same paid operation while its normal run is composing, including a blocked completed draft', async () => {
    const f = await privateSourceReanalysisFixture(); const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const { run, original, successor } = await advancePrivateSourceReanalysisToReview(f, created.id, 'source_composition');
    const steps = f.db.hermesResearchSteps.filter(step => step.runId === run.id);
    expect(steps.filter(step => step.stage === 'source_composition')).toHaveLength(1);
    expect(steps.filter(step => step.stage === 'source_review')).toHaveLength(0);
    expect(successor.id).not.toBe(original.id);
    const before = structuredClone(f.db.usageLedger); const taskCount = f.db.agentTasks.length;
    for (const completed of [false, true]) {
      if (completed) {
        const blocked = structuredClone(f.anchorResult);
        Object.assign(blocked.scientificReview, { kind: 'model_self_check', contractVersion: '4', status: 'blocked_scientific_review' });
        blocked.reason = 'canonical_partial_validation_exhausted';
        Object.assign(successor, { status: 'succeeded', executionAttempt: 1, result: blocked });
        f.db.ingestionTasks.find(row => row.id === created.id)!.state = 'needs_review';
        for (let tick = 0; tick < 2; tick++) {
          f.db.hermesResearchRuns.find(row => row.id === run.id)!.lastReconciledAt = null;
          await reconcileHermesResearchRuns(f.deps);
        }
        expect(f.db.hermesResearchRuns.find(row => row.id === run.id)!.status).toBe('failed');
      }
      expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: `lost-composition-${completed}` }))
        .toMatchObject({ id: created.id, agentTaskId: successor.id });
      expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: f.ids.run }))
        .sourceReanalysis?.existingIngestionTaskId).toBe(created.id);
    }
    expect(f.db.usageLedger).toEqual(before); expect(f.db.agentTasks).toHaveLength(taskCount);
  });

  it.each(['receipt-policy', 'receipt-stage', 'receipt-parent', 'receipt-run', 'receipt-actor', 'receipt-map', 'duplicate-receipt',
    'task-key', 'session', 'debit', 'phase-ordinal', 'extra-phase'])(
    'rejects a changed %s composition replay without creating another paid operation', async change => {
      const f = await privateSourceReanalysisFixture(); const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
      const { run, successor } = await advancePrivateSourceReanalysisToReview(f, created.id, 'source_composition');
      const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh'
        && row.metadata.newAgentTaskId === successor.id)!;
      const phase = f.db.hermesResearchSteps.find(step => step.runId === run.id && step.stage === 'source_composition')!;
      if (change === 'receipt-policy') receipt.metadata.policy = 'scientific_review_v4_independent';
      if (change === 'receipt-stage') receipt.metadata.stage = 'source_review';
      if (change === 'receipt-parent') receipt.metadata.oldAgentTaskId = f.current.id;
      if (change === 'receipt-run') receipt.metadata.runId = f.ids.run;
      if (change === 'receipt-actor') receipt.metadata.authorizedByUserId = 'other';
      if (change === 'receipt-map') receipt.metadata.sourceMapSha256 = 'b'.repeat(64);
      if (change === 'duplicate-receipt') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'duplicate-composition-receipt' });
      if (change === 'task-key') successor.idempotencyKey += ':other';
      if (change === 'session') f.db.agentSessions.find(row => row.id === successor.sessionId)!.userId = 'other';
      if (change === 'debit') f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${successor.id}`)!.userId = 'other';
      if (change === 'phase-ordinal') phase.ordinal = 1;
      if (change === 'extra-phase') f.db.hermesResearchSteps.push({ ...structuredClone(phase), id: 'extra-unbound-composition', ordinal: 1 });
      const before = structuredClone(f.db.usageLedger); const taskCount = f.db.agentTasks.length;
      await expect(reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'changed-composition-replay' }))
        .rejects.toThrow('replay binding changed');
      expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: f.ids.run }))
        .sourceReanalysis?.existingIngestionTaskId).toBeUndefined();
      expect(f.db.usageLedger).toEqual(before); expect(f.db.agentTasks).toHaveLength(taskCount);
    });

  it('keeps the paid replay handle after the legitimate review run advances beyond source review', async () => {
    const f = await privateSourceReanalysisFixture(); const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const { run, original, successor } = await advancePrivateSourceReanalysisToReview(f, created.id);
    Object.assign(successor, { status: 'succeeded', executionAttempt: 1, result: { ...structuredClone(original.result),
      scientificReview: { ...structuredClone(original.result.scientificReview), kind: 'model_self_check', contractVersion: '5',
        sourceAgentTaskId: original.id, provider: 'primary', model: 'MiniMax-M3' } } });
    f.db.ingestionTasks.at(-1)!.state = 'confirmed';
    const progressed = f.db.hermesResearchRuns.find(row => row.id === run.id)!;
    Object.assign(progressed, { status: 'awaiting_claim_review', versionId: 'saved-new-version', sourceReviewDigest: 'd'.repeat(64),
      sourceClaimIds: ['saved-new-claim'] });
    const before = structuredClone(f.db);
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'first-tab-after-save' }))
      .toMatchObject({ id: created.id, agentTaskId: successor.id });
    expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: f.ids.run }))
      .sourceReanalysis?.existingIngestionTaskId).toBe(created.id);
    expect(f.db).toEqual(before);
  });

  it('never grants the progressed review task the private fresh-composition lease', async () => {
    const f = await privateSourceReanalysisFixture(); const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const { successor } = await advancePrivateSourceReanalysisToReview(f, created.id);
    successor.status = 'running'; successor.executionAttempt = 1;
    await expect(resolveHermesPrivateSourceReanalysisExecution(f.prisma, { ownerTaskId: successor.id,
      ingestionTaskId: created.id, sourceAgentTaskId: f.current.id, executionAttempt: 1 })).rejects.toThrow('[blocked]');
  });

  it.each(['arbitrary-pointer', 'original-failed', 'original-map', 'missing-receipt', 'duplicate-receipt', 'receipt-actor',
    'receipt-run', 'receipt-source', 'receipt-map', 'successor-session', 'successor-payload', 'successor-key', 'successor-debit',
    'run-actor', 'run-scope', 'run-cap', 'review-artifact', 'review-binding', 'extra-composition'])(
    'denies a changed %s paid replay successor without granting a handle or charging again', async change => {
      const f = await privateSourceReanalysisFixture(); const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
      const { run, original, successor } = await advancePrivateSourceReanalysisToReview(f, created.id);
      const source = f.db.ingestionTasks.find(row => row.id === created.id)!;
      const persistedRun = f.db.hermesResearchRuns.find(row => row.id === run.id)!;
      const session = f.db.agentSessions.find(row => row.id === successor.sessionId)!;
      const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh' && row.targetId === source.id)!;
      const review = f.db.hermesResearchSteps.find(row => row.runId === run.id && row.stage === 'source_review')!;
      if (change === 'arbitrary-pointer') source.agentTaskId = f.current.id;
      if (change === 'original-failed') original.status = 'failed';
      if (change === 'original-map') original.result.sourceMapRef.serializedSha256 = 'f'.repeat(64);
      if (change === 'missing-receipt') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
      if (change === 'duplicate-receipt') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'duplicate-successor-receipt' });
      if (change === 'receipt-actor') receipt.metadata.authorizedByUserId = 'other';
      if (change === 'receipt-run') receipt.metadata.runId = f.ids.run;
      if (change === 'receipt-source') receipt.metadata.oldAgentTaskId = f.current.id;
      if (change === 'receipt-map') receipt.metadata.sourceMapSha256 = 'f'.repeat(64);
      if (change === 'successor-session') session.userId = 'other';
      if (change === 'successor-payload') successor.payload.researchObjectId = f.ids.run;
      if (change === 'successor-key') successor.idempotencyKey += ':other';
      if (change === 'successor-debit') f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${successor.id}`)!.userId = 'other';
      if (change === 'run-actor') persistedRun.actorId = 'other';
      if (change === 'run-scope') persistedRun.researchObjectId = f.ids.run;
      if (change === 'run-cap') persistedRun.maxAgentTasks = 10;
      if (change === 'review-artifact') review.artifactId = f.ids.ro;
      if (change === 'review-binding') review.agentTaskId = original.id;
      if (change === 'extra-composition') f.db.hermesResearchSteps.push({ ...structuredClone(review), id: 'extra-composition', stage: 'source_composition' });
      const before = structuredClone(f.db); const dispatches = f.redis.lpush.mock.calls.length;
      await expect(reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'changed-successor-replay' }))
        .rejects.toThrow('replay binding changed');
      expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: f.ids.run }))
        .sourceReanalysis).toBeUndefined();
      expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
    });

  it.each(['actor', 'owner', 'version', 'run', 'current-source', 'permission', 'archived', 'public', 'not-draft', 'cap',
    'published-version', 'claims', 'review-digest', 'settings', 'source-state', 'source-retry', 'task-state', 'task-payload',
    'task-session', 'session-ro', 'session-state', 'artifact-hash', 'artifact-scope', 'purged', 'map-parser', 'map-artifact',
    'map-content', 'map-bytes', 'map-reference', 'receipt', 'duplicate-receipt', 'root-receipt', 'receipt-chain', 'receipt-ordinal',
    'receipt-session', 'receipt-document', 'receipt-ledger', 'review-order', 'review-status', 'extra-stage', 'extra-source',
    'active-anchor', 'active-writer', 'active-source-run', 'saved-commit', 'manual-commit', 'audit-unavailable'])(
    'denies changed %s without changing historical or financial rows', async change => {
      const f = await privateSourceReanalysisFixture();
      const technical = f.db.auditLogs.find(row => row.metadata?.recoveryClass === 'independent_source_review_not_submitted')!;
      const root = f.db.auditLogs.find(row => row.metadata?.recoveryClass === 'independent_source_review')!;
      const source = f.db.ingestionTasks[0]; const run = f.db.hermesResearchRuns[0];
      const session = f.db.agentSessions.find(row => row.id === f.current.sessionId)!;
      if (change === 'actor') f.input.userId = 'other';
      if (change === 'owner') source.batchId = 'other-batch';
      if (change === 'owner') f.db.ingestionBatches.push({ id: 'other-batch', userId: 'other', researchObjectId: f.ids.ro });
      if (change === 'version') f.input.sourceReanalysis.expectedRunVersion = 21;
      if (change === 'run') f.input.sourceReanalysis.sourceRunId = '00000000-0000-4000-8000-000000000999';
      if (change === 'current-source') source.agentTaskId = f.ids.anchor;
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      if (change === 'archived') f.db.workspaces[0].status = 'archived';
      if (change === 'public') f.db.researchObjects[0].visibility = 'public';
      if (change === 'not-draft') f.db.researchObjects[0].status = 'published';
      if (change === 'cap') run.maxAgentTasks = 10;
      if (change === 'published-version') run.versionId = 'version';
      if (change === 'claims') run.sourceClaimIds = ['claim'];
      if (change === 'review-digest') run.sourceReviewDigest = 'reviewed';
      if (change === 'settings') run.generationSettings.locale = 'xx';
      if (change === 'source-state') source.state = 'confirmed';
      if (change === 'source-retry') source.retryCount = 1;
      if (change === 'task-state') f.current.status = 'failed';
      if (change === 'task-payload') f.current.payload.sourceMapRef = f.reference;
      if (change === 'task-session') session.userId = 'other';
      if (change === 'session-ro') session.researchObjectId = 'other';
      if (change === 'session-state') session.status = 'closed';
      if (change === 'artifact-hash') f.db.artifacts[0].blobSha256 = 'f'.repeat(64);
      if (change === 'artifact-scope') f.db.artifacts[0].workspaceId = 'other';
      if (change === 'purged') f.db.artifacts[0].bytesPurgedAt = new Date();
      if (change.startsWith('map-') && change !== 'map-bytes') f.current.result.sourceMapRef = { ...f.reference };
      if (change === 'map-parser') f.current.result.sourceMapRef.parserStatus = 'needs_review';
      if (change === 'map-artifact') f.current.result.sourceMapRef.artifactId = f.ids.ro;
      if (change === 'map-content') f.current.result.sourceMapRef.contentHash = 'f'.repeat(64);
      if (change === 'map-bytes') f.objects.set(f.reference.objectKey, Buffer.alloc(f.reference.size, 'x'));
      if (change === 'map-reference') f.current.result.sourceMapRef.objectKey = 'arbitrary-object';
      if (change === 'receipt') f.db.auditLogs.splice(f.db.auditLogs.indexOf(technical), 1);
      if (change === 'duplicate-receipt') f.db.auditLogs.push({ ...technical, id: 'duplicate' });
      if (change === 'root-receipt') root.metadata.recoveryClass = 'saved_source_review_output_correction';
      if (change === 'receipt-chain') technical.metadata.oldAgentTaskId = f.ids.failed;
      if (change === 'receipt-ordinal') technical.metadata.ordinal--;
      if (change === 'receipt-session') session.idempotencyKey += ':other';
      if (change === 'receipt-document') technical.metadata.notSubmittedRecovery.input.documentSha256 = 'f'.repeat(64);
      if (change === 'receipt-ledger') technical.metadata.notSubmittedRecovery.reservationLedgerId = 'other';
      if (change === 'review-order') f.db.hermesResearchSteps.at(-1)!.ordinal = 0;
      if (change === 'review-status') f.db.hermesResearchSteps.at(-1)!.status = 'waiting';
      if (change === 'extra-stage') f.db.hermesResearchSteps.push({ ...f.db.hermesResearchSteps[0], id: 'composition', stage: 'source_composition' });
      if (change === 'extra-source') f.db.hermesResearchSteps.push({ ...f.db.hermesResearchSteps[0], id: 'duplicate-canonical' });
      if (change === 'active-anchor') f.db.agentTasks[0].status = 'running';
      if (change === 'active-writer') f.db.agentTasks.push({ ...f.current, id: 'other-writer', status: 'running' });
      if (change === 'active-source-run') {
        f.db.hermesResearchRuns.push({ ...run, id: 'another-run', status: 'running' });
        f.db.hermesResearchSteps.push({ ...f.db.hermesResearchSteps[0], id: 'another-source', runId: 'another-run' });
      }
      if (change === 'saved-commit') f.db.commits.push({ id: 'saved', idempotencyKey: `hermes-ingestion:${f.ids.run}:${f.ids.source}`, researchObjectId: f.ids.ro });
      if (change === 'manual-commit') f.db.commits.push({ id: 'saved', idempotencyKey: `ingestion-confirm:${f.ids.source}`, researchObjectId: f.ids.ro });
      if (change === 'audit-unavailable') f.deps.audit = undefined;
      const before = structuredClone(f.db); const dispatches = f.redis.lpush.mock.calls.length;
      await expect(reanalyzeConfirmedIngestion(f.deps, f.input)).rejects.toBeDefined();
      expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
    });

  it('rechecks live permission and the run CAS inside Serializable immediately before creation', async () => {
    for (const change of ['cas', 'role', 'writer']) {
      const f = await privateSourceReanalysisFixture(); const batches = f.db.ingestionBatches.length;
      const read = f.prisma.hermesResearchRun.findUnique.bind(f.prisma.hermesResearchRun);
      Object.assign(f.prisma.hermesResearchRun, { findUnique: async (args: Prisma.HermesResearchRunFindUniqueArgs) => {
        if (args.where.version !== undefined) {
          if (change === 'cas') return null;
          if (change === 'role') f.db.memberships[0].role = 'viewer';
        }
        return read(args);
      } });
      if (change === 'writer') {
        const find = f.prisma.agentTask.findFirst.bind(f.prisma.agentTask);
        Object.assign(f.prisma.agentTask, { findFirst: async (args: Prisma.AgentTaskFindFirstArgs) => {
          f.db.agentTasks.push({ ...f.current, id: 'writer-started', status: 'running' }); return find(args);
        } });
      }
      const before = structuredClone(f.db);
      await expect(reanalyzeConfirmedIngestion(f.deps, f.input)).rejects.toBeDefined();
      expect(f.db).toEqual(before); expect(f.db.ingestionBatches).toHaveLength(batches);
    }
  });

  it('retries a rolled-back serialization conflict without duplicate reservations or changes to historical rows', async () => {
    const f = await privateSourceReanalysisFixture(); const before = structuredClone(f.db);
    const update = f.prisma.ingestionTask.updateMany.bind(f.prisma.ingestionTask);
    let failedOnce = false;
    Object.assign(f.prisma.ingestionTask, { updateMany: async (args: Prisma.IngestionTaskUpdateManyArgs) => {
      const result = await update(args);
      if (!failedOnce) { failedOnce = true; throw Object.assign(new Error('serialization conflict'), { code: 'P2034' }); }
      return result;
    } });
    const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    expect(created.state).toBe('queued'); expect(f.db.ingestionTasks).toHaveLength(before.ingestionTasks.length + 1);
    expect(f.db.usageLedger).toHaveLength(before.usageLedger.length + 1);
    expect(f.db.agentTasks.slice(0, before.agentTasks.length)).toEqual(before.agentTasks);
    expect(f.db.hermesResearchRuns).toEqual(before.hermesResearchRuns); expect(f.db.hermesResearchSteps).toEqual(before.hermesResearchSteps);
  });

  it('projects the capability only for the exhausted target and returns its fixed successor on reload', async () => {
    const f = await privateSourceReanalysisFixture(); const read = () => getHermesResearchRun(f.deps, {
      actorId: f.input.userId, researchObjectId: f.ids.ro, runId: f.ids.run });
    expect((await read()).sourceReanalysis).toEqual({ ingestionTaskId: f.ids.source, sourceAgentTaskId: f.current.id });
    const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    expect((await read()).sourceReanalysis).toEqual({ ingestionTaskId: f.ids.source, sourceAgentTaskId: f.current.id,
      existingIngestionTaskId: created.id });
    f.db.memberships[0].role = 'viewer'; expect((await read()).sourceReanalysis).toBeUndefined();
    f.db.memberships[0].role = 'author'; f.db.hermesResearchRuns[0].maxAgentTasks = 10;
    expect((await read()).sourceReanalysis).toBeUndefined();
    f.db.hermesResearchRuns[0].maxAgentTasks = 9; f.db.hermesResearchRuns[0].status = 'running';
    expect((await read()).sourceReanalysis).toBeUndefined(); expect(f.verifier).not.toHaveBeenCalled();
  });

  it('replays the same paid analysis after its new run advances to initial independent review', async () => {
    const f = await privateSourceReanalysisFixture();
    const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const composition = f.db.agentTasks.find(task => task.id === created.agentTaskId)!;
    Object.assign(composition, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.anchorResult) });
    Object.assign(f.db.ingestionTasks.find(task => task.id === created.id)!, { state: 'needs_review' });
    const runId = '00000000-0000-4000-8000-000000000901';
    f.db.hermesResearchRuns.push({ id: runId, actorId: f.input.userId, researchObjectId: f.ids.ro,
      status: 'awaiting_source_review', version: 1, versionId: null, sourceClaimIds: [], sourceReviewDigest: null,
      maxAgentTasks: 9, profile: 'visual-narrative-v1', generationSettings: { locale: 'en', style: 'auto', instruction: 'Explain the paper' },
      error: null });
    f.db.hermesResearchSteps.push({ id: 'new-source-step', runId, stage: 'source_ingestion', ordinal: 0,
      ingestionTaskId: created.id, artifactId: created.artifactId, agentTaskId: composition.id,
      status: 'waiting', presentationAssetId: null, error: null });
    await expect(ensureHermesIngestionReview(f.deps, {
      actorId: f.input.userId, runId, taskId: created.id,
    })).resolves.toBe('queued');
    const successor = f.db.agentTasks.at(-1)!;
    expect(successor.id).not.toBe(composition.id);
    expect(f.db.ingestionTasks.find(task => task.id === created.id)!.agentTaskId).toBe(successor.id);
    const before = { tasks: f.db.agentTasks.length, sessions: f.db.agentSessions.length,
      ledger: f.db.usageLedger.length, dispatches: f.redis.lpush.mock.calls.length };
    await expect(reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-first-tab-replay' }))
      .resolves.toMatchObject({ id: created.id, agentTaskId: successor.id });
    expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId,
      researchObjectId: f.ids.ro, runId: f.ids.run })).sourceReanalysis)
      .toMatchObject({ existingIngestionTaskId: created.id });
    expect({ tasks: f.db.agentTasks.length, sessions: f.db.agentSessions.length,
      ledger: f.db.usageLedger.length, dispatches: f.redis.lpush.mock.calls.length }).toEqual(before);
    f.db.ingestionTasks.find(task => task.id === created.id)!.agentTaskId = f.current.id;
    await expect(reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'arbitrary-pointer-replay' }))
      .rejects.toThrow('replay binding changed');
  });

  it('binds Worker execution to the durable paid intent, exact current SourceMap and active execution attempt', async () => {
    const f = await privateSourceReanalysisFixture(); const result = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
    const binding = { ownerTaskId: task.id, ingestionTaskId: result.id, sourceAgentTaskId: f.current.id, executionAttempt: 1 };
    expect(await resolveHermesPrivateSourceReanalysisExecution(f.prisma as Prisma.TransactionClient, binding)).toEqual({ sourceMapRef: f.reference });
    task.executionAttempt = 2;
    await expect(resolveHermesPrivateSourceReanalysisExecution(f.prisma, binding)).rejects.toThrow('[blocked]');
    expect(await resolveHermesPrivateSourceReanalysisExecution(f.prisma, { ...binding, executionAttempt: 2 })).toEqual({ sourceMapRef: f.reference });
    expect(f.verifier).not.toHaveBeenCalled();
  });

  it.each(['missing', 'duplicate', 'intent', 'source', 'actor', 'workspace', 'version', 'map', 'new-task', 'payload', 'session',
    'batch-key', 'digest', 'batch-session', 'permission', 'archived', 'old-source', 'old-run', 'old-artifact', 'owner', 'ingestion', 'lease', 'new-state',
    'credit-policy', 'receipt-artifact', 'receipt-ingestion', 'missing-debit', 'debit-owner', 'batch-owner', 'batch-ro', 'session-key'])(
    'blocks a changed %s private execution binding instead of falling back to legacy', async change => {
      const f = await privateSourceReanalysisFixture(); const result = await reanalyzeConfirmedIngestion(f.deps, f.input);
      const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
      const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.reanalyze')!;
      const batch = f.db.ingestionBatches.at(-1)!; const session = f.db.agentSessions.at(-1)!;
      const binding = { ownerTaskId: task.id, ingestionTaskId: result.id, sourceAgentTaskId: f.current.id, executionAttempt: 1 };
      if (change === 'missing') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
      if (change === 'duplicate') f.db.auditLogs.push({ ...receipt, id: 'duplicate' });
      if (change === 'intent') delete receipt.metadata.intent;
      if (change === 'source') receipt.metadata.sourceAgentTaskId = f.ids.anchor;
      if (change === 'actor') receipt.actorId = 'other';
      if (change === 'workspace') receipt.workspaceId = 'other';
      if (change === 'version') receipt.metadata.expectedRunVersion = 21;
      if (change === 'map') receipt.metadata.sourceMapSha256 = 'f'.repeat(64);
      if (change === 'new-task') receipt.metadata.newAgentTaskId = f.current.id;
      if (change === 'payload') task.payload.sourceMapRef = f.reference;
      if (change === 'session') session.userId = 'other';
      if (change === 'batch-key') batch.idempotencyKey = 'wrong-fixed-key';
      if (change === 'digest') batch.requestDigest = 'f'.repeat(64);
      if (change === 'batch-session') batch.agentSessionId = f.current.sessionId;
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      if (change === 'archived') f.db.workspaces[0].status = 'archived';
      if (change === 'credit-policy') receipt.metadata.creditPolicy = 'reuse-original-reservation';
      if (change === 'receipt-artifact') receipt.metadata.artifactId = f.ids.ro;
      if (change === 'receipt-ingestion') receipt.metadata.sourceIngestionTaskId = result.id;
      if (change === 'missing-debit') f.db.usageLedger.pop();
      if (change === 'debit-owner') f.db.usageLedger.at(-1)!.userId = 'other';
      if (change === 'batch-owner') batch.userId = 'other';
      if (change === 'batch-ro') batch.researchObjectId = f.ids.run;
      if (change === 'session-key') session.idempotencyKey += ':other';
      if (change === 'old-source') f.db.ingestionTasks[0].agentTaskId = f.ids.anchor;
      if (change === 'old-run') f.db.hermesResearchRuns[0].version++;
      if (change === 'old-artifact') f.db.artifacts[0].blobSha256 = 'f'.repeat(64);
      if (change === 'owner') binding.ownerTaskId = f.current.id;
      if (change === 'ingestion') f.db.ingestionTasks.at(-1)!.agentTaskId = f.current.id;
      if (change === 'lease') task.status = 'pending';
      if (change === 'new-state') f.db.ingestionTasks.at(-1)!.state = 'confirmed';
      await expect(resolveHermesPrivateSourceReanalysisExecution(f.prisma, binding)).rejects.toThrow('[blocked]');
      const replay = reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'different-replay-key' });
      if (change === 'lease' || change === 'new-state' || change === 'owner') await expect(replay).resolves.toBeDefined();
      else await expect(replay).rejects.toBeDefined();
    });

  it('leaves the confirmed reanalysis contract and legacy Worker guard unchanged', async () => {
    const f = await privateSourceReanalysisFixture();
    f.db.ingestionTasks[0].state = 'confirmed'; f.current.result = structuredClone(f.anchorResult);
    const commitId = 'manual-save'; const versionId = 'manual-version';
    f.db.commits.push({ id: commitId, idempotencyKey: `ingestion-confirm:${f.ids.source}`, researchObjectId: f.ids.ro });
    f.db.versions.push({ id: versionId, commitId, researchObjectId: f.ids.ro, versionNo: 1 });
    f.db.versionManifests.push({ id: 'manifest', versionId });
    const input = { userId: f.input.userId, taskId: f.input.taskId, sourceAgentTaskId: f.input.sourceAgentTaskId,
      processingConsent: true, idempotencyKey: f.input.idempotencyKey };
    const first = await reanalyzeConfirmedIngestion(f.deps, input);
    expect(await reanalyzeConfirmedIngestion(f.deps, input)).toEqual(first);
    expect((await reanalyzeConfirmedIngestion(f.deps, { ...input, idempotencyKey: 'another-confirmed-analysis' })).id).not.toBe(first.id);
    expect(await resolveHermesPrivateSourceReanalysisExecution(f.prisma, { ownerTaskId: first.agentTaskId!,
      ingestionTaskId: first.id, sourceAgentTaskId: f.current.id, executionAttempt: 1 })).toBeNull();
    expect(f.db.auditLogs.filter(row => row.action === 'ingestion.task.reanalyze').every(row => row.metadata.intent === undefined)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { getHermesResearchRun, retryHermesGeneration, reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { ensureHermesIngestionReview, reanalyzeConfirmedIngestion } from '../../src/ingestion/ingestion-service';
import { requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { inspectHermesSourceCompositionRecovery } from '../../src/ingestion/source-composition-recovery';
import { sourceCompositionRecoveryFixture } from './source-composition-recovery-fixture';
import { claimAgentTask, markTaskProgress } from '../../src/agent/agent';
import { requireHermesSourceCompositionRecoveryExecution } from '../../src/ingestion/source-composition-recovery';

function candidate(f: Awaited<ReturnType<typeof sourceCompositionRecoveryFixture>>) {
  const result = structuredClone(f.anchorResult);
  result.scientificReview.semanticStage = structuredClone(f.failed.result.scientificReview.semanticStage);
  result.scientificReview.reviewedCandidateHash = f.failed.result.scientificReview.reviewedCandidateHash;
  for (const field of Object.keys(result.evidence)) result.evidence[field]!.locator = 'passages:P00001';
  Object.assign(result.scientificReview, { usage: { inputTokens: 10, outputTokens: 10 }, draftClaims: [{ clientKey: 'core', kind: 'core',
    sourceField: 'insight', statement: 'Supported contribution', conditions: [], limitations: [],
    sourceBindings: [{ sourcePassageId: 'P00001', relation: 'supports' }] }] });
  return result;
}

async function claimedRecovery() {
  const f = await sourceCompositionRecoveryFixture(); await retryHermesGeneration(f.deps, f.recoveryInput);
  const id = f.db.agentTasks.at(-1)!.id; await claimAgentTask(f.deps, id);
  const owner = f.db.agentTasks.find(row => row.id === id)!;
  owner.result = { sourceMapRef: structuredClone(f.reference) };
  return { ...f, owner, executionInput: { ownerTaskId: id, ingestionTaskId: f.source.id, sourceAgentTaskId: f.failed.id, executionAttempt: 1 } };
}

describe('same-run final source composition recovery', () => {
  it('offers one paid final composition from the saved complete semantic stage, without a review or new run', async () => {
    const f = await sourceCompositionRecoveryFixture(); expect(f.run.status).toBe('failed');
    const before = structuredClone(f.db);
    expect(await getHermesResearchRun(f.deps, f.recoveryInput))
      .toMatchObject({ canRetryGeneration: true, generationRecovery: 'source-composition', chargeableAttempts: 1 });
    expect(f.db).toEqual(before);
  });

  it('accepts the same semantic stage after JSONB key reordering without redefining its original provider hash', async () => {
    const f = await sourceCompositionRecoveryFixture();
    const reduction = f.failed.result.scientificReview.semanticStage.reduction;
    f.failed.result.scientificReview.semanticStage.reduction = { fields: Object.fromEntries(Object.entries(reduction.fields).reverse()),
      chosenRepresentativeCase: reduction.chosenRepresentativeCase };
    expect(createHash('sha256').update(JSON.stringify(f.failed.result.scientificReview.semanticStage.reduction)).digest('hex'))
      .not.toBe(f.failed.result.scientificReview.reviewedCandidateHash);
    expect((await f.prisma.agentTask.findUnique({ where: { id: f.failed.id } }))!.result).toBe(f.failed.result);
    expect(await inspectHermesSourceCompositionRecovery(f.prisma, f.run.id)).not.toBeNull();
    expect(await getHermesResearchRun(f.deps, f.recoveryInput))
      .toMatchObject({ canRetryGeneration: true, generationRecovery: 'source-composition', chargeableAttempts: 1 });
  });

  it('appends ordinal one and charges exactly once while preserving the failed task and same-key replay', async () => {
    const f = await sourceCompositionRecoveryFixture();
    const oldTask = structuredClone(f.failed); const runs = f.db.hermesResearchRuns.length;
    const oldStep = f.db.hermesResearchSteps.find(row => row.runId === f.run.id && row.stage === 'source_composition')!;
    expect(oldStep.status).toBe('failed'); const ledger = f.db.usageLedger.length; const tasks = f.db.agentTasks.length;
    const result = await retryHermesGeneration(f.deps, f.recoveryInput);
    expect(result).toMatchObject({ id: f.run.id, status: 'running' });
    const phases = f.db.hermesResearchSteps.filter(row => row.runId === f.run.id && row.stage === 'source_composition');
    expect(phases).toHaveLength(2); expect(phases[0]).toMatchObject({ ordinal: 0, status: 'failed', agentTaskId: oldTask.id });
    expect(phases[1]).toMatchObject({ ordinal: 1, status: 'waiting', agentTaskId: f.db.agentTasks.at(-1)!.id });
    expect(f.failed).toEqual(oldTask); expect(f.db.hermesResearchRuns).toHaveLength(runs);
    expect(f.db.agentTasks).toHaveLength(tasks + 1); expect(f.db.usageLedger).toHaveLength(ledger + 1);
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-paid-tab-final-composition' }))
      .toMatchObject({ id: f.source.id, agentTaskId: phases[1]!.agentTaskId });
    const after = structuredClone(f.db.usageLedger); const dispatches = f.redis.lpush.mock.calls.length;
    expect(await retryHermesGeneration(f.deps, f.recoveryInput)).toEqual(result);
    expect(f.db.usageLedger).toEqual(after); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
  });

  it('advances a valid final composition to the existing first independent review without relabelling failed ordinal zero', async () => {
    const f = await sourceCompositionRecoveryFixture(); await retryHermesGeneration(f.deps, f.recoveryInput);
    const composed = f.db.agentTasks.at(-1)!;
    const result = candidate(f);
    Object.assign(composed, { status: 'succeeded', executionAttempt: 1, result });
    f.db.ingestionTasks.find(row => row.id === f.source.id)!.state = 'needs_review';
    await reconcileHermesResearchRuns(f.deps);
    expect(await ensureHermesIngestionReview(f.deps, { actorId: f.input.userId, runId: f.run.id, taskId: f.source.id })).toBe('queued');
    const review = f.db.agentTasks.at(-1)!; Object.assign(review, { status: 'running', executionAttempt: 1 });
    const steps = f.db.hermesResearchSteps.filter(row => row.runId === f.run.id);
    expect(steps.find(row => row.stage === 'source_composition' && row.ordinal === 0)).toMatchObject({ status: 'failed', agentTaskId: f.failed.id });
    expect(steps.find(row => row.stage === 'source_composition' && row.ordinal === 1)).toMatchObject({ status: 'succeeded', agentTaskId: composed.id });
    expect(steps.filter(row => row.stage === 'source_review')).toHaveLength(1);
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: review.id, ingestionTaskId: f.source.id,
      failedTaskId: composed.id, compositionTaskId: composed.id, executionAttempt: 1 }))
      .toMatchObject({ mode: 'web', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro' });
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-paid-tab-initial-review' }))
      .toMatchObject({ id: f.source.id, agentTaskId: review.id });
    review.status = 'succeeded';
    review.result = { ...structuredClone(result), scientificReview: { ...structuredClone(result.scientificReview),
      kind: 'independent_review', contractVersion: '5', sourceAgentTaskId: composed.id,
      provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro' },
      reviewedClaimSuggestions: [{ clientKey: 'core', kind: 'core', sourceField: 'insight', statement: 'Reviewed contribution',
        conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] };
    f.db.ingestionTasks.find(row => row.id === f.source.id)!.state = 'needs_review';
    expect(await ensureHermesIngestionReview(f.deps, { actorId: f.input.userId, runId: f.run.id, taskId: f.source.id })).toBe('ready');
    expect(f.db.hermesResearchSteps.find(row => row.runId === f.run.id && row.stage === 'source_composition' && row.ordinal === 0))
      .toMatchObject({ status: 'failed', agentTaskId: f.failed.id });
    expect(f.db.hermesResearchSteps.find(row => row.agentTaskId === review.id && row.stage === 'source_review'))
      .toMatchObject({ status: 'succeeded' });
  });

  it.each(['membership', 'ro', 'scope', 'pointer', 'phase-status', 'extra-phase', 'already-reviewed', 'parent-session', 'task-key',
    'debit', 'initial-receipt', 'initial-policy', 'initial-parent', 'stage-source', 'stage-range', 'stage-point', 'stage-binding',
    'stage-finish', 'stage-usage', 'core', 'claims', 'evidence', 'diagnostic', 'review-provider', 'approval'])(
    'refuses changed %s before any new task or charge', async change => {
      const f = await sourceCompositionRecoveryFixture();
      const result = f.failed.result; const stage = result.scientificReview.semanticStage;
      const phase = f.db.hermesResearchSteps.find(row => row.runId === f.run.id && row.stage === 'source_composition')!;
      const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh' && row.metadata.newAgentTaskId === f.failed.id)!;
      if (change === 'membership') f.db.memberships[0].role = 'viewer';
      if (change === 'ro') f.db.researchObjects[0].deletedAt = new Date();
      if (change === 'scope') f.run.actorId = 'other';
      if (change === 'pointer') f.db.ingestionTasks.find(row => row.id === f.source.id)!.agentTaskId = f.original.id;
      if (change === 'phase-status') phase.status = 'succeeded';
      if (change === 'extra-phase') f.db.hermesResearchSteps.push({ ...structuredClone(phase), id: 'extra-comp', ordinal: 1 });
      if (change === 'already-reviewed') f.db.hermesResearchSteps.push({ ...structuredClone(phase), id: 'extra-review', stage: 'source_review' });
      if (change === 'parent-session') f.db.agentSessions.find(row => row.id === f.original.sessionId)!.userId = 'other';
      if (change === 'task-key') f.failed.idempotencyKey += ':other';
      if (change === 'debit') f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${f.failed.id}`)!.userId = 'other';
      if (change === 'initial-receipt') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
      if (change === 'initial-policy') receipt.metadata.policy = 'scientific_review_v4_independent';
      if (change === 'initial-parent') receipt.metadata.oldAgentTaskId = f.current.id;
      if (change === 'stage-source') stage.source.sourceMapHash = 'b'.repeat(64);
      if (change === 'stage-range') stage.reduction.fields.method![0]!.conditionCase = 'x'.repeat(601);
      if (change === 'stage-point') stage.reduction.fields.method![0]!.type = 'invented';
      if (change === 'stage-binding') stage.passageBindings[0]!.sourcePassageIds = [];
      if (change === 'stage-finish') stage.finishReason = 'length';
      if (change === 'stage-usage') stage.usage.inputTokens = -1;
      if (change === 'core') result.core.method = 'Already accepted text';
      if (change === 'claims') Object.assign(result, { reviewedClaimSuggestions: [{ clientKey: 'approved' }] });
      if (change === 'evidence') result.evidence.method!.quote = 'Accepted evidence';
      if (change === 'diagnostic') result.fieldDiagnosticsDetails.method = 'scientificReview=needs_source_evidence';
      if (change === 'review-provider') result.scientificReview.provider = 'chatgpt-web-science-review';
      if (change === 'approval') result.scientificReview.status = 'review_received';
      const before = { ledger: structuredClone(f.db.usageLedger), tasks: f.db.agentTasks.length, dispatches: f.redis.lpush.mock.calls.length };
      await expect(retryHermesGeneration(f.deps, f.recoveryInput)).rejects.toBeDefined();
      expect(f.db.usageLedger).toEqual(before.ledger); expect(f.db.agentTasks).toHaveLength(before.tasks);
      expect(f.redis.lpush).toHaveBeenCalledTimes(before.dispatches);
    });

  it.each(['stale-version', 'same-key', 'different-key'])(
    'preserves the existing CAS and one-debit concurrency boundary (%s)', async mode => {
      const f = await sourceCompositionRecoveryFixture(); const ledger = f.db.usageLedger.length; const tasks = f.db.agentTasks.length;
      if (mode === 'stale-version') {
        await expect(retryHermesGeneration(f.deps, { ...f.recoveryInput, expectedVersion: f.run.version - 1 })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
        expect(f.db.usageLedger).toHaveLength(ledger); expect(f.db.agentTasks).toHaveLength(tasks);
      } else {
        const results = await Promise.allSettled([retryHermesGeneration(f.deps, f.recoveryInput), retryHermesGeneration(f.deps,
          { ...f.recoveryInput, idempotencyKey: mode === 'same-key' ? f.recoveryInput.idempotencyKey : 'another-client' })]);
        expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(mode === 'same-key' ? 2 : 1);
        expect(f.db.usageLedger).toHaveLength(ledger + 1); expect(f.db.agentTasks).toHaveLength(tasks + 1);
      }
  });

  it.each(['failed_retryable', 'failed_blocked'])('preserves old diagnostics and same-key read-only replay after %s', async state => {
    const f = await sourceCompositionRecoveryFixture();
    await retryHermesGeneration(f.deps, f.recoveryInput);
    const old = structuredClone(f.db.hermesResearchSteps.find(row => row.runId === f.run.id && row.stage === 'source_composition' && row.ordinal === 0)!);
    Object.assign(f.db.agentTasks.at(-1)!, { status: 'failed', error: 'Later continuation transport failure' });
    Object.assign(f.db.ingestionTasks.find(row => row.id === f.source.id)!, { state, error: 'Later continuation transport failure' });
    expect(await reconcileHermesResearchRuns(f.deps)).toMatchObject({ failed: 1, errors: 0 });
    expect(f.db.hermesResearchSteps.find(row => row.id === old.id)).toEqual(old);
    const before = structuredClone(f.db); const dispatches = f.redis.lpush.mock.calls.length;
    expect(await retryHermesGeneration(f.deps, f.recoveryInput)).toMatchObject({ id: f.run.id, status: 'failed' });
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-paid-tab-after-terminal-failure' }))
      .toMatchObject({ id: f.source.id, state });
    await expect(requireHermesSourceCompositionRecoveryExecution(f.prisma, { ownerTaskId: f.db.agentTasks.at(-1)!.id,
      ingestionTaskId: f.source.id, sourceAgentTaskId: f.failed.id, executionAttempt: 1 })).rejects.toThrow('[blocked]');
    expect(f.db).toEqual(before); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
  });

  it.each(['candidate', 'blocked'])(
    'commits only the bound private contract-four %s through the actual task transaction', async outcome => {
      const f = await claimedRecovery();
      expect(await requireHermesSourceCompositionRecoveryExecution(f.prisma, f.executionInput))
        .toMatchObject({ previousResult: f.failed.result, sourceMapRef: f.reference, taskId: f.owner.id });
      const result = outcome === 'candidate' ? candidate(f) : structuredClone(f.failed.result);
      expect(await markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 }))
        .toMatchObject({ status: 'succeeded' });
      expect(f.db.agentTasks.find(row => row.id === f.owner.id)!.result).toEqual(result);
    });

  it.each(['membership', 'cancelled', 'lease', 'pointer', 'receipt', 'checkpoint', 'incoming-map', 'incoming-stage', 'contract-five',
    'approved-claims', 'missing-draft', 'empty-draft', 'malformed-draft', 'summary-length', 'candidate-hash', 'blocked-hash'])(
    'rejects changed %s in the actual terminal write after work has completed', async change => {
      const f = await claimedRecovery(); const result = candidate(f);
      if (change === 'membership') f.db.memberships[0].role = 'viewer';
      if (change === 'cancelled') f.run.status = 'stopped';
      if (change === 'lease') f.owner.executionAttempt = 2;
      if (change === 'pointer') f.db.ingestionTasks.find(row => row.id === f.source.id)!.agentTaskId = f.failed.id;
      if (change === 'receipt') f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_composition_recovery')!.metadata.semanticResponseHash = 'e'.repeat(64);
      if (change === 'checkpoint') f.owner.result = { sourceMapRef: { ...f.reference, serializedSha256: 'e'.repeat(64) } };
      if (change === 'incoming-map') result.sourceMapRef.contentHash = 'e'.repeat(64);
      if (change === 'incoming-stage') result.scientificReview.semanticStage.reduction.fields.method![0]!.statement = 'Changed reading';
      if (change === 'contract-five') result.scientificReview.contractVersion = '5';
      if (change === 'approved-claims') Object.assign(result, { reviewedClaimSuggestions: [{ clientKey: 'approved' }] });
      const review = result.scientificReview as Record<string, unknown>;
      if (change === 'missing-draft') delete review.draftClaims;
      if (change === 'empty-draft') review.draftClaims = [];
      if (change === 'malformed-draft') review.draftClaims = [{ clientKey: 'core' }];
      if (change === 'summary-length') result.core.method = 'x'.repeat(221);
      if (change === 'candidate-hash') review.reviewedCandidateHash = 'e'.repeat(64);
      if (change === 'blocked-hash') Object.assign(result, structuredClone(f.failed.result), {
        scientificReview: { ...structuredClone(f.failed.result.scientificReview), reviewedCandidateHash: 'e'.repeat(64) },
      });
      await expect(markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 })).rejects.toBeDefined();
      expect(f.db.agentTasks.find(row => row.id === f.owner.id)!.status).not.toBe('succeeded');
    });
});

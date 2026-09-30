import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fixture, fields } from './direct-source-review-fixture';
import { seedHistoricalIndependentSourceReview } from './historical-source-review-fixture';
import { getHermesResearchRun, retryHermesGeneration, reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { ensureHermesIngestionReview } from '../../src/ingestion/ingestion-service';

async function failedIndependent(fullHistory = false) {
  const f = fixture();
  if (fullHistory) {
    await retryHermesGeneration(f.deps, f.input);
    const fresh = f.db.agentTasks.at(-1)!;
    Object.assign(fresh, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.failedResult) });
    for (const call of f.db.auditLogs.filter(row => row.requestId === f.ids.failed))
      f.db.auditLogs.push({ ...structuredClone(call), id: `${call.id}-fresh`, requestId: fresh.id });
    f.db.hermesResearchSteps.at(-1)!.status = 'failed';
    f.db.hermesResearchRuns[0].status = 'failed'; f.db.ingestionTasks[0].state = 'needs_review';
  }
  const text = JSON.stringify({ fields: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`,
    sourcePassageIds: ['P00001'], issues: [] })), needsMoreEvidence: [], claimSuggestions: [{ parentClientKey: 'missing' }] });
  const failed = f.db.agentTasks.at(-1)!;
  failed.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=review_contract_incomplete;reviewedClaims=source_unmaterializable');
  failed.result.scientificReview.rejectedOutputs = [{ structuredAttempt: 2, kind: 'schema_validation',
    diagnostic: 'claims_source_unmaterializable', provider: 'primary', model: 'MiniMax-M3', promptHash: '2'.repeat(64),
    responseHash: createHash('sha256').update(text).digest('hex'), byteLength: Buffer.byteLength(text),
    usage: { inputTokens: 100, outputTokens: 100 }, finishReason: 'stop', text }];
  if (fullHistory) {
    await retryHermesGeneration(f.deps, { ...f.input, expectedVersion: f.db.hermesResearchRuns[0].version, idempotencyKey: 'saved-or-independent' });
    const saved = f.db.agentTasks.at(-1)!;
    const receipt = f.db.auditLogs.find(row => row.metadata?.newAgentTaskId === saved.id)!;
    Object.assign(receipt.metadata, { recoveryClass: 'saved_source_review_output_correction', noProviderSwitch: true });
    for (const key of ['reviewMode', 'reviewProvider', 'reviewModel', 'noRuntimeFallback']) delete receipt.metadata[key];
    Object.assign(saved, { status: 'succeeded', executionAttempt: 1, result: structuredClone(failed.result) });
    saved.result.scientificReview.rejectedOutputs[0].structuredAttempt = 1;
    const call = f.db.auditLogs.find(row => row.requestId === failed.id && row.metadata.promptHash === '2'.repeat(64))!;
    f.db.auditLogs.push({ ...structuredClone(call), id: 'saved-call', requestId: saved.id });
    f.db.hermesResearchSteps.at(-1)!.status = 'failed';
    f.db.hermesResearchRuns[0].status = 'failed'; f.db.ingestionTasks[0].state = 'needs_review';
  }
  const root = seedHistoricalIndependentSourceReview(f);
  root.status = 'succeeded'; root.executionAttempt = 1;
  root.result = structuredClone(f.failedResult);
  root.result.scientificReview = { ...root.result.scientificReview, kind: 'independent_review',
    provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
    attemptId: '00000000-0000-5000-8000-000000000777' };
  root.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=unavailable');
  f.db.auditLogs.push({ id: 'web-call', action: 'ai.gateway.call', requestId: root.id, actorId: null, targetType: 'ai_gateway',
    metadata: { operation: 'scientific_review', outcome: 'failed', provider: 'chatgpt-web-science-review',
      model: 'chatgpt-web/6-pro', promptHash: 'c'.repeat(64), inputContentHash: 'a'.repeat(64),
      fallbackReason: null, retryCount: 0, error: 'scientific_review_failed' } });
  f.db.hermesResearchSteps.at(-1)!.status = 'failed';
  f.db.hermesResearchRuns[0].status = 'failed'; f.db.ingestionTasks[0].state = 'needs_review';
  const verifier = vi.fn(async () => true);
  const deps = { ...f.deps, canRetrySourceReviewBeforeSubmission: verifier };
  const input = { ...f.input, expectedVersion: f.db.hermesResearchRuns[0].version, idempotencyKey: 'technical-continuation' };
  return { ...f, root, text, verifier, deps, input };
}

describe('zero-submit source review technical successor', () => {
  it('fits the actual initial/fresh/saved/independent history within nine including three downstream reservations', async () => {
    const f = await failedIndependent(true);
    expect(f.db.hermesResearchSteps).toHaveLength(5);
    const before = structuredClone(f.db.usageLedger);
    await retryHermesGeneration(f.deps, f.input);
    expect(f.db.hermesResearchSteps).toHaveLength(6); expect(f.db.hermesResearchRuns[0].maxAgentTasks).toBe(9);
    expect(f.db.usageLedger).toEqual(before);
    const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
    const saved = f.db.agentTasks.at(-3)!;
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: task.id, failedTaskId: f.root.id,
      ingestionTaskId: f.ids.source, compositionTaskId: f.ids.anchor, executionAttempt: 1 }))
      .toMatchObject({ savedOutput: { sourceTaskId: saved.id, structuredAttempt: 1, text: f.text } });
  });
  it('keeps original task/result/charge, creates one successor, and replays every terminal state', async () => {
    const f = await failedIndependent(); const original = structuredClone(f.root);
    const ledger = structuredClone(f.db.usageLedger);
    expect(await getHermesResearchRun(f.deps, f.input)).toMatchObject({ generationRecovery: 'source-review-not-submitted', chargeableAttempts: 0 });
    expect(f.verifier).toHaveBeenCalledWith({ requestId: original.result.scientificReview.attemptId,
      promptHash: 'c'.repeat(64), artifactId: f.ids.artifact, documentSha256: 'a'.repeat(64),
      candidateHash: original.result.scientificReview.reviewedCandidateHash, sourceMapHash: 'b'.repeat(64) });
    await Promise.all([retryHermesGeneration(f.deps, f.input), retryHermesGeneration(f.deps, f.input)]);
    expect(f.db.agentTasks.find(task => task.id === f.root.id)).toEqual(original);
    expect(f.db.usageLedger).toEqual(ledger);
    expect(f.db.agentTasks).toHaveLength(4); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
    const binding = { ownerTaskId: task.id, ingestionTaskId: f.ids.source, compositionTaskId: f.ids.anchor,
      failedTaskId: f.root.id, executionAttempt: 1 };
    expect(await requireHermesSourceReviewExecution(f.prisma, binding)).toMatchObject({ mode: 'web',
      savedOutput: { text: f.text, sourceTaskId: f.ids.failed },
      notSubmittedRecovery: { requestId: original.result.scientificReview.attemptId } });
    task.executionAttempt = 2;
    await expect(requireHermesSourceReviewExecution(f.prisma, binding)).rejects.toThrow('binding changed');
    expect(await requireHermesSourceReviewExecution(f.prisma, { ...binding, executionAttempt: 2 })).toMatchObject({ taskId: task.id });
    for (const status of ['running', 'failed', 'succeeded']) {
      f.db.hermesResearchRuns[0].status = status;
      await expect(retryHermesGeneration(f.deps, f.input)).resolves.toMatchObject({ id: f.ids.run });
    }
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    f.db.hermesResearchRuns[0].status = 'failed'; task.status = 'succeeded'; task.result = structuredClone(original.result);
    f.db.ingestionTasks[0].state = 'needs_review'; f.db.hermesResearchSteps.at(-1)!.status = 'failed';
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 9, idempotencyKey: 'another-key' })).rejects.toBeDefined();
  });

  it.each(['proof', 'audit', 'duplicate-audit', 'document', 'source', 'actor', 'permission', 'debit', 'debit-owner', 'budget'])(
    'denies %s before creating or charging', async change => {
      const f = await failedIndependent();
      if (change === 'proof') f.verifier.mockResolvedValue(false);
      if (change === 'audit') f.db.auditLogs.find(row => row.id === 'web-call')!.metadata.outcome = 'succeeded';
      if (change === 'duplicate-audit') f.db.auditLogs.push({ ...structuredClone(f.db.auditLogs.find(row => row.id === 'web-call')), id: 'duplicate' });
      if (change === 'document') f.db.auditLogs.find(row => row.id === 'web-call')!.metadata.inputContentHash = 'f'.repeat(64);
      if (change === 'source') f.db.artifacts[0].blobSha256 = 'f'.repeat(64);
      if (change === 'actor') f.db.agentSessions.at(-1)!.userId = 'other';
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      if (change === 'debit') f.db.usageLedger.splice(1);
      if (change === 'debit-owner') f.db.usageLedger.at(-1)!.userId = 'other';
      if (change === 'budget') f.db.hermesResearchRuns[0].maxAgentTasks = 11;
      const count = f.db.agentTasks.length; const ledger = structuredClone(f.db.usageLedger);
      await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined();
      expect(f.db.agentTasks).toHaveLength(count); expect(f.db.usageLedger).toEqual(ledger);
    });

  it('rolls back task and source if the run CAS loses', async () => {
    const f = await failedIndependent(); const before = structuredClone(f.db);
    vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined();
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it.each(['receipt-source', 'receipt-ledger', 'receipt-credit', 'saved-body', 'permission', 'current-source'])(
    'revalidates %s before granting worker authority', async change => {
      const f = await failedIndependent(); await retryHermesGeneration(f.deps, f.input);
      const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
      const receipt = f.db.auditLogs.find(row => row.metadata?.newAgentTaskId === task.id)!;
      if (change === 'receipt-source') receipt.metadata.notSubmittedRecovery.input.promptHash = 'f'.repeat(64);
      if (change === 'receipt-ledger') receipt.metadata.notSubmittedRecovery.reservationLedgerId = 'other';
      if (change === 'receipt-credit') receipt.metadata.creditPolicy = 'not-applicable-deterministic';
      if (change === 'saved-body') f.db.agentTasks[1].result.scientificReview.rejectedOutputs[0].text += ' ';
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      if (change === 'current-source') f.db.ingestionTasks[0].agentTaskId = f.root.id;
      await expect(requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: task.id, failedTaskId: f.root.id,
        ingestionTaskId: f.ids.source, compositionTaskId: f.ids.anchor, executionAttempt: 1 })).rejects.toBeDefined();
    });

  it('serializes different client keys into one slot and rejects changed replay payloads', async () => {
    const f = await failedIndependent();
    const results = await Promise.allSettled([retryHermesGeneration(f.deps, f.input),
      retryHermesGeneration(f.deps, { ...f.input, idempotencyKey: 'competing-key' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(f.db.agentTasks).toHaveLength(4); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 9 })).rejects.toBeDefined();
  });

  it.each(['blocked', 'failed'])('stops a %s technical successor without opening another review', async outcome => {
    const f = await failedIndependent(); await retryHermesGeneration(f.deps, f.input);
    const failedSteps = structuredClone(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review' && step.status === 'failed'));
    const task = f.db.agentTasks.at(-1)!; task.status = outcome === 'blocked' ? 'succeeded' : 'failed'; task.executionAttempt = 1;
    task.result = structuredClone(f.root.result); task.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=scientific_claim_blocked');
    f.db.ingestionTasks[0].state = outcome === 'blocked' ? 'needs_review' : 'failed_blocked';
    f.db.hermesResearchRuns[0].status = 'awaiting_source_review';
    const results = await reconcileHermesResearchRuns({ ...f.deps, storage: {} as never });
    expect(results.failed).toBe(1); expect(f.db.hermesResearchRuns[0].status).toBe('failed');
    expect(f.db.hermesResearchRuns[0].versionId).toBeNull(); expect(f.db.agentTasks).toHaveLength(4);
    expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
    expect(f.db.hermesResearchSteps.filter(step => failedSteps.some(old => old.id === step.id))).toEqual(failedSteps);
  });

  it('consumes an accepted successor while retaining earlier failed review steps', async () => {
    const f = await failedIndependent(); await retryHermesGeneration(f.deps, f.input);
    const task = f.db.agentTasks.at(-1)!; task.status = 'succeeded'; task.executionAttempt = 1;
    task.result = { ...structuredClone(f.anchorResult), scientificReview: { ...structuredClone(f.anchorResult.scientificReview),
      kind: 'independent_review', contractVersion: '5', sourceAgentTaskId: f.ids.anchor,
      reviewedCandidateHash: f.failedResult.scientificReview.reviewedCandidateHash,
      provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro' },
      reviewedClaimSuggestions: [{ clientKey: 'c1', sourceField: 'method', kind: 'core', statement: 'Reviewed method',
        conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] };
    f.db.ingestionTasks[0].state = 'needs_review';
    const originalUpdate = f.prisma.hermesResearchStep.updateMany.bind(f.prisma.hermesResearchStep);
    vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockImplementation(async args => {
      const selected = typeof args.where?.id === 'object' ? args.where.id.in : undefined;
      if (!Array.isArray(selected)) return originalUpdate(args);
      const rows = f.db.hermesResearchSteps.filter(step => selected.includes(step.id)
        && f.db.agentTasks.some(candidate => candidate.id === step.agentTaskId && candidate.status === 'succeeded'));
      rows.forEach(step => Object.assign(step, args.data)); return { count: rows.length };
    });
    await expect(ensureHermesIngestionReview(f.deps as never, { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source })).resolves.toBe('ready');
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review').map(step => step.status))
      .toEqual(['failed', 'failed', 'succeeded']);
  });
});

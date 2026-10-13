import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fixture, fields } from './direct-source-review-fixture';
import { seedHistoricalIndependentSourceReview } from './historical-source-review-fixture';
import { getHermesResearchRun, retryHermesGeneration } from '../../src/agent/research-run';
import { inspectHermesSourceReviewRecovery } from '../../src/ingestion/source-review-recovery';

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

describe('retired Web source review recovery', () => {
  it('refuses a retired Web successor before creating any task, debit, reservation or dispatch', async () => {
    const f = await failedIndependent(); const before = structuredClone(f.db);
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toThrow('retired');
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it.each([false, true])('retains readable paid history after full-history=%s and exposes no new recovery action', async fullHistory => {
    const f = await failedIndependent(fullHistory); const before = structuredClone(f.db);
    const dispatchCount = f.redis.lpush.mock.calls.length;
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run, undefined, f.verifier)).toMatchObject({
      reviewMode: 'web', technicalRecovery: { input: { requestId: f.root.result.scientificReview.attemptId } } });
    expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toThrow('retired');
    expect(f.db).toEqual(before); expect(f.redis.lpush.mock.calls).toHaveLength(dispatchCount);
  });

  it('refuses every concurrent new client key instead of allocating another task or charge', async () => {
    const f = await failedIndependent(); const before = structuredClone(f.db);
    const outcomes = await Promise.allSettled([retryHermesGeneration(f.deps, f.input),
      retryHermesGeneration(f.deps, { ...f.input, idempotencyKey: 'other-key' })]);
    expect(outcomes.every(outcome => outcome.status === 'rejected')).toBe(true);
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
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

  it('keeps an already saved accepted Web result immutable during retired recovery', async () => {
    const f = await failedIndependent();
    const task = f.root; task.status = 'succeeded'; task.executionAttempt = 1;
    task.result = { ...structuredClone(f.anchorResult), scientificReview: { ...structuredClone(f.anchorResult.scientificReview),
      kind: 'independent_review', contractVersion: '5', sourceAgentTaskId: f.ids.anchor,
      reviewedCandidateHash: f.failedResult.scientificReview.reviewedCandidateHash,
      provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro' },
      reviewedClaimSuggestions: [{ clientKey: 'c1', sourceField: 'method', kind: 'core', statement: 'Reviewed method',
        conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] };
    f.db.ingestionTasks[0].state = 'needs_review';
    const before = structuredClone(f.db);
    expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined();
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });
});

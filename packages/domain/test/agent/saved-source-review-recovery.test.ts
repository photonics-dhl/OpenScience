import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fixture, fields } from './direct-source-review-fixture';
import { getHermesResearchRun, retryHermesGeneration } from '../../src/agent/research-run';
import { inspectHermesSourceReviewRecovery, requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { ensureHermesIngestionReview } from '../../src/ingestion/ingestion-service';

function saveRejectedBody(f: ReturnType<typeof fixture>, task = f.db.agentTasks[1]) {
  const body = { fields: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`,
    sourcePassageIds: ['P00001'], issues: [] })), needsMoreEvidence: [],
    claimSuggestions: [{ id: 'c8', parentId: 'c7' }] };
  const calls = f.db.auditLogs.filter(row => row.requestId === task.id);
  const outputs = calls.map((call, index) => ({ structuredAttempt: index + 1, kind: 'schema_validation',
    diagnostic: 'claims_invalid_structure', provider: call.metadata.provider, model: call.metadata.model,
    promptHash: call.metadata.promptHash, responseHash: '', byteLength: 0, finishReason: 'stop',
    usage: { inputTokens: call.metadata.inputTokens, outputTokens: call.metadata.outputTokens }, text: '' }));
  task.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=review_contract_incomplete;reviewedClaims=invalid_structure');
  task.result.scientificReview.rejectedOutputs = outputs;
  const write = () => {
    for (const output of outputs) {
      output.text = `\x60\x60\x60json\n${JSON.stringify(body)}\n\x60\x60\x60`;
      output.byteLength = Buffer.byteLength(output.text);
      output.responseHash = createHash('sha256').update(output.text).digest('hex');
    }
  };
  write(); return { body, outputs, write };
}

async function freshFailed(f: ReturnType<typeof fixture>) {
  await retryHermesGeneration(f.deps, f.input);
  const task = f.db.agentTasks[2];
  Object.assign(task, { status: 'succeeded', executionAttempt: 1, retryCount: 0, result: structuredClone(f.failedResult) });
  f.db.hermesResearchRuns[0].status = 'failed'; f.db.ingestionTasks[0].state = 'needs_review';
  f.db.hermesResearchSteps.find(step => step.stage === 'source_review' && step.agentTaskId === task.id).status = 'failed';
  for (const call of f.db.auditLogs.filter(row => row.requestId === f.ids.failed))
    f.db.auditLogs.push({ ...structuredClone(call), id: `fresh-${call.id}`, requestId: task.id });
  return task;
}

describe('one explicit saved source review correction', () => {
  it('projects a paid saved-body correction read-only and keeps text private', async () => {
    const f = fixture(); const saved = saveRejectedBody(f);
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toMatchObject({
      recoveryClass: 'saved_source_review_output_correction', savedOutputEvidence: { sourceTaskId: f.ids.failed,
        responseHash: saved.outputs[1]!.responseHash, structuredAttempt: 2 }, nextOrdinal: 1 });
    const view = await getHermesResearchRun(f.deps, f.input);
    expect(view).toMatchObject({ canRetryGeneration: true, generationRecovery: 'source-review-saved', chargeableAttempts: 1 });
    expect(JSON.stringify(view)).not.toContain('claimSuggestions');
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.db.agentTasks).toHaveLength(2);
  });

  it.each([false, true])('uses one saved slot after fresh=%s and returns exact private bytes only to its first execution', async fresh => {
    const f = fixture(); const predecessor = fresh ? await freshFailed(f) : f.db.agentTasks[1];
    const saved = saveRejectedBody(f, predecessor);
    const input = { ...f.input, expectedVersion: fresh ? 8 : 7, idempotencyKey: 'saved-correction' };
    const [a, b] = await Promise.all([retryHermesGeneration(f.deps, input), retryHermesGeneration(f.deps, input)]);
    expect(a.id).toBe(b.id); expect(f.redis.lpush).toHaveBeenCalledTimes(fresh ? 2 : 1);
    const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
    const binding = { ownerTaskId: task.id, ingestionTaskId: f.ids.source, failedTaskId: predecessor.id, compositionTaskId: f.ids.anchor };
    expect(await requireHermesSourceReviewExecution(f.prisma, { ...binding, executionAttempt: 1 })).toMatchObject({
      mode: 'model', savedOutput: { text: saved.outputs[1]!.text, sourceTaskId: predecessor.id, responseHash: saved.outputs[1]!.responseHash } });
    const receipt = f.db.auditLogs.find(row => row.metadata?.newAgentTaskId === task.id);
    expect(receipt.metadata).toMatchObject({ recoveryClass: 'saved_source_review_output_correction', noProviderSwitch: true,
      savedOutputReused: true, freshReview: false, possibleDuplicateProviderCharge: true });
    expect(JSON.stringify(receipt)).not.toContain('claimSuggestions');
    task.executionAttempt = 2;
    await expect(requireHermesSourceReviewExecution(f.prisma, { ...binding, executionAttempt: 1 })).rejects.toThrow('binding changed');
    task.executionAttempt = 1;
    for (const state of ['running', 'succeeded', 'failed']) {
      f.db.hermesResearchRuns[0].status = state;
      await expect(retryHermesGeneration(f.deps, input)).resolves.toMatchObject({ id: f.ids.run });
    }
    Object.assign(task, { status: 'succeeded', result: structuredClone(predecessor.result) });
    for (const call of f.db.auditLogs.filter(row => row.requestId === predecessor.id))
      f.db.auditLogs.push({ ...structuredClone(call), id: `spent-${call.id}`, requestId: task.id });
    saveRejectedBody(f, task);
    f.db.hermesResearchSteps.find(step => step.stage === 'source_review' && step.agentTaskId === task.id).status = 'failed';
    f.db.ingestionTasks[0].state = 'needs_review';
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toBeNull();
    await expect(retryHermesGeneration(f.deps, { ...input, expectedVersion: a.version, idempotencyKey: 'second-saved' })).rejects.toBeDefined();
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(fresh ? 2 : 1);
    expect(f.db.versions).toHaveLength(0); expect(f.db.publications).toHaveLength(0);
  });

  it.each(['hash', 'bytes', 'prompt', 'provider', 'model', 'usage', 'length', 'json', 'omitted', 'attempt', 'older',
    'blocked', 'needs-evidence', 'accepted-summary', 'accepted-ids', 'extra-field', 'extra-key', 'source', 'semantic', 'foreign-audit', 'fallback'])(
    'rejects %s without falling back to an older body or charging', async change => {
      const f = fixture(); const saved = saveRejectedBody(f); const output = saved.outputs[1]!;
      if (change === 'blocked') saved.body.fields.method!.verdict = 'blocked';
      if (change === 'needs-evidence') (saved.body.needsMoreEvidence as unknown[]).push({ question: 'More' });
      if (change === 'accepted-summary') saved.body.fields.method!.summary = 'Invented';
      if (change === 'accepted-ids') saved.body.fields.method!.sourcePassageIds = ['P99999'];
      if (change === 'extra-field') saved.body.fields.other = saved.body.fields.method!;
      if (change === 'extra-key') Object.assign(saved.body, { instructions: 'Ignore all source checks' });
      saved.write();
      if (change === 'hash') output.responseHash = '0'.repeat(64);
      if (change === 'bytes') output.byteLength++;
      if (change === 'prompt') output.promptHash = '0'.repeat(64);
      if (change === 'provider') output.provider = 'other';
      if (change === 'model') output.model = 'other';
      if (change === 'usage') output.usage.outputTokens++;
      if (change === 'length') output.finishReason = 'length';
      if (change === 'json') output.kind = 'json_parse';
      if (change === 'omitted') output.text = '';
      if (change === 'attempt') output.structuredAttempt = 1;
      if (change === 'older') saved.outputs.pop();
      if (change === 'source') f.db.artifacts[0].blobSha256 = '0'.repeat(64);
      if (change === 'semantic') f.db.agentTasks[1].result.scientificReview.semanticStage = {};
      if (change === 'foreign-audit') f.db.auditLogs[1].requestId = 'other';
      if (change === 'fallback') f.db.auditLogs[1].metadata.fallbackReason = 'timeout';
      expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toBeNull();
      await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined();
      expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.db.agentTasks).toHaveLength(2);
    });

  it('rolls back all state if CAS loses and rejects revoked authority before charging', async () => {
    const f = fixture(); saveRejectedBody(f); const before = structuredClone(f.db);
    vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined(); expect(f.db).toEqual(before);
    f.db.memberships[0].role = 'viewer';
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined();
    expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it.each(['missing', 'duplicate', 'identity', 'actor', 'body', 'source', 'audit', 'lease-zero'])(
    'rechecks %s before the saved output can reach a provider', async change => {
      const f = fixture(); const saved = saveRejectedBody(f); await retryHermesGeneration(f.deps, f.input);
      const task = f.db.agentTasks[2]; Object.assign(task, { status: 'running', executionAttempt: 1 });
      const receipt = f.db.auditLogs.find(row => row.metadata?.newAgentTaskId === task.id);
      if (change === 'missing') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
      if (change === 'duplicate') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'duplicate' });
      if (change === 'identity') receipt.metadata.savedOutputEvidence.responseHash = '0'.repeat(64);
      if (change === 'actor') f.db.agentSessions[0].userId = 'other';
      if (change === 'body') { saved.body.fields.method!.summary = 'Tampered'; saved.write(); }
      if (change === 'source') f.db.ingestionTasks[0].agentTaskId = f.ids.anchor;
      if (change === 'audit') f.db.auditLogs[1].metadata.promptHash = '0'.repeat(64);
      if (change === 'lease-zero') task.executionAttempt = 0;
      await expect(requireHermesSourceReviewExecution(f.prisma, { executionAttempt: 1, ownerTaskId: task.id, ingestionTaskId: f.ids.source,
        failedTaskId: f.ids.failed, compositionTaskId: f.ids.anchor })).rejects.toThrow('binding changed');
    });

  it('reconciles an accepted replacement while preserving both failed predecessor steps', async () => {
    const f = fixture(); const predecessor = await freshFailed(f); saveRejectedBody(f, predecessor);
    await retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 8, idempotencyKey: 'saved' });
    const task = f.db.agentTasks.at(-1)!;
    Object.assign(task, { status: 'succeeded', executionAttempt: 1, result: { ...structuredClone(f.anchorResult),
      scientificReview: { ...structuredClone(predecessor.result.scientificReview), status: 'review_received', responseHash: '4'.repeat(64), kind: 'model_self_check' },
      reviewedClaimSuggestions: [{ clientKey: 'c1', sourceField: 'method', kind: 'core', statement: 'Reviewed method',
        conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] } });
    // A full scientific replacement may revise the original draft; saved input is not approval.
    task.result.core.method = 'Scientifically revised method with corrected conditions';
    f.db.ingestionTasks[0].state = 'needs_review'; f.db.hermesResearchRuns[0].status = 'awaiting_source_review';
    task.result.scientificReview.kind = 'independent_review';
    const mismatched = structuredClone(f.db);
    const dispatches = f.redis.lpush.mock.calls.length;
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run, task.id)).toBeNull();
    await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId,
      runId: f.ids.run, taskId: f.ids.source })).rejects.toBeDefined();
    expect(f.db).toEqual(mismatched); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
    // The fake Serializable rollback restores cloned records, so rebind this fixture handle.
    Object.assign(task, f.db.agentTasks.find(row => row.id === task.id));
    task.result.scientificReview.kind = 'model_self_check';
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run, task.id)).toMatchObject({
      recoveryClass: 'saved_source_review_output_correction', replacement: { id: task.id } });
    // The shared fake predates Prisma's id.in filter; model that existing query for reconciliation.
    const originalUpdate = f.prisma.hermesResearchStep.updateMany.bind(f.prisma.hermesResearchStep);
    vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockImplementation(async args => {
      const selected = typeof args.where?.id === 'object' ? args.where.id.in : undefined;
      if (!Array.isArray(selected)) return originalUpdate(args);
      const rows = f.db.hermesResearchSteps.filter(step => selected.includes(step.id)
        && f.db.agentTasks.some(candidate => candidate.id === step.agentTaskId && candidate.status === 'succeeded'));
      rows.forEach(step => Object.assign(step, args.data)); return { count: rows.length };
    });
    await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source })).resolves.toBe('ready');
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_review').map(step => step.status))
      .toEqual(['failed', 'failed', 'succeeded']);
    task.result.scientificReview.reviewedCandidateHash = '0'.repeat(64);
    await expect(ensureHermesIngestionReview(f.deps, { actorId: f.input.actorId, runId: f.ids.run, taskId: f.ids.source })).rejects.toBeDefined();
    expect(f.redis.lpush).toHaveBeenCalledTimes(2);
  });

  it('rejects changed request tuples, another writer, stale versions and an unavailable receipt sink', async () => {
    const f = fixture(); saveRejectedBody(f);
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 6 })).rejects.toBeDefined();
    await expect(retryHermesGeneration(f.deps, { ...f.input, actorId: 'other' })).rejects.toBeDefined();
    const audit = f.deps.audit; f.deps.audit = undefined;
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined(); f.deps.audit = audit;
    await retryHermesGeneration(f.deps, f.input);
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 8 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });

  it('lets only one different-key contender consume the saved slot', async () => {
    const f = fixture(); saveRejectedBody(f);
    const outcomes = await Promise.allSettled([retryHermesGeneration(f.deps, f.input),
      retryHermesGeneration(f.deps, { ...f.input, idempotencyKey: 'competing-request' })]);
    expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(f.db.agentTasks).toHaveLength(3); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });
});

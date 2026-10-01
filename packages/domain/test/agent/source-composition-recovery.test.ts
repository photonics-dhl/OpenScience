import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { getHermesResearchRun, retryHermesGeneration, reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { ensureHermesIngestionReview, reanalyzeConfirmedIngestion } from '../../src/ingestion/ingestion-service';
import { requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { inspectHermesSourceCompositionRecovery } from '../../src/ingestion/source-composition-recovery';
import { sourceCompositionRecoveryFixture, sourceCompositionCandidate as candidate, sourceReviewPacketFailureFixture, sourceSavedCompositionFixture as savedCompositionFixture } from './source-composition-recovery-fixture';
import { claimAgentTask, markTaskProgress } from '../../src/agent/agent';
import { requireHermesSourceCompositionRecoveryExecution } from '../../src/ingestion/source-composition-recovery';

async function claimedRecovery() {
  const f = await sourceCompositionRecoveryFixture(); await retryHermesGeneration(f.deps, f.recoveryInput);
  const id = f.db.agentTasks.at(-1)!.id; await claimAgentTask(f.deps, id);
  const owner = f.db.agentTasks.find(row => row.id === id)!;
  owner.result = { sourceMapRef: structuredClone(f.reference) };
  return { ...f, owner, executionInput: { ownerTaskId: id, ingestionTaskId: f.source.id, sourceAgentTaskId: f.failed.id, executionAttempt: 1 } };
}


async function failedPacketIndependent() {
  const f = await sourceReviewPacketFailureFixture(); await retryHermesGeneration(f.deps, f.packetInput);
  const root = f.db.agentTasks.at(-1)!;
  Object.assign(root, { status: 'succeeded', executionAttempt: 1, result: structuredClone(f.review.result) });
  Object.assign(root.result.scientificReview, { status: 'blocked_scientific_review', attemptId: '22222222-2222-5222-8222-222222222222' });
  for (const key of Object.keys(root.result.fieldDiagnosticsDetails)) root.result.fieldDiagnosticsDetails[key] = 'scientificReview=unavailable';
  f.db.auditLogs.push({ id: 'packet-web-call', action: 'ai.gateway.call', requestId: root.id, actorId: null, targetType: 'ai_gateway',
    metadata: { operation: 'scientific_review', outcome: 'failed', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
      promptHash: 'c'.repeat(64), inputContentHash: f.reference.contentHash, fallbackReason: null, retryCount: 0, error: 'scientific_review_failed' } });
  f.db.ingestionTasks.find(row => row.id === f.source.id)!.state = 'needs_review';
  f.db.hermesResearchSteps.find(row => row.agentTaskId === root.id && row.stage === 'source_review')!.status = 'failed';
  f.db.hermesResearchRuns.find(row => row.id === f.run.id)!.status = 'failed';
  const verifier = vi.fn(async () => true);
  return { ...f, root, verifier, deps: { ...f.deps, canRetrySourceReviewBeforeSubmission: verifier },
    technicalInput: { ...f.packetInput, expectedVersion: f.db.hermesResearchRuns.find(row => row.id === f.run.id)!.version,
      idempotencyKey: 'packet-technical-successor' } };
}

describe('same-run final source composition recovery', () => {
  it('reviews a proven paid composition once without rerunning composition or rewriting failed science', async () => {
    const f = await savedCompositionFixture(); const before = structuredClone(f.owner);
    const compositions = structuredClone(f.db.hermesResearchSteps.filter(step => step.runId === f.run.id && step.stage === 'source_composition'));
    const tasks = f.db.agentTasks.length; const debits = f.db.usageLedger.length;
    expect(await getHermesResearchRun(f.deps, f.resumeInput)).toMatchObject({ generationRecovery: 'source-review-fresh', chargeableAttempts: 1 });
    await retryHermesGeneration(f.deps, f.resumeInput);
    expect(f.db.agentTasks).toHaveLength(tasks + 1); expect(f.db.usageLedger).toHaveLength(debits + 1);
    const review = f.db.agentTasks.at(-1)!;
    expect(f.db.hermesResearchSteps.filter(step => step.runId === f.run.id && step.stage === 'source_review')).toMatchObject([{ ordinal: 0, agentTaskId: review.id }]);
    expect(f.owner).toEqual(before);
    for (const step of compositions) expect(f.db.hermesResearchSteps.find(row => row.id === step.id)).toEqual(step);
    const after = structuredClone(f.db.usageLedger);
    await retryHermesGeneration(f.deps, f.resumeInput);
    await retryHermesGeneration(f.deps, { ...f.resumeInput, idempotencyKey: 'another-tab-saved-composition-review' });
    expect(f.db.agentTasks).toHaveLength(tasks + 1); expect(f.db.usageLedger).toEqual(after);
    await claimAgentTask(f.deps, review.id);
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: review.id, ingestionTaskId: f.source.id,
      failedTaskId: f.owner.id, compositionTaskId: f.owner.id, executionAttempt: 1 }))
      .toMatchObject({ mode: 'model', savedCompositionCandidate: { responseHash: f.output.responseHash,
        structuredAttempt: 2, providerAuditId: 'saved-paid-compose-audit' }, nativeSourceReview: { taskId: review.id } });
  });
  it.each(['raw', 'hash', 'ordinal', 'audit-missing', 'audit-extra', 'audit-order', 'audit-usage', 'audit-model', 'audit-actor', 'audit-target',
    'unknown-reference', 'claim-parent', 'summary-cap', 'saved-stage', 'non-pdf'] as const)(
    'denies changed paid candidate before creating or charging review (%s)', async change => {
      const f = await savedCompositionFixture();
      const last = f.owner.result.scientificReview.rejectedOutputs[1];
      const audit = f.db.auditLogs.find(row => row.id === 'saved-paid-compose-audit')!;
      if (change === 'raw') last.text += ' ';
      if (change === 'hash') last.responseHash = '0'.repeat(64);
      if (change === 'ordinal') last.structuredAttempt = 1;
      if (change === 'audit-missing') f.db.auditLogs.splice(f.db.auditLogs.indexOf(audit), 1);
      if (change === 'audit-extra') f.db.auditLogs.push({ ...structuredClone(audit), id: 'extra-paid-audit' });
      if (change === 'audit-order') audit.createdAt = new Date(0);
      if (change === 'audit-usage') audit.metadata.outputTokens += 1;
      if (change === 'audit-model') audit.metadata.model = 'other';
      if (change === 'audit-actor') audit.actorId = f.input.userId;
      if (change === 'audit-target') audit.targetType = 'other';
      if (change === 'non-pdf') Object.assign(f.db.artifacts.find(row => row.id === f.source.artifactId)!,
        { mimeType: 'text/plain', logicalPath: 'source.txt' });
      if (change === 'saved-stage') f.owner.result.scientificReview.semanticStage.passageBindings[0].sourcePassageIds = ['P99999'];
      if (['unknown-reference', 'claim-parent', 'summary-cap'].includes(change)) {
        const parsed = JSON.parse(last.text);
        if (change === 'unknown-reference') parsed.draftClaims[0].sourceBindings[0].sourcePassageId = 'P99999';
        if (change === 'claim-parent') parsed.draftClaims[0].kind = 'boundary';
        if (change === 'summary-cap') parsed.fields.results.summary = 'x'.repeat(4001);
        last.text = JSON.stringify(parsed); last.byteLength = Buffer.byteLength(last.text);
        last.responseHash = createHash('sha256').update(last.text).digest('hex');
      }
      const tasks = f.db.agentTasks.length; const debits = structuredClone(f.db.usageLedger); const dispatch = f.redis.lpush.mock.calls.length;
      expect((await getHermesResearchRun(f.deps, f.resumeInput)).canRetryGeneration).not.toBe(true);
      await expect(retryHermesGeneration(f.deps, f.resumeInput)).rejects.toBeDefined();
      expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toEqual(debits);
      expect(f.redis.lpush).toHaveBeenCalledTimes(dispatch);
    });

  it.each(['audit-sink', 'presentation-writer'] as const)('blocks unavailable continuation prerequisites before charging (%s)', async change => {
    const f = await savedCompositionFixture(); const tasks = f.db.agentTasks.length; const ledger = structuredClone(f.db.usageLedger);
    const deps = change === 'audit-sink' ? { ...f.deps, audit: undefined } : f.deps;
    if (change === 'presentation-writer') Object.assign(f.prisma.agentTask, { count: async () => 1 });
    await expect(retryHermesGeneration(deps, f.resumeInput)).rejects.toBeDefined();
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toEqual(ledger);
  });

  it.each(['missing', 'amount', 'actor', 'policy'] as const)('revalidates the new review reservation before native execution (%s)', async change => {
    const f = await savedCompositionFixture(); await retryHermesGeneration(f.deps, f.resumeInput);
    const review = f.db.agentTasks.at(-1)!; await claimAgentTask(f.deps, review.id);
    const debit = f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${review.id}`)!;
    if (change === 'missing') f.db.usageLedger.splice(f.db.usageLedger.indexOf(debit), 1);
    if (change === 'amount') debit.delta = -2n;
    if (change === 'actor') debit.userId = 'other';
    if (change === 'policy') debit.metadata = { ...debit.metadata, policy: 'other' };
    await expect(requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: review.id, ingestionTaskId: f.source.id,
      failedTaskId: f.owner.id, compositionTaskId: f.owner.id, executionAttempt: 1 })).rejects.toThrow('[blocked]');
  });

  it('advances only the completed native review while preserving both failed composition phases', async () => {
    const f = await savedCompositionFixture(); await retryHermesGeneration(f.deps, f.resumeInput);
    const review = f.db.agentTasks.at(-1)!;
    review.status = 'succeeded'; review.result = candidate(f);
    Object.assign(review.result.scientificReview, { contractVersion: '5', sourceAgentTaskId: f.owner.id });
    review.result.reviewedClaimSuggestions = [{ ...review.result.scientificReview.draftClaims[0],
      sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }];
    f.db.ingestionTasks.find(row => row.id === f.source.id)!.state = 'needs_review';
    expect(await ensureHermesIngestionReview(f.deps, { actorId: f.run.actorId, runId: f.run.id, taskId: f.source.id })).toBe('ready');
    expect(f.db.hermesResearchSteps.filter(step => step.runId === f.run.id && step.stage === 'source_composition')
      .map(step => step.status)).toEqual(['failed', 'failed']);
    expect(f.db.hermesResearchSteps.find(step => step.runId === f.run.id && step.stage === 'source_review')!.status).toBe('succeeded');
  });

  it('recovers a lost review receipt after later progress without granting another composition or review', async () => {
    const f = await savedCompositionFixture(); await retryHermesGeneration(f.deps, f.resumeInput);
    const review = f.db.agentTasks.at(-1)!;
    review.status = 'succeeded'; review.result = candidate(f);
    Object.assign(review.result.scientificReview, { contractVersion: '5', sourceAgentTaskId: f.owner.id });
    f.run.status = 'awaiting_claim_review'; f.run.versionId = '00000000-0000-4000-8000-000000009999';
    const tasks = f.db.agentTasks.length; const ledger = structuredClone(f.db.usageLedger);
    await retryHermesGeneration(f.deps, { ...f.resumeInput, idempotencyKey: 'lost-saved-review-later' });
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toEqual(ledger);
    await expect(requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: review.id, ingestionTaskId: f.source.id,
      failedTaskId: f.owner.id, compositionTaskId: f.owner.id, executionAttempt: 1 })).rejects.toThrow('[blocked]');
  });
  it('does not charge or offer the legacy packet recovery after compact formatting also exceeded the bound', async () => {
    const f = await sourceReviewPacketFailureFixture();
    for (const key of Object.keys(f.review.result.fieldDiagnosticsDetails))
      f.review.result.fieldDiagnosticsDetails[key] = 'scientificReview=required_review_context_too_large;compact_packet_exhausted';
    const tasks = f.db.agentTasks.length; const ledger = structuredClone(f.db.usageLedger);
    expect((await getHermesResearchRun(f.deps, f.packetInput)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps, f.packetInput)).rejects.toThrow();
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toEqual(ledger);
  });

  it('recognizes the paid packet continuation as the same independent intent for its one positively verified technical successor', async () => {
    const f = await failedPacketIndependent(); const ledger = structuredClone(f.db.usageLedger);
    expect(await getHermesResearchRun(f.deps, f.technicalInput)).toMatchObject({
      generationRecovery: 'source-review-not-submitted', chargeableAttempts: 0 });
    await retryHermesGeneration(f.deps, f.technicalInput); expect(f.db.usageLedger).toEqual(ledger);
    const owner = f.db.agentTasks.at(-1)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: owner.id, ingestionTaskId: f.source.id,
      failedTaskId: f.root.id, compositionTaskId: f.composition.id, executionAttempt: 1 })).toMatchObject({
      mode: 'web', notSubmittedRecovery: { requestId: f.root.result.scientificReview.attemptId, promptHash: 'c'.repeat(64) } });
    await retryHermesGeneration(f.deps, f.technicalInput); expect(f.db.usageLedger).toEqual(ledger);
  });

  it.each(['bound-proof', 'credit-policy', 'chargeable', 'intent-owner', 'route', 'digest', 'request-key'])(
    'rejects a changed technical packet receipt (%s) before provider authorization', async change => {
      const f = await failedPacketIndependent(); await retryHermesGeneration(f.deps, f.technicalInput);
      const owner = f.db.agentTasks.at(-1)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
      const receipt = f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_recovery' && row.metadata.newAgentTaskId === owner.id)!;
      if (change === 'bound-proof') receipt.metadata.notSubmittedRecovery.input.promptHash = 'd'.repeat(64);
      if (change === 'credit-policy') receipt.metadata.creditPolicy = 'free';
      if (change === 'chargeable') receipt.metadata.chargeableAttempts = 1;
      if (change === 'intent-owner') receipt.metadata.independentIntentTaskId = f.review.id;
      if (change === 'route') receipt.metadata.reviewModel = 'MiniMax-M3';
      if (change === 'digest') receipt.metadata.requestDigest = 'invalid';
      if (change === 'request-key') receipt.metadata.clientIdempotencyKey = '';
      await expect(requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: owner.id, ingestionTaskId: f.source.id,
        failedTaskId: f.root.id, compositionTaskId: f.composition.id, executionAttempt: 1 })).rejects.toThrow('[blocked]');
    });

  it('rejects a paid packet recovery receipt moved to another workspace', async () => {
    const f = await sourceReviewPacketFailureFixture(); await retryHermesGeneration(f.deps, f.packetInput);
    const owner = f.db.agentTasks.at(-1)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
    f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_recovery' && row.metadata.newAgentTaskId === owner.id)!.workspaceId = 'other';
    await expect(requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: owner.id, ingestionTaskId: f.source.id,
      failedTaskId: f.review.id, compositionTaskId: f.composition.id, executionAttempt: 1 })).rejects.toThrow('[blocked]');
  });

  it('continues an exact initial local packet overflow with one paid web review and preserves the failed rows', async () => {
    const f = await sourceReviewPacketFailureFixture();
    const oldReview = structuredClone(f.review); const failedSteps = structuredClone(f.db.hermesResearchSteps.filter(row => row.runId === f.run.id && row.status === 'failed'));
    const tasks = f.db.agentTasks.length; const debits = f.db.usageLedger.length;
    expect(await getHermesResearchRun(f.deps, f.packetInput)).toMatchObject({
      canRetryGeneration: true, generationRecovery: 'source-review-independent', chargeableAttempts: 1 });
    await retryHermesGeneration(f.deps, f.packetInput);
    const owner = f.db.agentTasks.at(-1)!;
    expect(f.db.agentTasks).toHaveLength(tasks + 1); expect(f.db.usageLedger).toHaveLength(debits + 1);
    expect(f.review).toEqual(oldReview);
    for (const row of failedSteps) expect(f.db.hermesResearchSteps.find(step => step.id === row.id)).toEqual(row);
    expect(f.db.auditLogs.at(-1)!.metadata).toMatchObject({ recoveryClass: 'independent_source_review_packet_overflow', reviewMode: 'web' });
    const after = structuredClone(f.db.usageLedger); const dispatches = f.redis.lpush.mock.calls.length;
    await retryHermesGeneration(f.deps, f.packetInput);
    expect(f.db.usageLedger).toEqual(after); expect(f.redis.lpush).toHaveBeenCalledTimes(dispatches);
    Object.assign(owner, { status: 'running', executionAttempt: 1 });
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: owner.id, ingestionTaskId: f.source.id,
      failedTaskId: f.review.id, compositionTaskId: f.composition.id, executionAttempt: 1 })).toMatchObject({ mode: 'web' });
  });

  it.each(['receipt-missing', 'receipt-duplicate', 'receipt-actor', 'receipt-run', 'receipt-policy', 'receipt-map', 'receipt-charge',
    'receipt-parent', 'provider-call', 'prompt', 'response', 'usage', 'evidence-output', 'wrong-diagnostic', 'partial-diagnostic',
    'changed-summary', 'changed-ids', 'changed-source', 'changed-map', 'changed-stage', 'public-core', 'public-evidence',
    'review-status', 'wrong-route', 'debit', 'owner-lease', 'pointer', 'scope'])(
    'denies packet continuation after %s without adding a task or debit', async change => {
      const f = await sourceReviewPacketFailureFixture(); const result = f.review.result;
      const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh' && row.metadata.newAgentTaskId === f.review.id)!;
      if (change === 'receipt-missing') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
      if (change === 'receipt-duplicate') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'duplicate-initial' });
      if (change === 'receipt-actor') receipt.actorId = f.input.userId;
      if (change === 'receipt-run') receipt.metadata.runId = f.ids.run;
      if (change === 'receipt-policy') receipt.metadata.policy = 'scientific_review_v4_correction';
      if (change === 'receipt-map') receipt.metadata.sourceMapSha256 = '9'.repeat(64);
      if (change === 'receipt-charge') receipt.metadata.creditPolicy = 'free';
      if (change === 'receipt-parent') receipt.metadata.oldAgentTaskId = f.failed.id;
      if (change === 'provider-call') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'unexpected-call', action: 'ai.gateway.call', requestId: f.review.id });
      if (change === 'prompt') result.scientificReview.promptHash = 'e'.repeat(64);
      if (change === 'response') result.scientificReview.responseHash = 'e'.repeat(64);
      if (change === 'usage') result.scientificReview.usage = { inputTokens: 1, outputTokens: 1 };
      if (change === 'evidence-output') result.scientificReview.needsMoreEvidence = [];
      if (change === 'wrong-diagnostic') for (const key of Object.keys(result.fieldDiagnosticsDetails)) result.fieldDiagnosticsDetails[key] = 'scientificReview=invalid_response';
      if (change === 'partial-diagnostic') result.fieldDiagnosticsDetails.method = 'scientificReview=invalid_response';
      if (change === 'changed-summary') result.unverifiedSummaries.method += 'Changed';
      if (change === 'changed-ids') result.unverifiedSourcePassageIds.method = ['P00002'];
      if (change === 'changed-source') result.scientificReview.sourceAgentTaskId = f.failed.id;
      if (change === 'changed-map') result.sourceMapRef.serializedSha256 = 'e'.repeat(64);
      if (change === 'changed-stage') result.scientificReview.semanticStage.reduction.chosenRepresentativeCase = 'Different case';
      if (change === 'public-core') result.core.method = 'Unreviewed';
      if (change === 'public-evidence') result.evidence.method.quote = 'Unreviewed';
      if (change === 'review-status') result.scientificReview.status = 'review_received';
      if (change === 'wrong-route') result.scientificReview.model = 'MiniMax-M3';
      if (change === 'debit') f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${f.review.id}`)!.delta = 0n;
      if (change === 'owner-lease') f.review.executionAttempt = 2;
      if (change === 'pointer') f.source.agentTaskId = f.composition.id;
      if (change === 'scope') f.db.agentSessions.find(row => row.id === f.review.sessionId)!.userId = 'another';
      const tasks = f.db.agentTasks.length; const debits = f.db.usageLedger.length;
      expect((await getHermesResearchRun(f.deps, f.packetInput)).canRetryGeneration).not.toBe(true);
      await expect(retryHermesGeneration(f.deps, f.packetInput)).rejects.toThrow();
      expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toHaveLength(debits);
    });

  it('rejects changed packet recovery evidence and a second client key while retaining the same paid intent', async () => {
    const f = await sourceReviewPacketFailureFixture(); await retryHermesGeneration(f.deps, f.packetInput);
    const owner = f.db.agentTasks.at(-1)!; Object.assign(owner, { status: 'running', executionAttempt: 1 });
    const input = { ownerTaskId: owner.id, ingestionTaskId: f.source.id, failedTaskId: f.review.id,
      compositionTaskId: f.composition.id, executionAttempt: 1 };
    const receipt = f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_recovery' && row.metadata.newAgentTaskId === owner.id)!;
    const tasks = f.db.agentTasks.length; const debits = f.db.usageLedger.length;
    await expect(retryHermesGeneration(f.deps, { ...f.packetInput, idempotencyKey: 'second-key' })).rejects.toThrow();
    expect(f.db.agentTasks).toHaveLength(tasks); expect(f.db.usageLedger).toHaveLength(debits);
    f.db.auditLogs.find(row => row.id === receipt.id)!.metadata.packetFailureEvidence.reviewedCandidateHash = 'e'.repeat(64);
    await expect(requireHermesSourceReviewExecution(f.prisma, input)).rejects.toThrow('[blocked]');
  });

  it('reconciles a completed packet continuation into the existing ready review, preserving original diagnostics', async () => {
    const f = await sourceReviewPacketFailureFixture(); const oldStep = structuredClone(f.db.hermesResearchSteps.find(row => row.agentTaskId === f.review.id && row.stage === 'source_review'));
    await retryHermesGeneration(f.deps, f.packetInput); const owner = f.db.agentTasks.at(-1)!;
    owner.status = 'succeeded'; owner.executionAttempt = 1;
    owner.result = { ...structuredClone(f.composition.result), scientificReview: { ...structuredClone(f.composition.result.scientificReview),
      kind: 'independent_review', contractVersion: '5', status: 'review_received', sourceAgentTaskId: f.composition.id,
      reviewedCandidateHash: f.review.result.scientificReview.reviewedCandidateHash, provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro' },
      reviewedClaimSuggestions: [{ clientKey: 'core', kind: 'core', sourceField: 'insight', statement: 'Reviewed contribution',
        conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] };
    f.source.state = 'needs_review';
    expect(await ensureHermesIngestionReview(f.deps, { actorId: f.input.userId, runId: f.run.id, taskId: f.source.id })).toBe('ready');
    expect(f.db.hermesResearchSteps.find(row => row.id === oldStep!.id)).toEqual(oldStep);
    const after = structuredClone(f.db.usageLedger); await retryHermesGeneration(f.deps, f.packetInput);
    expect(f.db.usageLedger).toEqual(after);
  });

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

  it('advances a valid final composition to the first Hermes model review without relabelling failed ordinal zero', async () => {
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
      .toMatchObject({ mode: 'model', nativeSourceReview: { taskId: review.id, maxAttempts: 2 } });
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-paid-tab-initial-review' }))
      .toMatchObject({ id: f.source.id, agentTaskId: review.id });
    review.status = 'succeeded';
    review.result = { ...structuredClone(result), scientificReview: { ...structuredClone(result.scientificReview),
      kind: 'model_self_check', contractVersion: '5', sourceAgentTaskId: composed.id,
      provider: 'primary', model: 'MiniMax-M3' },
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

  it.each([221, 4000])('stores complete %i-character private science without weakening reviewed Claims', async length => {
    const f = await claimedRecovery(); const result = candidate(f);
    result.core.method = '科'.repeat(length);
    expect(await markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 }))
      .toMatchObject({ status: 'succeeded' });
    expect(f.db.agentTasks.find(row => row.id === f.owner.id)!.result).toEqual(result);
    expect(result.reviewedClaimSuggestions).toBeUndefined();
  });

  it.each(['provided', 'unknown'] as const)('binds private draft references to the signed reading input (%s)', async scope => {
    const f = await claimedRecovery();
    f.failed.result.scientificReview.semanticStage.passageBindings[0]!.qualifierPassageIds = ['P00002'];
    const result = candidate(f);
    result.scientificReview.draftClaims[0]!.sourceBindings[0]!.sourcePassageId = scope === 'provided' ? 'P00002' : 'P99999';
    if (scope === 'provided') {
      await expect(markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 }))
        .resolves.toMatchObject({ status: 'succeeded' });
      expect(result.evidence.insight.locator).toBe('passages:P00001');
    } else {
      await expect(markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 }))
        .rejects.toBeDefined();
    }
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
      if (change === 'summary-length') result.core.method = 'x'.repeat(4001);
      if (change === 'candidate-hash') review.reviewedCandidateHash = 'e'.repeat(64);
      if (change === 'blocked-hash') Object.assign(result, structuredClone(f.failed.result), {
        scientificReview: { ...structuredClone(f.failed.result.scientificReview), reviewedCandidateHash: 'e'.repeat(64) },
      });
      await expect(markTaskProgress(f.deps, { taskId: f.owner.id, status: 'succeeded', result, expectedExecutionAttempt: 1 })).rejects.toBeDefined();
      expect(f.db.agentTasks.find(row => row.id === f.owner.id)!.status).not.toBe('succeeded');
    });
});

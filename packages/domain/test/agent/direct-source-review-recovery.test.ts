import { describe, expect, it, vi } from 'vitest';
import { fixture, fields } from './direct-source-review-fixture';
import { inspectHermesSourceReviewRecovery, requireHermesSourceReviewRecoveryBinding } from '../../src/ingestion/source-review-recovery';
import { getHermesResearchRun, retryHermesGeneration } from '../../src/agent/research-run';

describe('modern direct composition explicit source review recovery', () => {
  it('projects a paid fresh review without treating composition as scientific approval or dispatching on GET', async () => {
    const f = fixture();
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toMatchObject({
      recoveryClass: 'direct_composition_structured_review_failure', composition: { id: f.ids.anchor }, nextOrdinal: 1,
    });
    expect(await getHermesResearchRun(f.deps, f.input)).toMatchObject({ canRetryGeneration: true, chargeableAttempts: 1,
      generationRecovery: 'source-review-fresh' });
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.db.agentTasks).toHaveLength(2); expect(f.db.auditLogs).toHaveLength(2);
  });

  it('creates one fresh review of the original source atomically and replays without a second charge or dispatch', async () => {
    const f = fixture(); const original = structuredClone(f.db.agentTasks);
    const [first, replay] = await Promise.all([retryHermesGeneration(f.deps, f.input), retryHermesGeneration(f.deps, f.input)]);
    expect(first).toMatchObject({ status: 'running', version: 8, maxAgentTasks: 9 }); expect(replay.id).toBe(first.id);
    expect(f.db.agentTasks).toHaveLength(3); expect(f.db.agentTasks.slice(0, 2)).toEqual(original);
    expect(f.db.hermesResearchSteps.filter(step => step.stage === 'source_composition')).toHaveLength(0);
    const replacement = f.db.agentTasks[2];
    expect(replacement.idempotencyKey).toBe(`ingestion-analysis-compose:${f.ids.source}:${f.ids.failed}:${f.ids.anchor}:scientific-review-v4`);
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
    const receipt = f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_recovery');
    expect(receipt.metadata).toMatchObject({ recoveryClass: 'direct_composition_structured_review_failure', freshReview: true,
      savedOutputReused: false, possibleDuplicateProviderCharge: true, noProviderSwitch: true,
      compositionSourceAgentTaskId: f.ids.anchor, structuredReviewAuditIds: ['call-0', 'call-1'], chargeableAttempts: 1 });
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 8 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.db.versions).toHaveLength(0); expect(f.db.publications).toHaveLength(0);
  });

  it('revalidates the bound running replacement and never grants a second fresh review after another failure', async () => {
    const f = fixture(); await retryHermesGeneration(f.deps, f.input);
    const replacement = f.db.agentTasks[2]; replacement.status = 'running'; replacement.executionAttempt = 1;
    await expect(requireHermesSourceReviewRecoveryBinding(f.prisma, { ownerTaskId: replacement.id, ingestionTaskId: f.ids.source,
      failedTaskId: f.ids.failed, compositionTaskId: f.ids.anchor })).resolves.toBeUndefined();
    f.db.artifacts[0].blobSha256 = 'c'.repeat(64);
    await expect(requireHermesSourceReviewRecoveryBinding(f.prisma, { ownerTaskId: replacement.id, ingestionTaskId: f.ids.source,
      failedTaskId: f.ids.failed, compositionTaskId: f.ids.anchor })).rejects.toThrow('binding changed');
    f.db.artifacts[0].blobSha256 = 'a'.repeat(64);
    replacement.status = 'succeeded'; replacement.result = structuredClone(f.failedResult);
    f.db.ingestionTasks[0].state = 'needs_review'; f.db.hermesResearchRuns[0].status = 'failed';
    f.db.hermesResearchSteps.find(step => step.agentTaskId === replacement.id && step.stage === 'source_review').status = 'failed';
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toBeNull();
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 8, idempotencyKey: 'another-review' })).rejects.toBeDefined();
    expect(f.db.agentTasks).toHaveLength(3); expect(f.redis.lpush).toHaveBeenCalledTimes(1);
  });

  it('rolls back task, debit, source pointer and receipt when the run CAS loses', async () => {
    const f = fixture(); const before = structuredClone(f.db);
    vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toBeDefined();
    expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('rejects stale versions, revoked writers and missing durable audit before charging', async () => {
    for (const change of ['version', 'permission', 'audit']) {
      const f = fixture();
      if (change === 'version') f.input.expectedVersion = 6;
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      if (change === 'audit') f.deps.audit = undefined;
      await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: expect.any(String) });
      expect(f.db.agentTasks).toHaveLength(2); expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(0);
      expect(f.redis.lpush).not.toHaveBeenCalled();
    }
  });

  it.each(['missing', 'duplicate', 'source', 'saved-output'])(
    'rejects a %s recovery receipt before worker submission', async change => {
      const f = fixture(); await retryHermesGeneration(f.deps, f.input);
      const task = f.db.agentTasks[2]; task.status = 'running'; task.executionAttempt = 1;
      const receipt = f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_recovery');
      if (change === 'missing') f.db.auditLogs.splice(f.db.auditLogs.indexOf(receipt), 1);
      if (change === 'duplicate') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'duplicate' });
      if (change === 'source') receipt.metadata.compositionSourceAgentTaskId = f.ids.failed;
      if (change === 'saved-output') receipt.metadata.savedOutputReused = true;
      await expect(requireHermesSourceReviewRecoveryBinding(f.prisma, { ownerTaskId: task.id, ingestionTaskId: f.ids.source,
        failedTaskId: f.ids.failed, compositionTaskId: f.ids.anchor })).rejects.toThrow('binding changed');
    });

  it.each(['fallback', 'length', 'unknown', 'extra-call', 'missing-call', 'foreign-call', 'scientific-block', 'schema-other',
    'claims', 'saved-candidate', 'summary', 'passages', 'semantic', 'source-map', 'source-hash', 'actor', 'session',
    'payload', 'anchor-status', 'current-task', 'attempt', 'retry', 'grant', 'private-version', 'anchor-skill', 'review-skill',
    'primary-retry', 'provider', 'nonempty-core', 'presentation-task', 'published', 'step-not-failed'])(
    'rejects changed %s without exposing a fresh-review capability', async change => {
      const f = fixture(); const call = f.db.auditLogs[0]; const result = f.db.agentTasks[1].result;
      if (change === 'fallback') call.metadata.fallbackReason = 'provider_timeout';
      if (change === 'length') call.metadata.finishReason = 'length';
      if (change === 'unknown') call.metadata.outcome = 'unknown';
      if (change === 'extra-call') f.db.auditLogs.push({ ...call, id: 'extra' });
      if (change === 'missing-call') f.db.auditLogs.pop();
      if (change === 'foreign-call') call.requestId = 'other';
      if (change === 'scientific-block') result.scientificReview.fieldReviews = { method: { verdict: 'blocked' } };
      if (change === 'schema-other') result.fieldDiagnosticsDetails.method = 'scientificReview=SCHEMA_VALIDATION';
      if (change === 'claims') result.reviewedClaimSuggestions = [];
      if (change === 'saved-candidate') result.scientificReview.rejectedCandidates = [];
      if (change === 'summary') result.unverifiedSummaries.method = 'Changed';
      if (change === 'passages') result.unverifiedSourcePassageIds.method = ['P00002'];
      if (change === 'semantic') result.scientificReview.semanticStage = { kind: 'source_bridge' };
      if (change === 'source-map') result.sourceMapRef = { ...result.sourceMapRef, serializedSha256: 'd'.repeat(64) };
      if (change === 'source-hash') f.db.artifacts[0].blobSha256 = 'c'.repeat(64);
      if (change === 'actor') f.db.agentSessions[0].userId = 'other';
      if (change === 'session') f.db.agentSessions[0].deletedAt = new Date();
      if (change === 'payload') f.db.agentTasks[0].payload.researchObjectId = 'other';
      if (change === 'anchor-status') f.db.agentTasks[0].status = 'failed';
      if (change === 'current-task') f.db.ingestionTasks[0].agentTaskId = f.ids.anchor;
      if (change === 'attempt') f.db.agentTasks[1].executionAttempt = 2;
      if (change === 'retry') f.db.agentTasks[1].retryCount = 1;
      if (change === 'grant') f.db.hermesResearchRuns[0].maxAgentTasks = 11;
      if (change === 'private-version') f.db.hermesResearchRuns[0].versionId = 'saved';
      if (change === 'anchor-skill') f.db.agentTasks[0].result.scientificReview.compositionSkill.version = '1';
      if (change === 'review-skill') result.scientificReview.reviewSkill.version = '3';
      if (change === 'primary-retry') call.metadata.retryCount = 1;
      if (change === 'provider') call.metadata.provider = 'other-provider';
      if (change === 'nonempty-core') result.core.method = 'Unreviewed replacement';
      if (change === 'presentation-task') f.db.agentTasks.push({ kind: 'presentation.generate' });
      if (change === 'published') f.db.researchObjects[0].status = 'published';
      if (change === 'step-not-failed') f.db.hermesResearchSteps[1].status = 'waiting';
      expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toBeNull();
      expect(f.redis.lpush).not.toHaveBeenCalled();
    });

  it('does not expand the legacy composition path to JSON-invalid failures', async () => {
    const f = fixture(true);
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toBeNull();
  });

  it('preserves the existing legacy transport-failure recovery', async () => {
    const f = fixture(true); const result = f.db.agentTasks[1].result;
    result.fieldDiagnosticsDetails = fields(() => 'scientificReview=ALL_PROVIDERS_FAILED');
    for (const call of f.db.auditLogs) Object.assign(call.metadata, { outcome: 'failed', error: 'provider_timeout',
      finishReason: null, outputTokens: null, responseBlockCounts: null, promptHash: 'c'.repeat(64) });
    f.db.auditLogs.pop();
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toMatchObject({ recoveryClass: 'service_failure' });
  });

  it('preserves the legacy accepted-draft Claims-contract recovery without using it for modern JSON failures', async () => {
    const f = fixture(true); const result = f.db.agentTasks[1].result;
    for (const key of ['reason', 'fieldDiagnostics', 'fieldDiagnosticsDetails', 'unverifiedSummaries', 'unverifiedSourcePassageIds']) delete result[key];
    Object.assign(result, { core: f.anchorResult.core, evidence: f.anchorResult.evidence,
      evidenceSegments: f.anchorResult.evidenceSegments, needsMoreInformation: [] });
    Object.assign(result.scientificReview, { status: 'review_received', reviewSkill: { id: 'scientific-critical-thinking', version: '3' },
      needsMoreEvidence: [], fieldReviews: fields(field => ({ verdict: 'accepted', issues: [], summary: `Original ${field}`, sourcePassageIds: ['P00001'] })),
      provider: 'primary', model: 'MiniMax-M3', promptHash: '2'.repeat(64), responseHash: 'd'.repeat(64),
      finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 100 } });
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toMatchObject({ recoveryClass: 'accepted_review_claim_contract_missing' });
  });
});

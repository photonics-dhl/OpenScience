import { createHash } from 'node:crypto';
import type { fixture } from './direct-source-review-fixture';

/** Persisted pre-Hermes-only intent. New producers must no longer create this Web receipt. */
export function seedHistoricalIndependentSourceReview(f: ReturnType<typeof fixture>) {
  const source = f.db.ingestionTasks[0];
  const predecessor = f.db.agentTasks.find(task => task.id === source.agentTaskId)!;
  const session = f.db.agentSessions.find(row => row.id === predecessor.sessionId)!;
  const output = predecessor.result.scientificReview.rejectedOutputs.at(-1)!;
  const run = f.db.hermesResearchRuns[0];
  const id = '00000000-0000-4000-8000-000000009001';
  const sessionId = 'historical-independent-session';
  const digest = createHash('sha256').update('persisted-historical-independent-intent').digest('hex');
  const key = `ingestion-analysis-compose:${source.id}:${predecessor.id}:${f.ids.anchor}:scientific-review-v4`;
  const ordinal = f.db.hermesResearchSteps.filter(step => step.stage === 'source_review').length;
  const receipt = f.db.auditLogs.find(row => row.action === 'hermes.research_run.source_review_recovery') ?? {
    action: 'hermes.research_run.source_review_recovery', actorId: run.actorId, targetType: 'hermes_research_run',
    targetId: run.id, workspaceId: 'workspace', metadata: {},
  };
  const task: typeof predecessor = { ...structuredClone(predecessor), id, sessionId, status: 'queued', result: null, executionAttempt: 0,
    retryCount: 0, idempotencyKey: key };
  f.db.agentSessions.push({ ...structuredClone(session), id: sessionId,
    idempotencyKey: `${key}:hermes-recovery:${digest}` });
  f.db.agentTasks.push(task);
  const debit = f.db.usageLedger.find(row => row.idempotencyKey === `agent-task-reserve:${predecessor.id}`)!;
  f.db.usageLedger.push({ ...structuredClone(debit), id: 'historical-independent-debit',
    userId: run.actorId, resource: 'ai_credit', delta: -1n, kind: 'consume', reason: 'Agent task reservation sdf.extract',
    idempotencyKey: `agent-task-reserve:${id}`, metadata: { taskId: id, kind: 'sdf.extract', policy: 'charged-on-submit' } });
  f.db.hermesResearchSteps.push({ ...structuredClone(f.db.hermesResearchSteps.at(-1)!), id: 'historical-independent-step',
    agentTaskId: id, ordinal, status: 'waiting', error: null });
  f.db.hermesResearchSteps[0].agentTaskId = id;
  source.agentTaskId = id;
  source.state = 'queued';
  f.db.auditLogs.push({ ...structuredClone(receipt), id: 'historical-independent-receipt', metadata: {
    ...structuredClone(receipt.metadata), requestDigest: digest, clientIdempotencyKey: 'historical-independent',
    explicitUserAction: true, possibleDuplicateProviderCharge: true, compositionSourceAgentTaskId: f.ids.anchor,
    contractRepairAuditIds: [], serviceFailureAuditIds: [], serviceFailureClassifications: [], stage: 'source_review',
    chargeableAttempts: 1, creditPolicy: 'new-review-task-charged;original-failure-preserved',
    previousVersion: run.version, oldAgentTaskId: predecessor.id, newAgentTaskId: id, ordinal,
    recoveryClass: 'independent_source_review', reviewMode: 'web', reviewProvider: 'chatgpt-web-science-review',
    reviewModel: 'chatgpt-web/6-pro', noRuntimeFallback: true, noProviderSwitch: undefined,
    freshReview: false, savedOutputReused: true, savedOutputEvidence: {
      sourceTaskId: predecessor.id, structuredAttempt: output.structuredAttempt, responseHash: output.responseHash,
      promptHash: output.promptHash, provider: output.provider, model: output.model, byteLength: output.byteLength,
      reviewedCandidateHash: predecessor.result.scientificReview.reviewedCandidateHash,
      structuredReviewAuditIds: f.db.auditLogs.filter(row => row.action === 'ai.gateway.call'
        && row.requestId === predecessor.id).map(row => row.id),
    },
  } });
  Object.assign(run, { status: 'running', error: null, version: run.version + 1, lastReconciledAt: null });
  return task;
}

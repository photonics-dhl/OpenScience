import { describe, expect, it } from 'vitest';
import { reanalyzeConfirmedIngestion } from '../../src/ingestion/ingestion-service';
import { requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { getHermesResearchRun } from '../../src/agent/research-run';
import { advancePrivateSourceReanalysisToReview, privateSourceReanalysisFixture } from './private-source-reanalysis-fixture';

describe('Hermes owns new paper science reviews', () => {
  it('records model review and binds its original source without allocating a Web review', async () => {
    const f = await privateSourceReanalysisFixture();
    const historical = structuredClone(f.db.auditLogs);
    const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const { original, successor } = await advancePrivateSourceReanalysisToReview(f, created.id);
    const receipt = f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh'
      && row.metadata.newAgentTaskId === successor.id)!;
    expect(receipt.metadata.policy).toBe('scientific_review_v4_correction');
    for (const key of ['reviewMode', 'reviewProvider', 'reviewModel']) expect(receipt.metadata).not.toHaveProperty(key);
    Object.assign(successor, { status: 'running', executionAttempt: 1 });
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: successor.id,
      ingestionTaskId: created.id, failedTaskId: original.id, compositionTaskId: original.id, executionAttempt: 1 }))
      .toEqual({ mode: 'model' });
    expect(f.db.auditLogs.filter(row => historical.some(old => old.id === row.id))).toEqual(historical);
  });

  it('keeps the same paid-operation replay handle after a model review succeeds and the run advances', async () => {
    const f = await privateSourceReanalysisFixture();
    const created = await reanalyzeConfirmedIngestion(f.deps, f.input);
    const { run, original, successor } = await advancePrivateSourceReanalysisToReview(f, created.id);
    Object.assign(successor, { status: 'succeeded', executionAttempt: 1, result: { ...structuredClone(original.result),
      scientificReview: { ...structuredClone(original.result.scientificReview), kind: 'model_self_check',
        contractVersion: '5', sourceAgentTaskId: original.id, provider: 'minimax', model: 'MiniMax-M3' } } });
    Object.assign(f.db.hermesResearchRuns.find(row => row.id === run.id)!, { status: 'awaiting_claim_review',
      versionId: 'saved-version', sourceReviewDigest: 'd'.repeat(64), sourceClaimIds: ['saved-claim'] });
    const before = structuredClone(f.db);
    expect(await reanalyzeConfirmedIngestion(f.deps, { ...f.input, idempotencyKey: 'lost-response-after-model-review' }))
      .toMatchObject({ id: created.id, agentTaskId: successor.id });
    expect((await getHermesResearchRun(f.deps, { actorId: f.input.userId, researchObjectId: f.ids.ro,
      runId: f.ids.run })).sourceReanalysis?.existingIngestionTaskId).toBe(created.id);
    expect(f.db).toEqual(before);
  });
});

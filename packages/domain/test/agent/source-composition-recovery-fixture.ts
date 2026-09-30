import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { SDF_CORE_FIELDS } from '@openscience/sdf-schema';
import { reanalyzeConfirmedIngestion } from '../../src/ingestion/ingestion-service';
import { reconcileHermesResearchRuns } from '../../src/agent/research-run';
import { advancePrivateSourceReanalysisToReview, privateSourceReanalysisFixture } from './private-source-reanalysis-fixture';

export async function sourceCompositionRecoveryFixture() {
  const f = await privateSourceReanalysisFixture();
  // The shared fake predates multiple source phases. Apply relational filters, not business decisions.
  Object.assign(f.prisma.hermesResearchStep, { updateMany: async ({ where, data }: Prisma.HermesResearchStepUpdateManyArgs) => {
    const rows = f.db.hermesResearchSteps.filter(step => {
      if (where?.id && (typeof where.id === 'string' ? step.id !== where.id : !where.id.in?.includes(step.id))) return false;
      for (const key of ['runId', 'stage', 'ordinal', 'status', 'agentTaskId', 'ingestionTaskId', 'artifactId'] as const)
        if (where?.[key] !== undefined && step[key] !== where[key]) return false;
      const taskFilter = where?.agentTask as Prisma.AgentTaskWhereInput | undefined;
      const task = f.db.agentTasks.find(row => row.id === step.agentTaskId);
      return !taskFilter || Boolean(task && (taskFilter.status === undefined || task.status === taskFilter.status)
        && (taskFilter.deletedAt === undefined || (task.deletedAt ?? null) === taskFilter.deletedAt));
    });
    for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
    return { count: rows.length };
  } });
  const source = await reanalyzeConfirmedIngestion(f.deps, f.input);
  const { run, original, successor: failed } = await advancePrivateSourceReanalysisToReview(f, source.id, 'source_composition');
  const semanticStage = { kind: 'semantic_reduce', source: { artifactId: f.ids.artifact, contentHash: f.reference.contentHash,
    sourceMapHash: f.reference.serializedSha256 }, provider: 'primary', model: 'MiniMax-M3', promptHash: 'c'.repeat(64),
    responseHash: 'd'.repeat(64), finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 100 },
    passageBindings: [{ observationId: 'W1O1', sourcePassageIds: ['P00001'], qualifierPassageIds: [] }],
    reduction: { chosenRepresentativeCase: null, fields: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field,
      [{ statement: `Supported ${field}`, type: 'bounded_synthesis', conditionCase: '', comparison: null, operation: null,
        evidenceIds: ['W1O1'] }]])) } };
  const result = { ...structuredClone(f.anchorResult), reason: 'canonical_partial_validation_exhausted',
    core: { schemaVersion: '0.1.0', ...Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, ''])) },
    evidence: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, { quote: '', locator: '' }])),
    evidenceSegments: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, []])), needsMoreInformation: [...SDF_CORE_FIELDS],
    fieldDiagnostics: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, 'malformed_item'])),
    fieldDiagnosticsDetails: Object.fromEntries(SDF_CORE_FIELDS.map(field => [field, 'scientificReview=SCHEMA_VALIDATION'])),
    scientificReview: { kind: 'model_self_check', contractVersion: '4', status: 'blocked_scientific_review', provider: null, model: null,
      compositionSkill: { id: 'scientific-summary', version: '6' }, semanticStage,
      reviewedCandidateHash: createHash('sha256').update(JSON.stringify(semanticStage.reduction)).digest('hex') } };
  Object.assign(failed, { status: 'succeeded', executionAttempt: 1, retryCount: 0, result });
  f.db.ingestionTasks.find(row => row.id === source.id)!.state = 'needs_review';
  for (let tick = 0; tick < 2; tick++) {
    f.db.hermesResearchRuns.find(row => row.id === run.id)!.lastReconciledAt = null;
    await reconcileHermesResearchRuns(f.deps);
  }
  const currentRun = f.db.hermesResearchRuns.find(row => row.id === run.id)!;
  return { ...f, source, run: currentRun,
    original: f.db.agentTasks.find(row => row.id === original.id)!, failed: f.db.agentTasks.find(row => row.id === failed.id)!,
    recoveryInput: { actorId: f.input.userId, researchObjectId: f.ids.ro, runId: run.id,
      expectedVersion: currentRun.version, idempotencyKey: 'same-final-composition' } };
}

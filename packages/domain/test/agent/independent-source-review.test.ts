import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter } from '@openscience/storage';
import { fixture, fields } from './direct-source-review-fixture';
import { seedHistoricalIndependentSourceReview } from './historical-source-review-fixture';
import { getHermesResearchRun, retryHermesGeneration } from '../../src/agent/research-run';
import { inspectHermesSourceReviewRecovery, requireHermesSourceReviewExecution } from '../../src/ingestion/source-review-recovery';
import { ensureHermesIngestionReview, refreshIngestionAnalysis } from '../../src/ingestion/ingestion-service';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';

function rejected(f: ReturnType<typeof fixture>, task = f.db.agentTasks[1], count = 2) {
  task.status = 'succeeded'; task.executionAttempt = 1; task.retryCount = 0;
  task.result = structuredClone(f.failedResult);
  const text = JSON.stringify({ fields: fields(field => ({ verdict: 'accepted', summary: `Original ${field}`,
    sourcePassageIds: ['P00001'], issues: [] })), needsMoreEvidence: [], claimSuggestions: [{ parentClientKey: 'missing' }] });
  task.result.fieldDiagnosticsDetails = fields(() => 'scientificReview=review_contract_incomplete;reviewedClaims=source_unmaterializable');
  f.db.auditLogs.splice(0, f.db.auditLogs.length, ...f.db.auditLogs.filter(row => row.requestId !== task.id));
  for (let i = 1; i <= count; i++) f.db.auditLogs.push({ id: `${task.id}-call-${i}`, action: 'ai.gateway.call',
    actorId: null, targetType: 'ai_gateway', requestId: task.id, metadata: { operation: 'text', outcome: 'succeeded',
      provider: 'primary', model: 'MiniMax-M3', promptHash: String(i).repeat(64), inputTokens: 100, outputTokens: 100,
      retryCount: 0, fallbackReason: null, error: null, finishReason: 'stop' } });
  task.result.scientificReview.rejectedOutputs = [{ structuredAttempt: count, kind: 'schema_validation',
    diagnostic: 'claims_source_unmaterializable', provider: 'primary', model: 'MiniMax-M3', promptHash: String(count).repeat(64),
    responseHash: createHash('sha256').update(text).digest('hex'), byteLength: Buffer.byteLength(text),
    usage: { inputTokens: 100, outputTokens: 100 }, finishReason: 'stop', text }];
  f.db.hermesResearchRuns[0].status = 'failed'; f.db.ingestionTasks[0].state = 'needs_review';
  f.db.hermesResearchSteps.find(step => step.stage === 'source_review' && step.agentTaskId === task.id).status = 'failed';
  return text;
}

function initial(web = true) {
  const f = fixture(); const task = f.db.agentTasks[1];
  Object.assign(task, { status: 'running', result: null });
  f.db.hermesResearchRuns[0].status = 'running'; f.db.hermesResearchSteps[1].status = 'waiting';
  f.db.ingestionTasks[0].state = 'parsing'; f.db.auditLogs.length = 0;
  f.db.auditLogs.push({ id: 'initial-receipt', action: 'ingestion.task.system_analysis_refresh', actorId: null,
    workspaceId: 'workspace', targetType: 'ingestion_task', targetId: f.ids.source, metadata: {
      policy: web ? 'scientific_review_v4_independent' : 'scientific_review_v4_correction', executor: 'hermes',
      authorizedByUserId: f.input.actorId, runId: f.ids.run, stage: 'source_review',
      oldAgentTaskId: f.ids.anchor, compositionSourceAgentTaskId: f.ids.anchor, newAgentTaskId: task.id,
      artifactId: f.ids.artifact, sourceMapSha256: 'b'.repeat(64),
      ...(web ? { reviewMode: 'web', reviewProvider: 'chatgpt-web-science-review', reviewModel: 'chatgpt-web/6-pro' } : {}),
    } });
  return { ...f, binding: { ownerTaskId: task.id, ingestionTaskId: f.ids.source, compositionTaskId: f.ids.anchor,
    failedTaskId: f.ids.anchor, executionAttempt: 1 } };
}

describe('server-owned independent source review role', () => {
  it.each([false, true])('records initial Hermes model intent atomically with task, debit and run CAS (lose=%s)', async lose => {
    const f = fixture(); const objects = new Map<string, Buffer>();
    const storage = { headObject: async () => null,
      putObject: async (key: string, body: Buffer) => { objects.set(key, body); return { key, size: body.length, etag: 'test' }; },
      getObject: async (key: string) => ({ size: objects.get(key)!.length, body: Readable.from([objects.get(key)!]) }),
    } as unknown as StorageAdapter;
    const reference = await persistDocumentSourceMapReference(storage, { artifactId: f.ids.artifact, contentHash: 'a'.repeat(64),
      parser: { name: 'fixture', version: '1' }, pages: [{ page: 1, width: 100, height: 100, blocks: [{
        id: 'source', kind: 'paragraph', text: 'The source model has specified assumptions and conditions.',
        boundingBox: { x: 1, y: 1, width: 90, height: 90 }, parser: { name: 'fixture', version: '1' }, transformations: [],
      }] }] }, 'succeeded');
    f.db.agentTasks.splice(1); f.db.agentSessions.splice(1); f.db.auditLogs.length = 0;
    Object.assign(f.db.agentTasks[0], { executionAttempt: 1, retryCount: 0 });
    f.db.agentTasks[0].result.sourceMapRef = reference;
    f.db.agentTasks[0].result.scientificReview.semanticStage.source.sourceMapHash = reference.serializedSha256;
    f.db.hermesResearchSteps.splice(1); f.db.hermesResearchSteps[0].agentTaskId = f.ids.anchor;
    f.db.ingestionTasks[0].agentTaskId = f.ids.anchor; f.db.hermesResearchRuns[0].status = 'awaiting_source_review';
    const before = structuredClone(f.db);
    if (lose) vi.spyOn(f.prisma.hermesResearchRun, 'updateMany').mockResolvedValueOnce({ count: 0 });
    const request = refreshIngestionAnalysis({ ...f.deps, storage }, { userId: f.input.actorId, taskId: f.ids.source,
      sourceAgentTaskId: f.ids.anchor, compositionSourceAgentTaskId: f.ids.anchor, reviewOnly: true, processingConsent: true }, {}, f.ids.run);
    if (lose) {
      await expect(request).rejects.toBeDefined(); expect(f.db).toEqual(before); expect(f.redis.lpush).not.toHaveBeenCalled();
    } else {
      await request;
      const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
      expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: task.id, ingestionTaskId: f.ids.source,
        compositionTaskId: f.ids.anchor, failedTaskId: f.ids.anchor, executionAttempt: 1 })).toEqual({ mode: 'model' });
      expect(f.db.auditLogs.find(row => row.action === 'ingestion.task.system_analysis_refresh').metadata)
        .toMatchObject({ policy: 'scientific_review_v4_correction' });
      expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
      expect(f.redis.lpush).toHaveBeenCalledTimes(1);
      task.status = 'succeeded'; f.db.ingestionTasks[0].state = 'needs_review';
      task.result = { ...structuredClone(f.db.agentTasks[0].result), scientificReview: {
        ...structuredClone(f.db.agentTasks[0].result.scientificReview), kind: 'model_self_check', contractVersion: '5',
        sourceAgentTaskId: f.ids.anchor, provider: 'primary', model: 'MiniMax-M3',
      }, reviewedClaimSuggestions: [{ clientKey: 'c1', sourceField: 'method', kind: 'core', statement: 'Reviewed method',
        conditions: [], limitations: [], sourceBindings: [{ sourceIndex: 0, relation: 'supports' }] }] };
      const originalUpdate = f.prisma.hermesResearchStep.updateMany.bind(f.prisma.hermesResearchStep);
      vi.spyOn(f.prisma.hermesResearchStep, 'updateMany').mockImplementation(async args => {
        const selected = typeof args.where?.id === 'object' ? args.where.id.in : undefined;
        if (!Array.isArray(selected)) return originalUpdate(args);
        const rows = f.db.hermesResearchSteps.filter(step => selected.includes(step.id)
          && f.db.agentTasks.some(candidate => candidate.id === step.agentTaskId && candidate.status === 'succeeded'));
        rows.forEach(step => Object.assign(step, args.data)); return { count: rows.length };
      });
      await expect(ensureHermesIngestionReview({ ...f.deps, storage }, { actorId: f.input.actorId, runId: f.ids.run,
        taskId: f.ids.source })).resolves.toBe('ready');
      task.result.scientificReview.kind = 'independent_review';
      await expect(ensureHermesIngestionReview({ ...f.deps, storage }, { actorId: f.input.actorId, runId: f.ids.run,
        taskId: f.ids.source })).rejects.toBeDefined();
      expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    }
  });
  it('resolves initial web intent and historical model intent from exact durable receipts', async () => {
    const f = initial();
    expect(await requireHermesSourceReviewExecution(f.prisma, f.binding)).toEqual({ mode: 'web',
      provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro', runId: f.ids.run, taskId: f.ids.failed });
    const old = initial(false);
    expect(await requireHermesSourceReviewExecution(old.prisma, old.binding)).toEqual({ mode: 'model' });
    expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('retains the same web intent across claim recovery and rejects the stale lease', async () => {
    const f = initial(); f.db.agentTasks[1].executionAttempt = 2;
    await expect(requireHermesSourceReviewExecution(f.prisma, f.binding)).rejects.toThrow('binding changed');
    expect(await requireHermesSourceReviewExecution(f.prisma, { ...f.binding, executionAttempt: 2 }))
      .toMatchObject({ mode: 'web', taskId: f.ids.failed });
  });

  it('keeps a model saved-output correction on Hermes and replays without redispatch', async () => {
    const f = fixture(); const text = rejected(f);
    expect(await getHermesResearchRun(f.deps, f.input)).toMatchObject({ generationRecovery: 'source-review-saved', chargeableAttempts: 1 });
    await Promise.all([retryHermesGeneration(f.deps, f.input), retryHermesGeneration(f.deps, f.input)]);
    const task = f.db.agentTasks.at(-1)!; task.status = 'running'; task.executionAttempt = 1;
    const binding = { ownerTaskId: task.id, ingestionTaskId: f.ids.source, failedTaskId: f.ids.failed,
      compositionTaskId: f.ids.anchor, executionAttempt: 1 };
    expect(await requireHermesSourceReviewExecution(f.prisma, binding)).toMatchObject({ mode: 'model',
      savedOutput: { text, sourceTaskId: f.ids.failed } });
    task.executionAttempt = 2;
    await expect(requireHermesSourceReviewExecution(f.prisma, { ...binding, executionAttempt: 2 })).rejects.toThrow('[blocked]');
    task.executionAttempt = 1;
    for (const status of ['running', 'failed', 'succeeded']) {
      f.db.hermesResearchRuns[0].status = status;
      await expect(retryHermesGeneration(f.deps, f.input)).resolves.toMatchObject({ id: f.ids.run });
    }
    expect(f.redis.lpush).toHaveBeenCalledTimes(1);
    expect(f.db.usageLedger.filter(row => row.kind === 'consume')).toHaveLength(1);
  });

  it.each([false, true])('uses the latest one-call historical saved output after fresh=%s, never an older body', async fresh => {
    const f = fixture(); let prior = f.db.agentTasks[1];
    if (fresh) { await retryHermesGeneration(f.deps, f.input); prior = f.db.agentTasks.at(-1)!; }
    rejected(f, prior); await retryHermesGeneration(f.deps, { ...f.input, expectedVersion: fresh ? 8 : 7, idempotencyKey: 'historical-saved' });
    const historical = f.db.agentTasks.at(-1)!;
    const receipt = f.db.auditLogs.find(row => row.metadata?.newAgentTaskId === historical.id);
    Object.assign(receipt.metadata, { recoveryClass: 'saved_source_review_output_correction', noProviderSwitch: true });
    for (const key of ['reviewMode', 'reviewProvider', 'reviewModel', 'noRuntimeFallback']) delete receipt.metadata[key];
    const text = rejected(f, historical, 1);
    expect(await inspectHermesSourceReviewRecovery(f.prisma, f.ids.run)).toBeNull();
    const independent = seedHistoricalIndependentSourceReview(f);
    Object.assign(independent, { status: 'running', executionAttempt: 1 });
    expect(await requireHermesSourceReviewExecution(f.prisma, { ownerTaskId: independent.id, ingestionTaskId: f.ids.source,
      failedTaskId: historical.id, compositionTaskId: f.ids.anchor, executionAttempt: 1 })).toMatchObject({ mode: 'web',
      savedOutput: { text, sourceTaskId: historical.id, structuredAttempt: 1 } });
    expect(f.redis.lpush).toHaveBeenCalledTimes(fresh ? 2 : 1);
  });

  it.each([false, true])('permits exact manual policy with published/retried=%s, never downgrading Hermes', async retried => {
    const f = initial(false); f.db.hermesResearchSteps.length = 0;
    Object.assign(f.db.auditLogs[0], { action: 'ingestion.task.analysis_refresh', actorId: f.input.actorId });
    for (const key of ['executor', 'runId', 'authorizedByUserId', 'stage']) delete f.db.auditLogs[0].metadata[key];
    if (retried) {
      f.db.researchObjects[0].status = 'published'; f.db.ingestionTasks[0].retryCount = 1;
      f.db.agentTasks[1].retryCount = 1; f.db.agentTasks[1].executionAttempt = 2; f.binding.executionAttempt = 2;
    }
    expect(await requireHermesSourceReviewExecution(f.prisma, f.binding)).toEqual({ mode: 'model' });
    for (let i = 0; i < 3; i++) f.db.auditLogs.push({ ...structuredClone(f.db.auditLogs[0]),
      id: `unrelated-${i}`, action: 'unrelated.audit' });
    f.db.auditLogs.push({ ...structuredClone(f.db.auditLogs[0]), id: 'independent-receipt',
      action: 'hermes.research_run.source_review_recovery' });
    await expect(requireHermesSourceReviewExecution(f.prisma, f.binding)).rejects.toThrow('binding changed');
    f.db.auditLogs.pop();
    f.db.hermesResearchSteps.push({ id: 'stale', stage: 'source_ingestion', ingestionTaskId: f.ids.source,
      agentTaskId: 'old-owner', runId: f.ids.run });
    f.db.hermesResearchRuns[0].status = 'stopped';
    await expect(requireHermesSourceReviewExecution(f.prisma, f.binding)).rejects.toThrow('binding changed');
    f.db.hermesResearchSteps.length = 0;
    Object.assign(f.db.auditLogs[0].metadata, { reviewMode: 'web' });
    await expect(requireHermesSourceReviewExecution(f.prisma, f.binding)).rejects.toThrow('binding changed');
  });

  it.each(['missing', 'duplicate', 'mode', 'provider', 'source', 'actor', 'permission', 'grant'])(
    'denies changed initial %s before a provider submission', async change => {
      const f = initial(); const receipt = f.db.auditLogs[0];
      if (change === 'missing') f.db.auditLogs.length = 0;
      if (change === 'duplicate') f.db.auditLogs.push({ ...structuredClone(receipt), id: 'duplicate' });
      if (change === 'mode') delete receipt.metadata.reviewMode;
      if (change === 'provider') receipt.metadata.reviewProvider = 'other';
      if (change === 'source') f.db.artifacts[0].blobSha256 = '0'.repeat(64);
      if (change === 'actor') f.db.agentSessions[0].userId = 'other';
      if (change === 'permission') f.db.memberships[0].role = 'viewer';
      if (change === 'grant') f.db.hermesResearchRuns[0].maxAgentTasks = 11;
      await expect(requireHermesSourceReviewExecution(f.prisma, f.binding)).rejects.toBeDefined();
    });
});

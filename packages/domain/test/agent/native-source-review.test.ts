import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { startNativeSourceReview, completeNativeSourceReview, readNativeSourceReview,
  nativeSourceReviewTerminalResult } from '../../src/ingestion/native-source-review';
import { fixture as scopedFixture } from './direct-source-review-fixture';
import { markTaskProgress } from '../../src/agent/agent';

const identity = { taskId: 'task', ingestionTaskId: 'ingestion', compositionTaskId: 'composition',
  artifactId: 'artifact', documentSha256: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64), maxAttempts: 2 as const };
const target = { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'c'.repeat(64) };
const candidate = 'd'.repeat(64);
const response = { text: '{"fields":{}}', model: target.model, finishReason: 'stop' as const, usage: { inputTokens: 10, outputTokens: 3 } };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture() {
  const task = { id: 'task', kind: 'sdf.extract', status: 'running', deletedAt: null, executionAttempt: 1,
    result: { nativeSourceReview: { mode: 'model-native', attempts: [] } } };
  const tx = { agentTask: { findUnique: async () => task, updateMany: async ({ where, data }: {
    where: { result: { equals: unknown }; executionAttempt: number }; data: Partial<typeof task> }) => {
    if (JSON.stringify(where.result.equals) !== JSON.stringify(task.result) || where.executionAttempt !== task.executionAttempt) return { count: 0 };
    Object.assign(task, data); return { count: 1 };
  } } };
  const input = { identity, executionAttempt: 1, ordinal: 0, reviewedCandidateHash: candidate, target };
  return { task, tx: tx as never, input };
}
describe('durable native source review attempts', () => {
  it.each(['unchanged', 'membership', 'run', 'source', 'receipt', 'kind'] as const)(
    'revalidates scientific adoption after the paid response completes (%s)', async change => {
      const f = scopedFixture(); const owner = f.db.agentTasks[1];
      Object.assign(owner, { status: 'running', result: { nativeSourceReview: { mode: 'model-native', attempts: [] } } });
      f.db.hermesResearchRuns[0].status = 'running'; f.db.hermesResearchSteps[1].status = 'waiting'; f.db.ingestionTasks[0].state = 'parsing';
      f.db.auditLogs.length = 0;
      f.db.auditLogs.push({ id: 'initial-receipt', action: 'ingestion.task.system_analysis_refresh', actorId: null,
        workspaceId: 'workspace', targetType: 'ingestion_task', targetId: f.ids.source, metadata: {
          policy: 'scientific_review_v4_correction', executor: 'hermes', authorizedByUserId: f.input.actorId, runId: f.ids.run,
          stage: 'source_review', oldAgentTaskId: f.ids.anchor, compositionSourceAgentTaskId: f.ids.anchor, newAgentTaskId: owner.id,
          artifactId: f.ids.artifact, sourceMapSha256: 'b'.repeat(64),
        } });
      const bound = { ...identity, taskId: owner.id, ingestionTaskId: f.ids.source, compositionTaskId: f.ids.anchor, artifactId: f.ids.artifact };
      const submission = { identity: bound, executionAttempt: 1, ordinal: 0, reviewedCandidateHash: candidate, target };
      await startNativeSourceReview(f.prisma, submission); await completeNativeSourceReview(f.prisma, submission, response);
      const result = { ...structuredClone(f.db.agentTasks[0].result), scientificReview: {
        kind: change === 'kind' ? 'independent_review' : 'model_self_check', status: 'review_received', contractVersion: '5',
        sourceAgentTaskId: f.ids.anchor, reviewedCandidateHash: candidate, ...target, responseHash: sha(response.text), usage: response.usage, finishReason: 'stop',
      } };
      if (change === 'membership') f.db.memberships[0].role = 'reader';
      if (change === 'run') f.db.hermesResearchRuns[0].status = 'cancelled';
      if (change === 'source') f.db.artifacts[0].blobSha256 = 'e'.repeat(64);
      if (change === 'receipt') f.db.auditLogs[0].metadata.sourceMapSha256 = 'e'.repeat(64);
      const finish = markTaskProgress(f.deps, { taskId: owner.id, status: 'succeeded', expectedExecutionAttempt: 1, result });
      if (change === 'unchanged') { const view = await finish; expect(f.db.agentTasks[1].status).toBe('succeeded');
        expect(view.result).not.toHaveProperty('nativeSourceReview'); }
      else { await expect(finish).rejects.toThrow(); expect(f.db.agentTasks[1].status).toBe('running'); }
    });
  it('starts only once and refuses a paid unknown attempt after a new lease', async () => {
    const f = fixture(); await startNativeSourceReview(f.tx, f.input);
    await expect(startNativeSourceReview(f.tx, f.input)).rejects.toThrow();
    f.task.executionAttempt = 2;
    await expect(startNativeSourceReview(f.tx, { ...f.input, executionAttempt: 2 })).rejects.toThrow();
  });
  it('stores exact raw response before schema parsing and replays it without a second submission', async () => {
    const f = fixture(); await startNativeSourceReview(f.tx, f.input); await completeNativeSourceReview(f.tx, f.input, response);
    f.task.executionAttempt = 2;
    const replay = await startNativeSourceReview(f.tx, { ...f.input, executionAttempt: 2 });
    expect(replay).toEqual(response); expect(readNativeSourceReview(f.task.result)?.attempts).toHaveLength(1);
  });
  it.each(['promptHash', 'sourceMapHash', 'reviewedCandidateHash'])('refuses a changed %s during replay', async key => {
    const f = fixture(); await startNativeSourceReview(f.tx, f.input); await completeNativeSourceReview(f.tx, f.input, response);
    const changed = structuredClone(f.input);
    if (key === 'promptHash') changed.target.promptHash = 'e'.repeat(64);
    else if (key === 'sourceMapHash') changed.identity.sourceMapHash = 'e'.repeat(64);
    else changed.reviewedCandidateHash = 'e'.repeat(64);
    await expect(startNativeSourceReview(f.tx, changed)).rejects.toThrow();
  });
  it('permits only the Gateway-owned one repair after a completed original', async () => {
    const f = fixture(); await expect(startNativeSourceReview(f.tx, { ...f.input, ordinal: 1 })).rejects.toThrow();
    await startNativeSourceReview(f.tx, f.input); await completeNativeSourceReview(f.tx, f.input, response);
    await startNativeSourceReview(f.tx, { ...f.input, ordinal: 1, target: { ...target, promptHash: 'e'.repeat(64) } });
    await expect(startNativeSourceReview(f.tx, { ...f.input, ordinal: 2 })).rejects.toThrow();
  });
  it('leaves an oversized raw response uncertain instead of truncating or permitting another call', async () => {
    const f = fixture(); await startNativeSourceReview(f.tx, f.input);
    await expect(completeNativeSourceReview(f.tx, f.input, { ...response, text: 'x'.repeat(131073) })).rejects.toThrow();
    expect(readNativeSourceReview(f.task.result)?.attempts[0].state).toBe('started');
  });
  it('retains a late paid reply without reopening a cancelled task or granting a new lease', async () => {
    const f = fixture(); await startNativeSourceReview(f.tx, f.input);
    f.task.status = 'cancelled'; f.task.executionAttempt = 2;
    await completeNativeSourceReview(f.tx, f.input, response);
    expect(f.task.status).toBe('cancelled'); expect(f.task.executionAttempt).toBe(2);
    expect(readNativeSourceReview(f.task.result)?.attempts[0].state).toBe('completed');
    await expect(startNativeSourceReview(f.tx, { ...f.input, executionAttempt: 2 })).rejects.toThrow();
  });
  it('requires final completed stop proof for science adoption and binds failure receipts too', async () => {
    const f = fixture(); await startNativeSourceReview(f.tx, f.input); await completeNativeSourceReview(f.tx, f.input, response);
    const result = { sourceMapRef: { artifactId: 'artifact', contentHash: identity.documentSha256, serializedSha256: identity.sourceMapHash },
      scientificReview: { kind: 'model_self_check', status: 'review_received', sourceAgentTaskId: 'composition',
        reviewedCandidateHash: candidate, provider: target.provider, model: target.model, promptHash: target.promptHash,
        responseHash: sha(response.text), usage: response.usage, finishReason: 'stop' } };
    expect(nativeSourceReviewTerminalResult(f.task as never, 'succeeded', result)).toHaveProperty('nativeSourceReview');
    for (const status of ['review_received', 'blocked_scientific_review', 'awaiting_review_evidence']) {
      await expect(async () => nativeSourceReviewTerminalResult(f.task as never, 'succeeded', {
        ...result, scientificReview: { ...result.scientificReview, status, responseHash: 'f'.repeat(64) } })).rejects.toThrow();
    }
  });
  it('never treats malformed private data or an injected marker as legacy', () => {
    expect(() => readNativeSourceReview({ nativeSourceReview: null })).toThrow();
    const f = fixture(); expect(() => nativeSourceReviewTerminalResult({ ...f.task, result: null } as never, 'failed', f.task.result)).toThrow();
  });
});

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { getAgentTask, retryAgentTask } from '../../src/agent/agent';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const payload = { schemaVersion: 1, kind: 'interactive_html', researchObjectId: uuid(1), versionId: uuid(2),
    sourceClaimIds: [uuid(3)], storyboard: { locale: 'en', style: 'watercolor', output: 'image', instruction: 'Explain the channel.' } };
  const candidates = [1, 2, 3].map(structuredAttempt => ({ structuredAttempt, kind: 'schema_validation',
    text: JSON.stringify({ privateCandidate: structuredAttempt }), diagnostic: 'unbound_numeric_20_nm_source' }));
  const diagnostics = { payload, executionAttempt: 1, sourceEvidenceIdentity: 'a'.repeat(64), claimContent: 'claims',
    baseIdentity: null, narrativeSourceIdentity: 'reviewed-paper', sources: [{ sourceId: 's0', claimId: uuid(3),
      evidenceId: uuid(4), text: 'The channel width is 20 nm.', relation: 'supports' }], candidates };
  const membership = { userId: 'owner', role: 'author' };
  const ro = { id: uuid(1), workspaceId: 'workspace', workspace: { id: 'workspace', status: 'active', members: [membership] } };
  const task = { id: uuid(5), sessionId: uuid(6), kind: 'presentation.generate', status: 'failed', deletedAt: null,
    executionAttempt: 1, retryCount: 0, progress: 10, payload, result: { storyboardScienceDiagnostics: diagnostics } as unknown,
    createdAt: new Date('2026-09-29T00:00:00Z'), updatedAt: new Date('2026-09-29T00:10:00Z'),
    error: '结构化输出超过重试上限', dispatchedAt: new Date(), session: { userId: 'owner', status: 'active',
      researchObjectId: ro.id, researchObject: ro } };
  const calls = candidates.map((candidate, i) => ({ id: `call-${i}`, actorId: null, targetType: 'ai_gateway',
    createdAt: new Date(`2026-09-29T00:0${i + 1}:00Z`), metadata: { operation: 'text', outcome: 'succeeded',
      error: null, finishReason: 'stop', fallbackReason: null, retryCount: 0, provider: 'fixture', model: 'fixture',
      promptHash: 'b'.repeat(64) } }));
  const rejections = candidates.map((candidate, i) => ({ id: `rejection-${i}`, actorId: 'owner', targetType: 'agent_task',
    targetId: task.id, createdAt: new Date(calls[i]!.createdAt.getTime() + 10), metadata: { executionAttempt: 1,
      structuredAttempt: candidate.structuredAttempt, kind: candidate.kind,
      candidateHash: createHash('sha256').update(candidate.text).digest('hex'), candidateBytes: Buffer.byteLength(candidate.text) } }));
  const audit = vi.fn(); const redis = { lpush: vi.fn(async () => 1) };
  const prisma = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
    agentTask: { findUnique: vi.fn(async () => ({ ...task })), updateMany: vi.fn(async ({ where, data }) => {
      if (where.status && (where.status !== task.status || where.retryCount !== task.retryCount
        || where.result && !isDeepStrictEqual(where.result.equals, task.result)
        || where.payload && !isDeepStrictEqual(where.payload.equals, task.payload))) return { count: 0 };
      Object.assign(task, data); return { count: 1 };
    }) },
    presentationAsset: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
    version: { findUnique: vi.fn(async () => ({ id: uuid(2), researchObjectId: ro.id, researchObject: ro, status: 'draft', commit: { branchId: 'branch' } })),
      findFirst: vi.fn(async () => ({ id: uuid(2) })) },
    workspace: { findUnique: vi.fn(async () => ro.workspace) }, membership: { findUnique: vi.fn(async () => membership) },
    claimNode: { findMany: vi.fn(async () => [{ id: uuid(3), extractionStatus: 'succeeded' }]) },
    evidenceRecord: { findMany: vi.fn(async () => [{ id: uuid(4), claimId: uuid(3), exactQuote: diagnostics.sources[0]!.text,
      relation: 'supports', extractionStatus: 'succeeded' }]) },
    auditLog: { findMany: vi.fn(async ({ where }) => where.action === 'ai.gateway.call' ? calls
      : where.action === 'presentation.storyboard_science_candidate_rejected' ? rejections : []) },
  };
  const deps = { prisma, redis, audit: { record: audit } } as never;
  return { deps, prisma, task, diagnostics, calls, rejections, audit, redis, membership };
}

describe('standalone completed science candidate recovery', () => {
  it('retains the original private candidate under a full-result CAS and a server retry receipt', async () => {
    const f = fixture(); const original = structuredClone(f.task.result);
    await expect(getAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })).resolves.toMatchObject({ canRetry: true, result: {} });
    await expect(retryAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })).resolves.toMatchObject({ status: 'pending', retryCount: 1 });
    expect(f.task.result).toEqual(original);
    expect(f.prisma.agentTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      executionAttempt: 1, payload: { equals: f.task.payload }, result: { equals: original },
    }) }));
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'agent.task.retry', metadata: expect.objectContaining({
      recoveryClass: 'saved_science_candidate', previousExecutionAttempt: 1, authorizedExecutionAttempt: 2,
      candidateHash: f.rejections[2]!.metadata.candidateHash, structuredAttempt: 3, noScienceSubmission: true,
    }) }), expect.anything());
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('privateCandidate');
    const metadata = f.audit.mock.calls[0]![0].metadata;
    for (const key of ['payload', 'claimContent', 'narrativeSourceIdentity', 'sources', 'candidates', 'planningAudits'])
      expect(metadata).not.toHaveProperty(key);
    expect(JSON.stringify(metadata)).not.toContain(f.task.payload.storyboard.instruction);
    expect(f.redis.lpush).toHaveBeenCalledOnce();
  });

  it.each(['unknown', 'missing rejection', 'candidate changed', 'reader', 'source changed', 'missing audit', 'mixed result', 'wrong attempt'] as const)
  ('does not offer or perform unsafe recovery: %s', async reason => {
    const f = fixture();
    if (reason === 'unknown') f.calls[2]!.metadata.outcome = 'unknown';
    if (reason === 'missing rejection') f.rejections.pop();
    if (reason === 'candidate changed') f.diagnostics.candidates[2]!.text += ' ';
    if (reason === 'reader') f.membership.role = 'reader';
    if (reason === 'source changed') f.prisma.evidenceRecord.findMany.mockResolvedValue([]);
    if (reason === 'missing audit') (f.deps as any).audit = undefined;
    if (reason === 'mixed result') Object.assign(f.task.result as object, { storyboardCheckpoint: {} });
    if (reason === 'wrong attempt') f.diagnostics.executionAttempt = 2;
    await expect(getAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })).resolves.toMatchObject({ canRetry: false });
    await expect(retryAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })).rejects.toThrow();
    expect(f.prisma.agentTask.updateMany).not.toHaveBeenCalled();
    expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('does not dispatch when the diagnostic result changes concurrently', async () => {
    const f = fixture(); const update = f.prisma.agentTask.updateMany.getMockImplementation()!;
    f.prisma.agentTask.updateMany.mockImplementationOnce(async args => {
      f.task.result = { changed: true }; return update(args);
    });
    await expect(retryAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })).rejects.toThrow();
    expect(f.redis.lpush).not.toHaveBeenCalled(); expect(f.audit).not.toHaveBeenCalled();
  });

  it('accepts only one of two concurrent retries of the same paid candidate', async () => {
    const f = fixture();
    const results = await Promise.allSettled([retryAgentTask(f.deps, { userId: 'owner', taskId: f.task.id }),
      retryAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.audit).toHaveBeenCalledOnce(); expect(f.redis.lpush).toHaveBeenCalledOnce();
  });

  it('leaves SourceMap relation projection to the worker instead of rejecting raw supports downgraded to context', async () => {
    const f = fixture(); f.diagnostics.sources[0]!.relation = 'context';
    await expect(retryAgentTask(f.deps, { userId: 'owner', taskId: f.task.id })).resolves.toMatchObject({ status: 'pending' });
  });
});

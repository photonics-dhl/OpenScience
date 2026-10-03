import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiGateway } from '@openscience/ai-gateway';

const seam = vi.hoisted(() => ({
  extractHandler: vi.fn(),
  requireExecution: vi.fn(),
  resolveReanalysis: vi.fn(),
  requireComposition: vi.fn(),
  savedCommit: vi.fn(),
  claim: vi.fn(),
  progress: vi.fn(),
  lock: vi.fn(),
  nativeReview: vi.fn(),
  nativeAuthority: vi.fn(),
}));

vi.mock('../src/native-agent/source-review-task', () => ({ runNativeSourceReviewTask: seam.nativeReview }));

vi.mock('../src/extractor', async load => ({
  ...await load<typeof import('../src/extractor')>(),
  extractHandler: seam.extractHandler,
}));

vi.mock('@openscience/domain', async load => ({
  ...await load<typeof import('@openscience/domain')>(),
  requireHermesSourceReviewExecution: seam.requireExecution,
  resolveHermesPrivateSourceReanalysisExecution: seam.resolveReanalysis,
  requireHermesSourceCompositionRecoveryExecution: seam.requireComposition,
  findSavedIngestionCommit: seam.savedCommit,
  claimAgentTask: seam.claim,
  markTaskProgress: seam.progress,
  lockTrashReferences: seam.lock,
  requireNativeAgentExecutionAuthority: seam.nativeAuthority,
}));

import { createHandlers, createPollOnce, createSpoolSubmission } from '../src/index';

describe('new Hermes model review authorization', () => {
  beforeEach(() => {
    seam.extractHandler.mockReset();
    seam.requireExecution.mockReset().mockResolvedValue({ mode: 'model' });
    seam.resolveReanalysis.mockReset().mockResolvedValue(null);
    seam.requireComposition.mockReset();
    seam.savedCommit.mockReset().mockResolvedValue(null);
    seam.progress.mockReset().mockResolvedValue(undefined);
    seam.lock.mockReset().mockResolvedValue(undefined);
  });

  it.each(['trusted', 'unbound', 'forged'] as const)('forwards only the server-bound saved composition descriptor (%s)', async scope => {
    const f = fixture();
    const descriptor = { structuredAttempt: 2, responseHash: 'c'.repeat(64), providerAuditId: 'paid-composition-audit' };
    seam.requireExecution.mockResolvedValue({ mode: 'model', ...(scope === 'trusted' ? { savedCompositionCandidate: descriptor } : {}) });
    seam.extractHandler.mockResolvedValue({ core: {}, needsMoreInformation: [] });
    if (scope === 'forged') {
      Object.assign(f.owner.payload, { savedCompositionCandidate: { ...descriptor, responseHash: 'forged' } });
      await expect(f.execute()).rejects.toThrow('[blocked]');
      expect(seam.extractHandler).not.toHaveBeenCalled(); return;
    }
    await f.execute();
    const context = seam.extractHandler.mock.calls[0]![2];
    expect(context.scientificReview.savedCompositionCandidate).toEqual(scope === 'trusted' ? descriptor : undefined);
    expect(context.reviewExistingSourceTaskId).toBe(ids.source);
  });

  it.each(['completed', 'unknown', 'revoked', 'changed-binding', 'revoked-after-submit'] as const)(
    'persists the native source attempt through the actual claimed handler and transaction (%s)', async outcome => {
      const f = fixture(); Object.assign(f.owner, { result: { nativeSourceReview: { mode: 'model-native', attempts: [] } } });
      const identity = { taskId: ids.owner, ingestionTaskId: ids.ingestion, compositionTaskId: ids.source,
        artifactId: 'artifact', documentSha256: f.reference.contentHash, sourceMapHash: f.reference.serializedSha256, maxAttempts: 2 };
      const execution = { mode: 'model', nativeSourceReview: identity };
      seam.requireExecution.mockResolvedValue(execution); seam.claim.mockResolvedValue(f.owner);
      Object.assign(f.tx.agentTask, { findUnique: vi.fn(async () => f.owner) });
      f.tx.agentTask.updateMany.mockImplementation(async input => {
        Object.assign(f.owner, { result: structuredClone(input.data.result) }); return { count: 1 };
      });
      const membership = vi.fn().mockResolvedValue({ userId: 'actor', workspaceId: 'workspace', role: 'author' });
      Object.assign(f.tx, { membership: { findUnique: membership }, ingestionTask: { findUnique: vi.fn(async () => ({
        agentTask: f.owner, artifactId: 'artifact', artifact: { workspaceId: 'workspace' },
        batch: { userId: 'actor', researchObjectId: 'ro', researchObject: { workspaceId: 'workspace', workspace: { status: 'active' } } },
      })) } });
      let inTransaction = false;
      f.prisma.$transaction.mockImplementation(async work => { inTransaction = true; try { return await work(f.tx); } finally { inTransaction = false; } });
      const submit = vi.fn(async () => {
        expect(inTransaction).toBe(false);
        if (outcome === 'unknown') throw new Error('connection lost after submit');
        if (outcome === 'revoked-after-submit') membership.mockResolvedValue(null);
        return { text: '{"candidate":"actual-paid-reply"}', model: 'MiniMax-M3', finishReason: 'stop' as const, usage: { inputTokens: 1, outputTokens: 1 } };
      });
      seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
        await context.scientificReview.beforeReviewProviderCall();
        if (outcome === 'revoked') membership.mockResolvedValue(null);
        if (outcome === 'changed-binding') seam.requireExecution.mockResolvedValue({ ...execution, nativeSourceReview: { ...identity, compositionTaskId: 'other' } });
        const call = () => context.scientificReview.nativeSourceReview.withSubmission('c'.repeat(64), 0,
          { provider: 'minimax-key-1-model-1', model: 'MiniMax-M3', promptHash: 'd'.repeat(64) }, submit);
        const result = await call();
        expect(await call()).toEqual(result);
        return { core: { method: 'private native source review' }, needsMoreInformation: [] };
      });
      const poll = await createPollOnce(f.handlers, { runMaintenance: false }); await poll(f.deps as never);
      expect(submit).toHaveBeenCalledTimes(['completed', 'unknown', 'revoked-after-submit'].includes(outcome) ? 1 : 0);
      const cp = (f.owner.result as unknown as { nativeSourceReview: { attempts: Array<{ state: string }> } }).nativeSourceReview;
      expect(cp.attempts).toHaveLength(['completed', 'unknown', 'revoked-after-submit'].includes(outcome) ? 1 : 0);
      if (cp.attempts.length) expect(cp.attempts[0].state).toBe(outcome === 'unknown' ? 'started' : 'completed');
    });

  it.each(['unchanged', 'lease', 'mode', 'policy'])(
    'revalidates an initial model review before both provider calls (%s)', async change => {
      const f = fixture();
      seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
        expect(context.scientificReview.mode).toBe('model');
        await context.scientificReview.beforeReviewProviderCall();
        await f.providerSubmit();
        if (change === 'lease') seam.requireExecution.mockRejectedValue(new Error('[blocked] lease changed'));
        if (change === 'mode') seam.requireExecution.mockResolvedValue({ mode: 'web' });
        if (change === 'policy') f.policy.mockResolvedValue(false);
        await context.scientificReview.beforeReviewProviderCall();
        await f.providerSubmit();
        return { core: { method: 'reviewed' }, needsMoreInformation: [] };
      });
      if (change === 'unchanged') await f.execute(); else await expect(f.execute()).rejects.toThrow('[blocked]');
      expect(f.providerSubmit).toHaveBeenCalledTimes(change === 'unchanged' ? 2 : 1);
      expect(f.parserCascade).not.toHaveBeenCalled();
      expect(f.parserCascade.renderPages).not.toHaveBeenCalled();
    });
});

// This is deliberately handler-seam coverage. The Domain fixture already exercises the
// real saved-output identity, lease, and execution-attempt binder; this test verifies that
// createHandlers passes that bound output to extraction and re-runs the binder immediately
// before the extractor's provider submit boundary.

const ids = {
  ingestion: '11111111-1111-4111-8111-111111111111',
  failed: '22222222-2222-4222-8222-222222222222',
  source: '33333333-3333-4333-8333-333333333333',
  owner: '44444444-4444-4444-8444-444444444444',
};

function fixture(executionAttempt = 1, native = false) {
  const bytes = Buffer.from('%PDF-1.7 saved source review handler fixture');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const parser = { name: 'openscience-parser-cascade', version: '1.0.0' };
  const sourceMap = { artifactId: 'artifact', contentHash, parser, pages: [{ page: 1, width: 500, height: 700,
    blocks: [{ id: 'source-block', kind: 'paragraph', text: 'A source-grounded scientific observation.',
      boundingBox: { x: 0, y: 0, width: 500, height: 60 }, parser, transformations: [] }] }] };
  const serialized = Buffer.from(JSON.stringify(sourceMap));
  const serializedSha256 = createHash('sha256').update(serialized).digest('hex');
  const reference = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'artifact', contentHash,
    serializedSha256, objectKey: `derived/source-maps/${serializedSha256}.json`, size: serialized.length };
  const payload = { artifactId: 'artifact', researchObjectId: 'ro' };
  const session = { userId: 'actor', status: 'active', deletedAt: null, researchObjectId: 'ro',
    researchObject: { id: 'ro', workspaceId: 'workspace', status: 'active', deletedAt: null,
      workspace: { status: 'active' } } };
  const sourceResult = { canonicalExtractionContract: 'grounded-passages-v2', sourceMapRef: reference,
    scientificReview: { semanticStage: { kind: 'semantic_reduce', source: { sourceMapHash: serializedSha256 } } } };
  const owner = { id: ids.owner, kind: 'sdf.extract', status: 'running', executionAttempt, retryCount: 0,
    payload, result: null, sessionId: 'session', session,
    idempotencyKey: `ingestion-analysis-compose:${ids.ingestion}:${ids.failed}:${ids.source}:scientific-review-v4` };
  const failed = { id: ids.failed, kind: 'sdf.extract', status: 'succeeded', payload, result: {},
    session: { status: 'active', userId: 'actor', researchObjectId: 'ro' } };
  const source = { id: ids.source, kind: 'sdf.extract', status: 'succeeded', payload, result: sourceResult,
    session: { status: 'active', userId: 'actor', researchObjectId: 'ro' } };
  const saved = { sourceTaskId: ids.failed, structuredAttempt: 2,
    text: '{"fields":"saved-private-body"}', responseHash: 'a'.repeat(64), promptHash: 'b'.repeat(64),
    provider: 'fixture-provider', model: 'fixture-model', byteLength: 31 };
  const tasks = new Map([[owner.id, owner], [failed.id, failed], [source.id, source]]);
  const stored = new Map([[reference.objectKey, serialized]]);
  const storage = {
    getObject: vi.fn(async (key: string) => {
      const body = stored.get(key) ?? bytes;
      return { body: Readable.from([body]), size: body.length };
    }),
    headObject: vi.fn().mockResolvedValue(null),
    putObject: vi.fn(async (key: string, body: Buffer) => { stored.set(key, body); return { key, size: body.length, etag: 'test' }; }),
  };
  const tx = {
    artifact: { findFirst: vi.fn().mockResolvedValue({ id: 'artifact' }) },
    agentTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: vi.fn(),
  };
  const prisma = {
    agentTask: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => structuredClone(tasks.get(where.id) ?? null)) },
    artifact: { findUnique: vi.fn().mockResolvedValue({ id: 'artifact', workspaceId: 'workspace', size: bytes.length,
      blobSha256: contentHash, logicalPath: 'paper.pdf', mimeType: 'application/pdf', deletedAt: null, bytesPurgedAt: null }) },
    membership: { findUnique: vi.fn().mockResolvedValue({ userId: 'actor', workspaceId: 'workspace', role: 'author' }) },
    ingestionTask: { findUnique: vi.fn().mockResolvedValue({ id: ids.ingestion, agentTaskId: ids.owner, artifactId: 'artifact',
      batch: { userId: 'actor', researchObjectId: 'ro' } }) },
    hermesResearchStep: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const parserCascade = Object.assign(vi.fn(), { renderPages: vi.fn() });
  const policy = vi.fn().mockResolvedValue(true);
  const providerSubmit = vi.fn();
  const gateway = { completeStructured: providerSubmit, completeStructuredWithMetadata: providerSubmit } as unknown as AiGateway;
  const handlers = createHandlers(gateway, { parserCascade, externalProcessingPolicy: policy,
    ...(native ? { nativeAgentInboxRoot: '/native/inbox' } : {}) });
  const deps = { prisma, storage, malwareScanner: vi.fn(), redis: {
    brpoplpush: vi.fn().mockResolvedValue(ids.owner), lrem: vi.fn().mockResolvedValue(1),
  } };
  const execute = () => handlers['sdf.extract']!(deps as never,
    { id: ids.owner, payload, executionAttempt, retryCount: 0 });
  return { execute, owner, source, sourceResult, sourceMap, saved, reference, parserCascade, policy, providerSubmit,
    prisma, tx, storage, deps, handlers };
}

describe('independent native reviewer handler dispatch and authority', () => {
  beforeEach(() => {
    seam.extractHandler.mockReset(); seam.nativeReview.mockReset(); seam.nativeAuthority.mockReset().mockResolvedValue(undefined);
    seam.requireExecution.mockReset(); seam.resolveReanalysis.mockReset().mockResolvedValue(null);
    seam.lock.mockReset().mockResolvedValue(undefined); seam.progress.mockReset().mockResolvedValue(undefined);
  });

  function nativeFixture() {
    const f = fixture(1, true);
    Object.assign(f.owner, { result: { nativeAgentExecution: { kind: 'hermes-agent', profile: 'paper-source-review',
      runtimeId: 'installed-runtime', skillCatalogueId: 'installed-skills', model: 'MiniMax-M3' } } });
    const execution = { mode: 'agent', taskId: ids.owner, runId: 'run', sourceAgentTaskId: ids.source,
      authorCheckpointSha256: 'a'.repeat(64), sourceMapRef: f.reference,
      sourceResult: { core: { method: 'actual author candidate' }, scientificReview: { kind: 'hermes_agent_review' } } };
    seam.requireExecution.mockResolvedValue(execution);
    Object.assign(f.tx.agentTask, { findUnique: vi.fn(async () => f.owner) });
    f.tx.agentTask.updateMany.mockImplementation(async input => { Object.assign(f.owner, { result: structuredClone(input.data.result) }); return { count: 1 }; });
    const membership = vi.fn().mockResolvedValue({ userId: 'actor', workspaceId: 'workspace', role: 'author' });
    Object.assign(f.tx, { membership: { findUnique: membership }, ingestionTask: { findUnique: vi.fn(async () => ({
      agentTask: f.owner, artifactId: 'artifact', artifact: { workspaceId: 'workspace' },
      batch: { userId: 'actor', researchObjectId: 'ro', researchObject: { workspaceId: 'workspace', workspace: { status: 'active' } } },
    })) } });
    return { ...f, execution, membership };
  }

  it('uses the bound author source in the actual handler without legacy semanticStage, parsing or fixed review', async () => {
    const f = nativeFixture();
    seam.nativeReview.mockImplementation(async input => { await input.authorize(f.tx); return { core: { method: 'independently reviewed' } }; });
    await expect(f.execute()).resolves.toMatchObject({ core: { method: 'independently reviewed' } });
    expect(seam.nativeReview).toHaveBeenCalledOnce();
    expect(seam.nativeReview.mock.calls[0]![0]).toMatchObject({ sourceAgentTaskId: ids.source, authorCheckpointSha256: 'a'.repeat(64),
      sourceResult: f.execution.sourceResult, sourceMap: f.sourceMap });
    expect(f.parserCascade).not.toHaveBeenCalled(); expect(seam.extractHandler).not.toHaveBeenCalled(); expect(f.providerSubmit).not.toHaveBeenCalled();
    expect(seam.nativeAuthority).toHaveBeenCalledWith(f.tx, { taskId: ids.owner, executionAttempt: 1 });
  });

  it.each(['author', 'checkpoint', 'candidate', 'membership', 'lease'])('rechecks %s before the native provider or source tool can proceed', async changed => {
    const f = nativeFixture(); const publish = vi.fn();
    seam.nativeReview.mockImplementation(async input => {
      await input.authorize(f.tx);
      if (changed === 'author') seam.requireExecution.mockResolvedValue({ ...f.execution, sourceAgentTaskId: 'other' });
      if (changed === 'checkpoint') seam.requireExecution.mockResolvedValue({ ...f.execution, authorCheckpointSha256: 'b'.repeat(64) });
      if (changed === 'candidate') seam.requireExecution.mockResolvedValue({ ...f.execution, sourceResult: { changed: true } });
      if (changed === 'membership') f.membership.mockResolvedValue(null);
      if (changed === 'lease') seam.nativeAuthority.mockRejectedValue(new Error('[blocked] lease changed'));
      await input.authorize(f.tx); publish(); return {};
    });
    await expect(f.execute()).rejects.toThrow('[blocked]'); expect(publish).not.toHaveBeenCalled();
  });

  it.each(['key', 'profile', 'source'])('rejects a mismatched native %s before dispatch or parser work', async changed => {
    const f = nativeFixture();
    if (changed === 'key') f.owner.idempotencyKey = 'unbound-review';
    if (changed === 'profile') (f.owner.result as unknown as { nativeAgentExecution: { profile: string } }).nativeAgentExecution.profile = 'paper-understanding';
    if (changed === 'source') seam.requireExecution.mockResolvedValue({ ...f.execution, sourceMapRef: { ...f.reference, artifactId: 'foreign' } });
    await expect(f.execute()).rejects.toThrow('[blocked]');
    expect(seam.nativeReview).not.toHaveBeenCalled(); expect(f.parserCascade).not.toHaveBeenCalled(); expect(seam.extractHandler).not.toHaveBeenCalled();
  });
});

describe('bound final source composition handler', () => {
  beforeEach(() => {
    seam.extractHandler.mockReset().mockResolvedValue({ core: { method: 'private composition' }, needsMoreInformation: [] });
    seam.requireComposition.mockReset(); seam.progress.mockReset().mockResolvedValue(undefined);
    seam.lock.mockReset().mockResolvedValue(undefined);
  });

  function compositionFixture() {
    const f = fixture();
    f.owner.idempotencyKey = `ingestion-analysis-final-compose:${ids.ingestion}:${ids.failed}`;
    const execution = { runId: 'run', taskId: ids.owner, sourceMapRef: f.reference, previousResult: f.sourceResult };
    seam.requireComposition.mockResolvedValue(execution);
    return { ...f, execution };
  }

  it('forwards only the original bound stage for a final-only composition without parsing or web review', async () => {
    const f = compositionFixture();
    await f.handlers['sdf.extract']!(f.deps as never, { id: ids.owner, executionAttempt: 1, retryCount: 0,
      payload: { ...f.owner.payload, mode: 'web', previousResult: { forged: true } } });
    expect(seam.requireComposition).toHaveBeenCalledWith(f.tx, { ownerTaskId: ids.owner,
      ingestionTaskId: ids.ingestion, sourceAgentTaskId: ids.failed, executionAttempt: 1 });
    const context = seam.extractHandler.mock.calls[0]![2];
    expect(context.sourceMap).toEqual(f.sourceMap); expect(context.previousResult).toEqual(f.sourceResult);
    expect(context.requireReusableSemanticStage).toBe(true); expect(context.reviewExistingSourceTaskId).toBeUndefined();
    expect(context.scientificReview.mode).toBe('model');
    expect(f.parserCascade).not.toHaveBeenCalled(); expect(f.parserCascade.renderPages).not.toHaveBeenCalled();
  });

  it('retains the existing scientific-summary-v3 source reuse consumer', async () => {
    const f = fixture(); f.owner.idempotencyKey = f.owner.idempotencyKey.replace('scientific-review-v4', 'scientific-summary-v3');
    Object.assign(f.sourceResult.scientificReview, { reviewedCandidateHash: 'a'.repeat(64) });
    await f.execute(); const context = seam.extractHandler.mock.calls[0]![2];
    expect(context.previousResult).toEqual(f.sourceResult); expect(context.requireReusableSemanticStage).toBe(true);
    expect(context.reviewExistingSourceTaskId).toBeUndefined(); expect(f.parserCascade).not.toHaveBeenCalled();
    expect(seam.requireComposition).not.toHaveBeenCalled();
  });

  it.each(['lease', 'receipt', 'cancelled', 'source-map'])(
    'refuses changed %s before checkpoint, parser, or provider work', async change => {
      const f = compositionFixture(); seam.requireComposition.mockRejectedValue(new Error(`[blocked] ${change} changed`));
      await expect(f.execute()).rejects.toThrow(`${change} changed`);
      expect(seam.extractHandler).not.toHaveBeenCalled(); expect(f.storage.putObject).not.toHaveBeenCalled();
      expect(f.tx.agentTask.updateMany).not.toHaveBeenCalled(); expect(f.providerSubmit).not.toHaveBeenCalled();
    });

  it.each(['unchanged', 'binding', 'policy', 'lease'])(
    'rebinds the same attempt immediately before each initial and repair call (%s)', async change => {
      const f = compositionFixture();
      seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
        await context.scientificReview.beforeReviewProviderCall(); await f.providerSubmit();
        if (change === 'binding') seam.requireComposition.mockResolvedValue({ ...f.execution, previousResult: { changed: true } });
        if (change === 'policy') f.policy.mockResolvedValue(false);
        if (change === 'lease') seam.requireComposition.mockRejectedValue(new Error('[blocked] lease changed'));
        await context.scientificReview.beforeReviewProviderCall(); await f.providerSubmit();
        return { core: { method: 'private composition' }, needsMoreInformation: [] };
      });
      if (change === 'unchanged') await f.execute(); else await expect(f.execute()).rejects.toThrow('[blocked]');
      expect(f.providerSubmit).toHaveBeenCalledTimes(change === 'unchanged' ? 2 : 1);
      expect(seam.requireComposition).toHaveBeenCalledTimes(3);
      for (const call of seam.requireComposition.mock.calls) expect(call[1].executionAttempt).toBe(1);
      expect(f.parserCascade).not.toHaveBeenCalled();
    });
});

describe('fresh private source reanalysis handler', () => {
  beforeEach(() => {
    seam.extractHandler.mockReset().mockResolvedValue({ core: { method: 'fresh analysis' }, needsMoreInformation: [] });
    seam.requireExecution.mockReset();
    seam.resolveReanalysis.mockReset().mockResolvedValue(null);
    seam.savedCommit.mockReset().mockResolvedValue(null);
    seam.progress.mockReset().mockResolvedValue(undefined);
    seam.lock.mockReset().mockResolvedValue(undefined);
  });

  function reanalysisFixture() {
    const f = fixture();
    f.owner.idempotencyKey = `ingestion-analysis-reanalysis:${ids.ingestion}:${ids.source}`;
    f.prisma.ingestionTask.findUnique.mockResolvedValue({ id: ids.ingestion, agentTaskId: ids.owner,
      artifactId: 'artifact', state: 'queued', batch: { userId: 'actor', researchObjectId: 'ro' } } as never);
    Object.assign(f.source, { ingestionTask: { id: ids.failed, state: 'needs_review', artifactId: 'artifact',
      batch: { userId: 'actor', researchObjectId: 'ro' } } });
    return f;
  }

  it('reuses the bound extraction, skips parser/OCR, and performs a fresh composition', async () => {
    const f = reanalysisFixture();
    seam.resolveReanalysis.mockResolvedValue({ sourceMapRef: f.reference });
    await expect(f.execute()).resolves.toMatchObject({ core: { method: 'fresh analysis' }, sourceMapReused: true });
    expect(seam.resolveReanalysis).toHaveBeenCalledWith(f.tx, { ownerTaskId: ids.owner,
      ingestionTaskId: ids.ingestion, sourceAgentTaskId: ids.source, executionAttempt: 1 });
    expect(f.parserCascade).not.toHaveBeenCalled();
    expect(f.parserCascade.renderPages).not.toHaveBeenCalled();
    expect(seam.extractHandler).toHaveBeenCalledOnce();
    const context = seam.extractHandler.mock.calls[0]![2];
    expect(context.sourceMap).toEqual(f.sourceMap);
    expect(context.previousResult).toBeUndefined();
    expect(context.requireReusableSemanticStage).toBe(false);
    expect(context.reviewExistingSourceTaskId).toBeUndefined();
    expect(seam.requireExecution).not.toHaveBeenCalled();
  });

  it.each(['actor', 'run-version', 'receipt', 'lease'] as const)(
    'rejects changed %s before parsing, composition, or checkpoint writes', async change => {
      const f = reanalysisFixture();
      seam.resolveReanalysis.mockRejectedValue(new Error(`[blocked] private reanalysis ${change} changed`));
      await expect(f.execute()).rejects.toThrow(`private reanalysis ${change} changed`);
      expect(seam.extractHandler).not.toHaveBeenCalled();
      expect(f.parserCascade).not.toHaveBeenCalled();
      expect(f.storage.putObject).not.toHaveBeenCalled();
      expect(f.tx.agentTask.updateMany).not.toHaveBeenCalled();
    });

  it('rejects a bound SourceMap for a different PDF without falling back to OCR', async () => {
    const f = reanalysisFixture();
    seam.resolveReanalysis.mockResolvedValue({ sourceMapRef: { ...f.reference, contentHash: 'a'.repeat(64) } });
    await expect(f.execute()).rejects.toThrow('source identity changed');
    expect(seam.extractHandler).not.toHaveBeenCalled();
    expect(f.parserCascade).not.toHaveBeenCalled();
  });

  it('does not turn absent private authority into an arbitrary unconfirmed reanalysis', async () => {
    const f = reanalysisFixture();
    await expect(f.execute()).rejects.toThrow('[blocked]');
    expect(seam.resolveReanalysis).toHaveBeenCalledOnce();
    expect(seam.extractHandler).not.toHaveBeenCalled();
    expect(f.parserCascade).not.toHaveBeenCalled();
  });

  it('preserves the existing confirmed reanalysis path when no private intent exists', async () => {
    const f = reanalysisFixture();
    Object.assign(f.source, { ingestionTask: { id: ids.failed, state: 'confirmed', artifactId: 'artifact',
      batch: { userId: 'actor', researchObjectId: 'ro' } } });
    seam.savedCommit.mockResolvedValue({ commit: { researchObjectId: 'ro' } });
    await expect(f.execute()).resolves.toMatchObject({ sourceMapReused: true });
    expect(f.parserCascade).not.toHaveBeenCalled();
    expect(seam.extractHandler).toHaveBeenCalledOnce();
  });
});

describe('saved source-review handler seam', () => {
  beforeEach(() => {
    seam.extractHandler.mockReset();
    seam.requireExecution.mockReset().mockResolvedValue({ mode: 'model' });
    seam.resolveReanalysis.mockReset().mockResolvedValue(null);
    seam.savedCommit.mockReset().mockResolvedValue(null);
    seam.claim.mockReset().mockResolvedValue({ executionAttempt: 1, retryCount: 0 });
    seam.progress.mockReset().mockResolvedValue(undefined);
    seam.lock.mockReset().mockResolvedValue(undefined);
  });

  it.each(['unchanged', 'downgraded', 'revoked', 'run', 'receipt', 'proof', 'task-key', 'legacy'] as const)(
    'rechecks bound authority in the actual final spool transaction (%s)', async change => {
      const f = fixture();
      const execution = { mode: 'web', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
        taskId: ids.owner, runId: 'run', savedOutput: f.saved };
      seam.requireExecution.mockResolvedValue(change === 'legacy' ? { mode: 'model', savedOutput: f.saved } : execution);
      Object.assign(f.tx.agentTask, { findUnique: f.prisma.agentTask.findUnique });
      const membership = { findUnique: vi.fn().mockResolvedValue({ userId: 'actor', workspaceId: 'workspace', role: 'author' }) };
      Object.assign(f.tx, {
        artifact: { ...f.tx.artifact, ...f.prisma.artifact },
        membership,
        ingestionTask: { findUnique: vi.fn(async () => ({ agentTask: f.owner, artifactId: 'artifact',
          artifact: { workspaceId: 'workspace' }, batch: { userId: 'actor', researchObjectId: 'ro',
            researchObject: { workspaceId: 'workspace', workspace: { status: 'active' } } } })) },
      });
      const publish = vi.fn(async () => 'published');
      const submission = createSpoolSubmission(f.prisma as never, 'sdf.extract');
      seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
        await context.scientificReview.beforeReviewProviderCall();
        // This is the readiness/disk-await gap after successful early binding and policy.
        await Promise.resolve();
        if (change === 'downgraded' || change === 'revoked')
          membership.findUnique.mockResolvedValue(change === 'revoked' ? null : {
            userId: 'actor', workspaceId: 'workspace', role: 'reader' });
        if (change === 'run') seam.requireExecution.mockRejectedValue(new Error('[blocked] run cancelled'));
        if (change === 'receipt') seam.requireExecution.mockResolvedValue({ ...execution, savedOutput: { ...f.saved, text: 'changed' } });
        if (change === 'proof') seam.requireExecution.mockResolvedValue({ ...execution, notSubmittedRecovery: {
          requestId: 'different', promptHash: 'a'.repeat(64), artifactId: 'artifact',
          documentSha256: 'b'.repeat(64), candidateHash: 'c'.repeat(64), sourceMapHash: 'd'.repeat(64) } });
        if (change === 'task-key') f.owner.idempotencyKey = f.owner.idempotencyKey.replace(ids.failed, ids.source);
        await submission({ taskId: ids.owner, artifactId: 'artifact' }, publish);
        return { core: { method: 'reviewed' }, needsMoreInformation: [] };
      });
      const poll = await createPollOnce(f.handlers, { runMaintenance: false });
      await poll(f.deps as never);
      expect(f.policy, JSON.stringify(seam.progress.mock.calls.map(call => call[1]))).toHaveBeenCalledTimes(2);
      expect(seam.lock).toHaveBeenCalledTimes(2); // Existing parser checkpoint, then final spool publication.
      if (change === 'unchanged' || change === 'legacy') {
        expect(publish).toHaveBeenCalledOnce();
        expect(seam.progress).toHaveBeenLastCalledWith(f.deps, expect.objectContaining({ status: 'succeeded' }));
        expect(seam.requireExecution).toHaveBeenCalledTimes(change === 'legacy' ? 2 : 3);
      } else {
        // The provider puts attachments, reservation and queue file exclusively inside publish.
        expect(publish).not.toHaveBeenCalled();
        expect(seam.progress).toHaveBeenLastCalledWith(f.deps, expect.objectContaining({ status: 'failed', error: expect.stringContaining('[blocked]') }));
      }
    });

  it.each(['initial', 'saved', 'technical'] as const)('binds the server-owned %s independent role and the original execution lease at submit', async kind => {
    const f = fixture(2);
    if (kind === 'initial') f.owner.idempotencyKey = `ingestion-analysis-compose:${ids.ingestion}:${ids.source}:${ids.source}:scientific-review-v4`;
    const proof = { requestId: 'original-request', promptHash: 'a'.repeat(64), artifactId: 'artifact',
      documentSha256: f.sourceMap.contentHash, candidateHash: 'c'.repeat(64), sourceMapHash: 'd'.repeat(64) };
    const execution = { mode: 'web', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
      taskId: ids.owner, runId: 'run', ...(kind !== 'initial' ? { savedOutput: f.saved } : {}),
      ...(kind === 'technical' ? { notSubmittedRecovery: proof } : {}) };
    seam.requireExecution.mockResolvedValue(execution);
    seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
      expect(context).toMatchObject({ requireReusableSemanticStage: true, reviewExistingSourceTaskId: ids.source,
        scientificReview: { mode: 'web', requestId: ids.owner, requireReviewedClaims: true,
          sourceDocument: { sha256: f.sourceMap.contentHash, mediaType: 'application/pdf' } } });
      expect(context.scientificReview.savedReviewOutput).toBe(kind !== 'initial' ? f.saved : undefined);
      expect(context.scientificReview.sourceReviewRecovery).toEqual(kind === 'technical' ? proof : undefined);
      await context.scientificReview.beforeReviewProviderCall();
      f.providerSubmit(); return { core: { method: 'independently reviewed' }, needsMoreInformation: [] };
    });
    await expect(f.execute()).resolves.toMatchObject({ core: { method: 'independently reviewed' } });
    expect(seam.requireExecution).toHaveBeenCalledTimes(2);
    for (const [tx, input] of seam.requireExecution.mock.calls) {
      expect(tx).toBe(f.tx);
      expect(input).toEqual({ ownerTaskId: ids.owner, ingestionTaskId: ids.ingestion, compositionTaskId: ids.source,
        failedTaskId: kind === 'initial' ? ids.source : ids.failed, executionAttempt: 2 });
    }
    expect(f.parserCascade).not.toHaveBeenCalled(); expect(f.providerSubmit).toHaveBeenCalledOnce();
  });

  it.each(['mode', 'saved-body', 'lease', 'authorization'] as const)('rejects a changed independent %s before submit', async change => {
    const f = fixture();
    const execution = { mode: 'web', provider: 'chatgpt-web-science-review', model: 'chatgpt-web/6-pro',
      taskId: ids.owner, runId: 'run', savedOutput: f.saved };
    seam.requireExecution.mockResolvedValueOnce(execution);
    if (change === 'lease') seam.requireExecution.mockRejectedValue(new Error('[blocked] execution lease changed'));
    else seam.requireExecution.mockResolvedValue(change === 'mode' ? { mode: 'model' }
      : change === 'saved-body' ? { ...execution, savedOutput: { ...f.saved, text: 'changed' } } : execution);
    f.policy.mockResolvedValueOnce(true).mockResolvedValue(change !== 'authorization');
    seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
      await context.scientificReview.beforeReviewProviderCall(); f.providerSubmit();
    });
    await expect(f.execute()).rejects.toThrow('[blocked]');
    expect(f.providerSubmit).not.toHaveBeenCalled();
  });

  it('passes the exact saved body and trusted context to extraction without rerunning parser or composition', async () => {
    const f = fixture();
    const events: string[] = [];
    seam.requireExecution.mockImplementation(async () => { events.push('bind'); return { mode: 'model', savedOutput: f.saved }; });
    f.policy.mockImplementation(async () => { events.push('authorize'); return true; });
    seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
      expect(context).toMatchObject({ sourceMap: f.sourceMap, previousResult: f.sourceResult,
        requireReusableSemanticStage: true, reviewExistingSourceTaskId: ids.source,
        scientificReview: { requestId: ids.owner, requireReviewedClaims: true,
          savedReviewOutput: f.saved, authorizationContext: { taskId: ids.owner, workspaceId: 'workspace', actorId: 'actor' } } });
      expect(context.scientificReview.savedReviewOutput).toBe(f.saved);
      await context.scientificReview.beforeReviewProviderCall();
      events.push('submit'); f.providerSubmit();
      return { core: { method: 'corrected' }, needsMoreInformation: [] };
    });

    await expect(f.execute()).resolves.toMatchObject({ core: { method: 'corrected' }, sourceMapReused: true });
    expect(f.parserCascade).not.toHaveBeenCalled();
    expect(seam.extractHandler).toHaveBeenCalledOnce();
    expect(seam.requireExecution).toHaveBeenCalledTimes(2);
    expect(seam.requireExecution).toHaveBeenNthCalledWith(1, f.tx, {
      ownerTaskId: ids.owner, ingestionTaskId: ids.ingestion, failedTaskId: ids.failed, compositionTaskId: ids.source, executionAttempt: 1,
    });
    expect(seam.requireExecution).toHaveBeenNthCalledWith(2, f.tx, {
      ownerTaskId: ids.owner, ingestionTaskId: ids.ingestion, failedTaskId: ids.failed, compositionTaskId: ids.source, executionAttempt: 1,
    });
    expect(f.policy).toHaveBeenCalledTimes(2);
    expect(f.providerSubmit).toHaveBeenCalledOnce();
    expect(events).toEqual(['authorize', 'bind', 'bind', 'authorize', 'submit']);
  });

  it('rejects execution attempt 2 at the binding seam before extraction, submit, or result materialization', async () => {
    const f = fixture(2);
    seam.requireExecution.mockRejectedValue(new Error('[blocked] Saved source review binding changed'));

    await expect(f.execute()).rejects.toThrow('binding changed');
    expect(seam.requireExecution).toHaveBeenCalledOnce();
    expect(seam.extractHandler).not.toHaveBeenCalled();
    expect(f.providerSubmit).not.toHaveBeenCalled();
    expect(f.parserCascade).not.toHaveBeenCalled();
    expect(f.storage.putObject).not.toHaveBeenCalled();
    expect(f.tx.agentTask.updateMany).not.toHaveBeenCalled();
  });

  it.each(['authorization', 'saved-body'] as const)('stops a changed %s at the final submit boundary', async change => {
    const f = fixture();
    seam.requireExecution.mockResolvedValueOnce({ mode: 'model', savedOutput: f.saved }).mockResolvedValue(
      { mode: 'model', savedOutput: change === 'saved-body' ? { ...f.saved, text: 'changed' } : f.saved });
    f.policy.mockResolvedValueOnce(true).mockResolvedValue(change !== 'authorization');
    seam.extractHandler.mockImplementation(async (_gateway, _task, context) => {
      await context.scientificReview.beforeReviewProviderCall();
      f.providerSubmit();
      return { core: { method: 'must not materialize' } };
    });
    await expect(f.execute()).rejects.toThrow('authorization changed');
    expect(f.providerSubmit).not.toHaveBeenCalled();
    // The existing parsed-source checkpoint precedes the provider boundary; it is not a scientific result.
    expect(f.tx.agentTask.updateMany.mock.calls.every(([input]) =>
      Object.keys(input.data.result).join(',') === 'sourceMapRef')).toBe(true);
  });
});

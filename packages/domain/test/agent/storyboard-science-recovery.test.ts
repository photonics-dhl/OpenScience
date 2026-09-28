import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as presentation from '../../src/assets/presentation-asset';
import { getHermesResearchRun, retryHermesGeneration, type HermesResearchRunDeps } from '../../src/agent/research-run';
import { parsePresentationGenerationPayload } from '../../src/assets/presentation-asset';
import { VISUAL_NARRATIVE_PROFILE } from '../../src/assets/video';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture() {
  const old = new Date('2026-09-20T00:00:00Z');
  const createdAt = new Date('2026-09-20T01:00:00Z');
  const updatedAt = new Date('2026-09-20T02:00:00Z');
  const ids = { actorId: uuid(1), researchObjectId: uuid(2), runId: uuid(3), versionId: uuid(4), claim: uuid(5), task: uuid(6) };
  const settings = { locale: 'zh', style: 'watercolor', instruction: 'Explain the sourced relationship' };
  const payload = parsePresentationGenerationPayload({ schemaVersion: 1, kind: 'interactive_html',
    researchObjectId: ids.researchObjectId, versionId: ids.versionId, sourceClaimIds: [ids.claim],
    storyboard: { ...settings, output: 'image', narrative: true, narrativeSceneLimit: 6 },
    hermesRunAuthority: { runId: ids.runId, stage: 'storyboard', ordinal: 0, profile: VISUAL_NARRATIVE_PROFILE } });
  const session = { status: 'active', deletedAt: null, userId: ids.actorId, researchObjectId: ids.researchObjectId };
  const task = { id: ids.task, kind: 'presentation.generate', status: 'failed', deletedAt: null, session,
    executionAttempt: 1, retryCount: 0, payload, result: null as unknown, progress: 10, dispatchedAt: null,
    idempotencyKey: `hermes-run:${ids.runId}:storyboard:0`, error: '结构化输出超过重试上限', createdAt, updatedAt };
  const provenance = { source: 'reviewed_ingestion', sourceTaskId: 'ingestion' };
  const claim = { id: ids.claim, parentClaimId: null, kind: 'method', statement: 'Measured width', assessment: 'supported',
    conditions: [], limitations: [], extractionStatus: 'succeeded', provenance, updatedAt: old };
  const evidence = { id: 'evidence', claimId: ids.claim, artifactId: 'artifact', contentHash: 'a'.repeat(64),
    exactQuote: 'The slit width is 20 nm.', relation: 'supports', locator: {}, extractionStatus: 'succeeded', updatedAt: old, provenance };
  const sourceMapRef = { schemaVersion: 1, parserStatus: 'succeeded', artifactId: 'artifact', contentHash: 'a'.repeat(64),
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 100 };
  const sourceResult = { sourceMapRef, scientificReview: { status: 'review_received', contractVersion: '5', responseHash: 'c'.repeat(64) } };
  const ingestion = { id: 'ingestion', state: 'confirmed', artifactId: 'artifact',
    batch: { userId: ids.actorId, researchObjectId: ids.researchObjectId },
    artifact: { workspaceId: 'workspace', blobSha256: 'a'.repeat(64), deletedAt: null, bytesPurgedAt: null },
    agentTask: { id: 'source-task', kind: 'sdf.extract', status: 'succeeded', deletedAt: null, session, updatedAt: old, result: sourceResult } };
  const version = { id: ids.versionId, researchObjectId: ids.researchObjectId, status: 'draft', publicVersionId: null, publicationNo: null,
    manifest: { id: 'manifest', coreJson: {}, createdAt: old, entries: [{ artifactId: 'artifact', blobSha256: 'a'.repeat(64) }] } };
  const run = { id: ids.runId, actorId: ids.actorId, researchObjectId: ids.researchObjectId, versionId: ids.versionId,
    profile: VISUAL_NARRATIVE_PROFILE, generationSettings: settings, maxAgentTasks: 9, sourceClaimIds: [ids.claim],
    status: 'failed', version: 1, error: task.error, createdAt, updatedAt,
    steps: [
      { id: 'source-step', stage: 'source_ingestion', ordinal: 0, status: 'succeeded', ingestionTaskId: ingestion.id },
      { id: 'review-step', stage: 'source_review', ordinal: 0, status: 'succeeded' },
      { id: 'plan-step', stage: 'storyboard', ordinal: 0, status: 'failed', agentTaskId: task.id, presentationAssetId: null, error: task.error },
    ] };
  const { provenance: _provenance, updatedAt: _updated, ...content } = claim;
  const identity = { payload, sourceEvidenceIdentity: createHash('sha256').update(JSON.stringify([evidence])).digest('hex'),
    claimContent: JSON.stringify([content]), baseIdentity: null,
    narrativeSourceIdentity: JSON.stringify({ versionId: version.id, manifestId: version.manifest.id, core: {},
      ingestionTaskId: ingestion.id, sourceTaskId: ingestion.agentTask.id, sourceUpdatedAt: old,
      reviewResponseHash: sourceResult.scientificReview.responseHash, sourceMapRef }) };
  const diagnostics = { ...identity, executionAttempt: 1,
    sources: [{ sourceId: 's0', claimId: ids.claim, evidenceId: evidence.id, text: evidence.exactQuote, relation: evidence.relation }],
    candidates: [{ structuredAttempt: 1, kind: 'schema_validation', text: 'PRIVATE SCIENCE CANDIDATE', diagnostic: 'unbound variable' }] };
  const calls = [1, 2, 3].map(n => ({ id: `call-${n}`, actorId: null, targetType: 'ai_gateway', createdAt: new Date(`2026-09-20T01:0${n}:00Z`),
    metadata: { operation: 'text', outcome: 'succeeded', fallbackReason: null, error: null, finishReason: 'stop',
      retryCount: 0, requestedThinking: 'adaptive', maxOutputTokens: 65536, provider: 'minimax', model: 'MiniMax-M3', promptHash: 'd'.repeat(64) } }));
  const membership = { role: 'author' };
  const audit = vi.fn();
  const prisma = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
    workspace: { findUnique: vi.fn(async () => ({ id: 'workspace', status: 'active' })) },
    membership: { findUnique: vi.fn(async () => membership) },
    researchObject: { findUnique: vi.fn(async () => ({ id: ids.researchObjectId, workspaceId: 'workspace', status: 'draft', deletedAt: null })) },
    version: { findUnique: vi.fn(async () => version) },
    claimNode: { findMany: vi.fn(async () => [claim]) },
    evidenceRecord: { findMany: vi.fn(async () => [evidence]) },
    ingestionTask: { findMany: vi.fn(async () => [ingestion]), findUnique: vi.fn(async () => ingestion) },
    presentationAsset: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    auditLog: { findFirst: vi.fn(async () => null), findMany: vi.fn(async ({ where }) => where.action === 'ai.gateway.call' ? calls : []) },
    agentTask: { findUnique: vi.fn(async () => ({ ...task })), findFirst: vi.fn(async () => null),
      findMany: vi.fn(async ({ where }) => where.kind === 'presentation.generate' ? [{ id: task.id, status: task.status }] : []),
      count: vi.fn(async () => 0), updateMany: vi.fn(async ({ where, data }) => {
        if (where.result && !isDeepStrictEqual(where.result.equals, task.result === null ? Prisma.AnyNull : task.result)) return { count: 0 };
        Object.assign(task, data, { result: data.result === Prisma.DbNull ? null : (data.result ?? task.result),
          retryCount: data.retryCount?.increment ? task.retryCount + data.retryCount.increment : task.retryCount });
        return { count: 1 };
      }) },
    hermesResearchRun: { findUnique: vi.fn(async () => run), findUniqueOrThrow: vi.fn(async () => run),
      updateMany: vi.fn(async ({ data }) => { Object.assign(run, data, { version: run.version + 1 }); return { count: 1 }; }) },
    hermesResearchStep: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const redis = { lpush: vi.fn(async () => 1) };
  const deps = { prisma, redis, audit: { record: audit } } as unknown as HermesResearchRunDeps;
  const input = { actorId: ids.actorId, researchObjectId: ids.researchObjectId, runId: ids.runId, expectedVersion: 1, idempotencyKey: 'retry' };
  return { deps, input, task, diagnostics, calls, membership, prisma, audit, run, claim, evidence, redis };
}

describe('storyboard science diagnostics recovery', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([false, true])('offers the same planning recovery for diagnostics=%s', async withDiagnostics => {
    const f = fixture();
    if (withDiagnostics) f.task.result = { storyboardScienceDiagnostics: f.diagnostics };
    const view = await getHermesResearchRun(f.deps, f.input);
    expect(view).toMatchObject({ canRetryGeneration: true, generationRecovery: 'storyboard-planning', chargeableAttempts: 1 });
    expect(JSON.stringify(view)).not.toContain('PRIVATE SCIENCE');
  });

  it.each([false, true])('rearms diagnostics=%s inside the authorized full-result CAS without raw audit data', async withDiagnostics => {
    const f = fixture(); const result = withDiagnostics ? { storyboardScienceDiagnostics: f.diagnostics } : null; f.task.result = result;
    expect(await retryHermesGeneration(f.deps, f.input)).toMatchObject({ status: 'generating_storyboard' });
    expect(f.prisma.agentTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ result: { equals: result ?? Prisma.AnyNull } }),
      data: expect.objectContaining({ status: 'pending', ...(withDiagnostics ? { result: Prisma.DbNull } : {}) }),
    }));
    expect(f.task.result).toBeNull(); expect(f.redis.lpush).toHaveBeenCalledOnce();
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({
      planningFailureClass: 'full_planning_restart', storyboardPlanningCheckpoint: null,
      priorSubmission: withDiagnostics ? 'known_rejected_output' : 'uncheckpointed_provider_activity',
    }) }), expect.anything());
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('PRIVATE SCIENCE');
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('storyboardScienceDiagnostics');
  });

  it.each([
    ['unknown top-level key', (f: ReturnType<typeof fixture>) => { f.task.result = { storyboardScienceDiagnostics: f.diagnostics, unexpected: true }; }],
    ['mixed checkpoint', (f: ReturnType<typeof fixture>) => { f.task.result = { storyboardScienceDiagnostics: f.diagnostics, storyboardPlanningCheckpoint: {} }; }],
    ['mixed successful plan', (f: ReturnType<typeof fixture>) => { f.task.result = { storyboardScienceDiagnostics: f.diagnostics, storyboardCheckpoint: {} }; }],
    ['wrong attempt', (f: ReturnType<typeof fixture>) => { f.diagnostics.executionAttempt = 2; }],
    ['wrong identity', (f: ReturnType<typeof fixture>) => { f.diagnostics.sourceEvidenceIdentity = '0'.repeat(64); }],
    ['unknown diagnostics key', (f: ReturnType<typeof fixture>) => { Object.assign(f.diagnostics, { authority: true }); }],
    ['unknown candidate key', (f: ReturnType<typeof fixture>) => { Object.assign(f.diagnostics.candidates[0]!, { authority: true }); }],
    ['wrong candidate kind', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates[0]!.kind = 'accepted'; }],
    ['non-string candidate kind', (f: ReturnType<typeof fixture>) => { Object.assign(f.diagnostics.candidates[0]!, { kind: ['json_parse'] }); }],
    ['wrong candidate attempt', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates[0]!.structuredAttempt = 4; }],
    ['missing diagnostic', (f: ReturnType<typeof fixture>) => { Reflect.deleteProperty(f.diagnostics.candidates[0]!, 'diagnostic'); }],
    ['empty candidates', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates = []; }],
    ['oversized candidate', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates[0]!.text = 'x'.repeat(131073); }],
    ['oversized diagnostic', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates[0]!.diagnostic = 'x'.repeat(513); }],
    ['too many candidates', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates = Array(4).fill(f.diagnostics.candidates[0]); }],
    ['repeated structured attempt', (f: ReturnType<typeof fixture>) => { f.diagnostics.candidates.push({ ...f.diagnostics.candidates[0]! }); }],
    ['unknown source field', (f: ReturnType<typeof fixture>) => { Object.assign(f.diagnostics.sources[0]!, { authority: true }); }],
    ['non-string source field', (f: ReturnType<typeof fixture>) => { Object.assign(f.diagnostics.sources[0]!, { text: 20 }); }],
    ['oversized UTF-8 sources', (f: ReturnType<typeof fixture>) => { f.diagnostics.sources[0]!.text = '中'.repeat(175000); }],
  ] as const)('rejects %s', async (_name, mutate) => {
    const f = fixture(); f.task.result = { storyboardScienceDiagnostics: f.diagnostics }; mutate(f);
    expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
    expect(f.prisma.agentTask.updateMany).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled(); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it.each(['reader', 'unknown', 'changed source', 'wrong authority'] as const)('diagnostics do not override %s rejection', async reason => {
    const f = fixture(); f.task.result = { storyboardScienceDiagnostics: f.diagnostics };
    if (reason === 'reader') f.membership.role = 'reader';
    if (reason === 'unknown') f.calls[0]!.metadata.outcome = 'unknown';
    if (reason === 'changed source') f.evidence.extractionStatus = 'failed';
    if (reason === 'wrong authority') f.task.payload.hermesRunAuthority!.runId = uuid(99);
    expect((await getHermesResearchRun(f.deps, f.input)).canRetryGeneration).not.toBe(true);
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: reason === 'reader' ? 'FORBIDDEN' : 'SOURCE_NOT_READY' });
    expect(f.prisma.agentTask.updateMany).not.toHaveBeenCalled();
    expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('accepts all three candidates at the exact stored text, diagnostic and source byte limits', async () => {
    const f = fixture(); f.task.result = { storyboardScienceDiagnostics: f.diagnostics };
    f.diagnostics.candidates = [1, 2, 3].map(structuredAttempt => ({ structuredAttempt,
      kind: structuredAttempt === 1 ? 'json_parse' : 'schema_validation', text: 'x'.repeat(131072), diagnostic: 'x'.repeat(512) }));
    f.diagnostics.sources[0]!.text = '';
    f.diagnostics.sources[0]!.text = 'x'.repeat(524288 - Buffer.byteLength(JSON.stringify(f.diagnostics.sources), 'utf8'));
    expect((await getHermesResearchRun(f.deps, f.input)).generationRecovery).toBe('storyboard-planning');
  });

  it('refuses a concurrent result change instead of clearing it or dispatching another call', async () => {
    const f = fixture(); f.task.result = { storyboardScienceDiagnostics: f.diagnostics };
    const update = f.prisma.agentTask.updateMany.getMockImplementation()!;
    const concurrent = { storyboardScienceDiagnostics: { ...f.diagnostics, candidates: [{ ...f.diagnostics.candidates[0]!, text: 'new evidence' }] } };
    f.prisma.agentTask.updateMany.mockImplementationOnce(async args => { f.task.result = concurrent; return update(args); });
    await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(f.task.result).toEqual(concurrent);
    expect(f.audit).not.toHaveBeenCalled(); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it('requires the existing expected-version fence and an available audit writer', async () => {
    const f = fixture(); f.task.result = { storyboardScienceDiagnostics: f.diagnostics };
    await expect(retryHermesGeneration(f.deps, { ...f.input, expectedVersion: 2 })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    await expect(retryHermesGeneration({ ...f.deps, audit: undefined }, f.input)).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
    expect(f.prisma.agentTask.updateMany).not.toHaveBeenCalled(); expect(f.redis.lpush).not.toHaveBeenCalled();
  });

  it.each([false, true])('validates diagnostics identity for stopped image revision (changed=%s)', async changed => {
    const f = fixture();
    f.run.status = 'stopped'; f.run.steps[2]!.status = 'stopped';
    const imageId = uuid(20);
    f.task.payload.storyboard!.revisionImageAssetId = imageId;
    f.task.payload.storyboard!.narrativeSceneLimit = 1;
    f.run.steps.push({ id: 'image-step', stage: 'scene_image', ordinal: 0, status: 'stopped',
      agentTaskId: imageId, presentationAssetId: imageId });
    // Keep the existing revision-authority resolver as this inspector's boundary;
    // seven terminal presentation tasks plus source review and the remaining image fill the grant.
    f.prisma.agentTask.findMany.mockImplementation(async ({ where }) => where.kind === 'presentation.generate'
      ? [f.task.id, imageId, ...[21, 22, 23, 24, 25].map(uuid)].map(id => ({ id, status: 'failed' })) : []);
    const revisionSource = { identity: 'reviewed-image-identity', sourceEvidenceIdentity: f.diagnostics.sourceEvidenceIdentity,
      image: { id: imageId }, imageTask: { id: imageId } };
    const resolver = vi.spyOn(presentation, 'readStoppedStoryboardImageRevision')
      .mockResolvedValue(revisionSource as unknown as Awaited<ReturnType<typeof presentation.readStoppedStoryboardImageRevision>>);
    Object.assign(f.diagnostics, { baseIdentity: changed ? 'changed-image-identity' : revisionSource.identity });
    const original = { storyboardScienceDiagnostics: f.diagnostics }; f.task.result = original;
    if (changed) {
      await expect(retryHermesGeneration(f.deps, f.input)).rejects.toMatchObject({ code: 'SOURCE_NOT_READY' });
      expect(f.prisma.agentTask.updateMany).not.toHaveBeenCalled(); expect(f.redis.lpush).not.toHaveBeenCalled();
    } else {
      expect(await retryHermesGeneration(f.deps, f.input)).toMatchObject({ status: 'generating_storyboard' });
      expect(f.prisma.agentTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ result: { equals: original } }), data: expect.objectContaining({ result: Prisma.DbNull }),
      }));
      expect(f.task.result).toBeNull(); expect(f.redis.lpush).toHaveBeenCalledOnce();
      expect(JSON.stringify(f.audit.mock.calls)).not.toContain('storyboardScienceDiagnostics');
      expect(JSON.stringify(f.audit.mock.calls)).not.toContain('PRIVATE SCIENCE');
    }
    expect(resolver).toHaveBeenCalled();
  });
});

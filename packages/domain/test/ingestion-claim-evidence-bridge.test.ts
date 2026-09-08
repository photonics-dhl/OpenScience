import { describe, expect, it, vi } from 'vitest';
import { confirmIngestionClaimEvidenceBridge, listIngestionClaimEvidenceCandidates, previewIngestionClaimEvidenceBridge } from '../src/ingestion/claim-evidence-bridge';
import * as claimEvidence from '../src/research-intelligence/claim-evidence-service';

const USER = '10000000-0000-4000-8000-000000000001';
const RO = '30000000-0000-4000-8000-000000000001';
const VERSION = '40000000-0000-4000-8000-000000000001';
const TASK = '80000000-0000-4000-8000-000000000001';
const ARTIFACT = '70000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);

function fixture() {
  const sourceMapRef = {
    schemaVersion: 1, parserStatus: 'succeeded', artifactId: ARTIFACT, contentHash: HASH,
    objectKey: `derived/source-maps/${'b'.repeat(64)}.json`, serializedSha256: 'b'.repeat(64), size: 123,
  };
  const originalCore = {
    problem: 'Problem', insight: 'Original insight', method: 'Method', results: '43 fs result',
    limitations: 'Limited sample', reproducibility: 'Repeatable protocol',
  };
  const located = {
    status: 'located', origin: 'model_quote', matching: 'exact',
    sourceLocator: {
      artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
      boundingBox: { x: 1, y: 2, width: 3, height: 4 }, charRange: { start: 0, end: 5 },
    },
  };
  const result = {
    core: originalCore,
    evidence: Object.fromEntries(Object.keys(originalCore).map((field) => [field, { quote: field === 'results' ? '43 fs' : field, locator: 'page 1' }])),
    evidenceLocation: Object.fromEntries(Object.keys(originalCore).map((field) => [field, located])),
    needsMoreInformation: [],
    sourceMapRef,
  };
  const task = {
    id: TASK, state: 'confirmed', updatedAt: new Date('2026-09-07T10:00:00Z'), artifactId: ARTIFACT,
    artifact: { id: ARTIFACT, logicalPath: 'paper.pdf', blobSha256: HASH },
    batch: { researchObjectId: RO, researchObject: { id: RO, workspaceId: 'ws-1' } },
    agentTask: { id: 'agent-1', status: 'succeeded', updatedAt: new Date('2026-09-07T09:00:00Z'), result },
  };
  const version = {
    id: VERSION, researchObjectId: RO, status: 'draft', commitId: 'commit-1',
    researchObject: { id: RO, workspaceId: 'ws-1' },
    manifest: { coreJson: { ...originalCore, results: 'Edited 43 fs result' }, entries: [{ artifactId: ARTIFACT, logicalPath: 'paper.pdf', blobSha256: HASH }] },
  };
  const prisma = {
    researchObject: { findUnique: vi.fn(async () => ({ id: RO, workspaceId: 'ws-1' })) },
    workspace: { findUnique: vi.fn(async () => ({ id: 'ws-1', status: 'active' })) },
    membership: { findUnique: vi.fn(async () => ({ workspaceId: 'ws-1', userId: USER, role: 'author' })) },
    ingestionTask: { findUnique: vi.fn(async () => task), findMany: vi.fn(async () => [{ id: TASK }]) },
    version: { findUnique: vi.fn(async () => version) },
    claimNode: { findMany: vi.fn(async () => []) },
  };
  return { deps: { prisma, storage: {} } as never, task, version };
}

describe('confirmed ingestion Claim/Evidence bridge', () => {
  it('previews the committed SDF snapshot and redacts the private SourceMap reference', async () => {
    const ctx = fixture();
    const preview = await previewIngestionClaimEvidenceBridge(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK });
    const results = preview.suggestions.find((item) => item.sourceField === 'results')!;
    expect(results).toMatchObject({ originalStatement: '43 fs result', reviewedStatement: 'Edited 43 fs result', rewritten: true, defaultQuoteAssociation: false });
    expect(results.source).toMatchObject({ quote: '43 fs', locator: expect.objectContaining({ artifactId: ARTIFACT }) });
    expect(JSON.stringify(preview)).not.toContain('objectKey');
    expect(preview.snapshotToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('discovers confirmed matching tasks without requiring the UI to know internal task ids', async () => {
    const ctx = fixture();
    const candidates = await listIngestionClaimEvidenceCandidates(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION });
    expect(candidates).toEqual([expect.objectContaining({ taskId: TASK, versionId: VERSION, artifact: expect.objectContaining({ logicalPath: 'paper.pdf' }) })]);
    expect(ctx.deps.prisma.ingestionTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20, where: expect.objectContaining({ artifactId: { in: [ARTIFACT] } }),
    }));
  });

  it('does not rediscover a materialized task after its generated Claims were human-edited', async () => {
    const ctx = fixture();
    ctx.deps.prisma.claimNode.findMany.mockResolvedValue([{
      provenance: { source: 'human', sourceTaskLineage: TASK },
    }]);
    ctx.deps.prisma.ingestionTask.findMany.mockResolvedValue([]);
    const candidates = await listIngestionClaimEvidenceCandidates(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
    });
    expect(candidates).toEqual([]);
    expect(ctx.deps.prisma.ingestionTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { notIn: [TASK] } }),
    }));
  });

  it('rejects stale confirmation instead of attaching quotes from another snapshot', async () => {
    const ctx = fixture();
    await expect(confirmIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
      snapshotToken: '0'.repeat(64), idempotencyKey: 'review-1', selections: [{
        clientKey: 'result', sourceField: 'results', kind: 'core', statement: 'Edited 43 fs result', attachSourceQuote: true,
      }],
    })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
  });

  it('fails closed when the committed manifest does not contain the exact ingestion artifact revision', async () => {
    const ctx = fixture();
    ctx.version.manifest.entries[0]!.blobSha256 = 'c'.repeat(64);
    await expect(previewIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
    })).rejects.toMatchObject({ code: 'LOCATOR_MISMATCH' });
  });

  it('does not offer quotes from a SourceMap whose parser output still requires review', async () => {
    const ctx = fixture();
    const result = ctx.task.agentTask.result as { sourceMapRef: { parserStatus: string } };
    result.sourceMapRef.parserStatus = 'needs_review';
    await expect(previewIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
    })).rejects.toMatchObject({ code: 'LOCATOR_MISMATCH' });
  });

  it('fails closed for an immutable or cross-RO target version', async () => {
    const immutable = fixture();
    immutable.version.status = 'published';
    await expect(previewIngestionClaimEvidenceBridge(immutable.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
    })).rejects.toMatchObject({ code: 'VERSION_IMMUTABLE' });
    const crossScope = fixture();
    crossScope.version.researchObjectId = '30000000-0000-4000-8000-000000000999';
    await expect(previewIngestionClaimEvidenceBridge(crossScope.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('binds an explicit edited-statement quote association to a missing Claim and unverified Evidence', async () => {
    const ctx = fixture();
    const preview = await previewIngestionClaimEvidenceBridge(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK });
    const create = vi.spyOn(claimEvidence, 'createClaimEvidenceBatch').mockResolvedValue({ claims: [{ id: 'claim' }], evidence: [{ id: 'evidence', extractionStatus: 'needs_review' }] } as never);
    await confirmIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
      snapshotToken: preview.snapshotToken, idempotencyKey: 'review-1', selections: [{
        clientKey: 'result', sourceField: 'results', kind: 'core', statement: 'Edited 43 fs result', attachSourceQuote: true,
      }],
    });
    expect(create).toHaveBeenCalledWith(ctx.deps, expect.objectContaining({
      claims: [expect.objectContaining({ assessment: 'missing', statement: 'Edited 43 fs result' })],
      evidence: [expect.objectContaining({ exactQuote: '43 fs', relation: 'supports' })],
    }), expect.anything());
  });

  it('rejects attaching one extraction field to multiple split Claims', async () => {
    const ctx = fixture();
    const preview = await previewIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
    });
    await expect(confirmIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
      snapshotToken: preview.snapshotToken, idempotencyKey: 'duplicate-source', selections: [
        { clientKey: 'a', sourceField: 'results', kind: 'core', statement: 'First result', attachSourceQuote: true },
        { clientKey: 'b', sourceField: 'results', kind: 'core', statement: 'Second result', attachSourceQuote: true },
      ],
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('previews and materializes one unverified Evidence row per canonical segment', async () => {
    const ctx = fixture();
    const result = ctx.task.agentTask.result as Record<string, unknown>;
    ((result.evidence as Record<string, { quote: string }>).results).quote = '43 fs\nresult';
    ((result.evidenceLocation as Record<string, Record<string, unknown>>).results) = {
      status: 'cross_block', origin: 'model_quote', matching: 'exact', reason: 'match-spans-blocks',
    };
    result.evidenceSegments = Object.fromEntries(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'].map((field) => [field,
      field === 'results' ? [
        { quote: '43 fs', sourceLocator: { artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1, boundingBox: { x: 1, y: 2, width: 3, height: 4 }, charRange: { start: 0, end: 5 } } },
        { quote: 'result', sourceLocator: { artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-2', page: 1, boundingBox: { x: 1, y: 8, width: 3, height: 4 }, charRange: { start: 0, end: 6 } } },
      ] : []]));
    for (const field of ['problem', 'insight', 'method', 'limitations', 'reproducibility']) {
      (result.evidence as Record<string, { quote: string }>)[field]!.quote = '';
      (result.core as Record<string, string>)[field] = '';
      (result.evidenceLocation as Record<string, Record<string, unknown>>)[field] = {
        status: 'missing', origin: 'model_quote', reason: 'empty-quote',
      };
    }
    result.needsMoreInformation = ['problem', 'insight', 'method', 'limitations', 'reproducibility'];
    const preview = await previewIngestionClaimEvidenceBridge(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK });
    expect(preview.suggestions.find((item) => item.sourceField === 'results')).toMatchObject({
      sources: [{ quote: '43 fs' }, { quote: 'result' }], defaultQuoteAssociation: false,
    });
    const create = vi.spyOn(claimEvidence, 'createClaimEvidenceBatch').mockResolvedValue({ claims: [], evidence: [] } as never);
    await confirmIngestionClaimEvidenceBridge(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, taskId: TASK,
      snapshotToken: preview.snapshotToken, idempotencyKey: 'segments-1', selections: [{
        clientKey: 'result', sourceField: 'results', kind: 'core', statement: 'Edited 43 fs result', attachSourceQuote: true,
      }],
    });
    expect(create.mock.calls.at(-1)?.[1].evidence).toHaveLength(2);
  });
});

import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import {
  createClaim,
  updateClaim,
  deleteClaim,
  createEvidence,
  updateEvidence,
  verifyEvidence,
  createClaimEvidenceBatch,
  validateCanonicalEvidenceSources,
} from '../../src/research-intelligence/claim-evidence-service';
import { ClaimEvidenceError } from '../../src/research-intelligence/claim-evidence-errors';

const USER = '10000000-0000-4000-8000-000000000001';
const WORKSPACE = '20000000-0000-4000-8000-000000000001';
const RO = '30000000-0000-4000-8000-000000000001';
const VERSION = '40000000-0000-4000-8000-000000000001';
const CLAIM = '50000000-0000-4000-8000-000000000001';
const EVIDENCE = '60000000-0000-4000-8000-000000000001';
const ARTIFACT = '70000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const NOW = new Date('2026-08-29T10:00:00.000Z');

function fixture() {
  const objects = new Map<string, Buffer>();
  let inTransaction = false;
  const storage = {
    putObject: vi.fn(async (key: string, body: Buffer | Readable) => {
      const chunks: Buffer[] = [];
      if (Buffer.isBuffer(body)) chunks.push(body);
      else for await (const chunk of body) chunks.push(Buffer.from(chunk));
      const value = Buffer.concat(chunks);
      objects.set(key, value);
      return { key, size: value.length, etag: 'fixture' };
    }),
    getObject: vi.fn(async (key: string) => {
      if (inTransaction) throw new Error('object storage I/O must not run inside a database transaction');
      const value = objects.get(key);
      if (!value) throw new Error('missing object');
      return { body: Readable.from([value]), size: value.length };
    }),
    headObject: vi.fn(async (key: string) => {
      const value = objects.get(key);
      return value ? { size: value.length, etag: 'fixture' } : null;
    }),
    deleteObject: vi.fn(async () => undefined),
  };
  const auditRecord = vi.fn();
  const claimRows: Array<Record<string, unknown>> = [];
  const evidenceRows: Array<Record<string, unknown>> = [];
  const presentationRows: Array<{ id: string; researchObjectId: string; versionId: string; status: string; claimIds: string[]; updatedAt: Date }> = [];
  const matchesTimestamp = (left: unknown, right: unknown) => left instanceof Date && right instanceof Date
    && left.getTime() === right.getTime();
  const prisma = {
    workspace: { findUnique: vi.fn().mockResolvedValue({ id: WORKSPACE, status: 'active' }) },
    membership: { findUnique: vi.fn().mockResolvedValue({ workspaceId: WORKSPACE, userId: USER, role: 'author' }) },
    version: { findUnique: vi.fn().mockResolvedValue({
      id: VERSION, researchObjectId: RO, status: 'draft', commitId: 'commit-1',
      researchObject: { id: RO, workspaceId: WORKSPACE },
      manifest: { coreJson: {}, entries: [{ artifactId: ARTIFACT, logicalPath: 'paper.pdf', blobSha256: HASH }] },
    }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    claimNode: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = claimRows.find((candidate) => candidate.id === where.id);
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async () => claimRows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, createdAt: NOW, updatedAt: NOW };
        claimRows.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        const row = claimRows.find((candidate) => candidate.id === where.id && matchesTimestamp(candidate.updatedAt, where.updatedAt));
        if (!row) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date(where.updatedAt.getTime() + 1) });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; updatedAt: Date } }) => {
        const index = claimRows.findIndex((row) => row.id === where.id && matchesTimestamp(row.updatedAt, where.updatedAt));
        if (index < 0) return { count: 0 };
        if (presentationRows.some((row) => row.claimIds.includes(where.id))) throw new Error('presentation source foreign key restricts deletion');
        claimRows.splice(index, 1);
        return { count: 1 };
      }),
      count: vi.fn().mockResolvedValue(0),
    },
    evidenceRecord: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = evidenceRows.find((candidate) => candidate.id === where.id);
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async () => evidenceRows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, createdAt: NOW, updatedAt: NOW };
        evidenceRows.push(row);
        return row;
      }),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        evidenceRows.push(...data.map((row) => ({ ...row, createdAt: NOW, updatedAt: NOW })));
        return { count: data.length };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        const row = evidenceRows.find((candidate) => candidate.id === where.id && matchesTimestamp(candidate.updatedAt, where.updatedAt));
        if (!row) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date(where.updatedAt.getTime() + 1) });
        return { count: 1 };
      }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    artifact: { findUnique: vi.fn().mockResolvedValue({
      id: ARTIFACT, workspaceId: WORKSPACE, logicalPath: 'paper.pdf', blobSha256: HASH, size: 100n,
    }) },
    ingestionTask: { findFirst: vi.fn(), findUnique: vi.fn() },
    aiReview: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    presentationAsset: { updateMany: vi.fn(async ({ where }: { where: { researchObjectId: string; versionId: string; status: { in: string[] }; sourceClaims: { some: { claimId: string } } } }) => {
      if (!inTransaction) throw new Error('presentation invalidation must be atomic with Claim writes');
      const affected = presentationRows.filter((row) => row.researchObjectId === where.researchObjectId && row.versionId === where.versionId
        && where.status.in.includes(row.status) && row.claimIds.includes(where.sourceClaims.some.claimId));
      for (const row of affected) { row.status = 'rejected'; row.updatedAt = new Date(row.updatedAt.getTime() + 1); }
      return { count: affected.length };
    }) },
    presentationAssetClaim: { deleteMany: vi.fn(async ({ where }: { where: { claimId: string; researchObjectId: string; versionId: string } }) => {
      if (!inTransaction) throw new Error('source links must change in the Claim transaction');
      for (const row of presentationRows) {
        if (row.researchObjectId === where.researchObjectId && row.versionId === where.versionId) row.claimIds = row.claimIds.filter((id) => id !== where.claimId);
      }
      return { count: 1 };
    }) },
  };
  Object.assign(prisma, { $transaction: vi.fn(async (operation: (transaction: typeof prisma) => unknown) => {
    const priorClaims = structuredClone(claimRows);
    const priorEvidence = structuredClone(evidenceRows);
    const priorPresentations = structuredClone(presentationRows);
    inTransaction = true;
    try {
      return await operation(prisma);
    } catch (error) {
      claimRows.splice(0, claimRows.length, ...priorClaims);
      evidenceRows.splice(0, evidenceRows.length, ...priorEvidence);
      presentationRows.splice(0, presentationRows.length, ...priorPresentations);
      throw error;
    } finally {
      inTransaction = false;
    }
  }) });
  return {
    deps: { prisma, storage, audit: { record: auditRecord } } as never,
    prisma,
    storage,
    claimRows,
    evidenceRows,
    presentationRows,
    auditRecord,
  };
}

async function seedSourceMap(ctx: ReturnType<typeof fixture>) {
  const sourceMap = {
    artifactId: ARTIFACT,
    contentHash: HASH,
    parser: { name: 'fixture-parser', version: '1' },
    pages: [{
      page: 1, width: 600, height: 800,
      blocks: [{
        id: 'block-1', kind: 'paragraph' as const, text: 'The measured lifetime is 43 fs.',
        boundingBox: { x: 10, y: 20, width: 300, height: 30 },
        parser: { name: 'fixture-parser', version: '1' }, transformations: [],
      }, {
        id: 'unrelated-middle', kind: 'paragraph' as const, text: 'Administrative running header.',
        boundingBox: { x: 10, y: 45, width: 300, height: 10 },
        parser: { name: 'fixture-parser', version: '1' }, transformations: [],
      }, {
        id: 'block-2', kind: 'paragraph' as const, text: 'Repeated quote is 43 fs.',
        boundingBox: { x: 10, y: 60, width: 300, height: 30 },
        parser: { name: 'fixture-parser', version: '1' }, transformations: [],
      }],
    }],
  };
  const sourceMapRef = await persistDocumentSourceMapReference(ctx.storage, sourceMap, 'succeeded');
  ctx.prisma.ingestionTask.findFirst.mockResolvedValue({
    agentTask: { status: 'succeeded', result: { sourceMapRef } },
  });
  ctx.prisma.ingestionTask.findUnique.mockResolvedValue({
    id: '80000000-0000-4000-8000-000000000001', state: 'confirmed', artifactId: ARTIFACT, updatedAt: NOW,
    batch: { researchObjectId: RO }, artifact: { blobSha256: HASH },
    agentTask: { id: 'agent-1', status: 'succeeded', updatedAt: NOW, result: { sourceMapRef } },
  });
  return Object.assign(sourceMap, { sourceMapRef });
}

function batchAuthority(sourceMapRef: Awaited<ReturnType<typeof seedSourceMap>>['sourceMapRef']) {
  return {
    taskUpdatedAt: NOW.toISOString(), agentTaskId: 'agent-1', agentTaskUpdatedAt: NOW.toISOString(),
    versionCommitId: 'commit-1', artifactId: ARTIFACT, contentHash: HASH,
    manifestCoreDigest: createHash('sha256').update('{}').digest('hex'), sourceMapRef,
  };
}

describe('Claim/Evidence operations', () => {
  function presentationFixture() {
    const ctx = fixture();
    ctx.claimRows.push({ id: CLAIM, researchObjectId: RO, versionId: VERSION, kind: 'core', statement: 'Original result', assessment: 'supported', conditions: [], limitations: [], parentClaimId: null, extractionStatus: 'succeeded', updatedAt: NOW });
    ctx.presentationRows.push(
      { id: 'approved-chart', researchObjectId: RO, versionId: VERSION, status: 'approved', claimIds: [CLAIM], updatedAt: NOW },
      { id: 'draft-chart', researchObjectId: RO, versionId: VERSION, status: 'draft', claimIds: [CLAIM], updatedAt: NOW },
      { id: 'other-version', researchObjectId: RO, versionId: 'other-version', status: 'approved', claimIds: [CLAIM], updatedAt: NOW },
      { id: 'other-claim', researchObjectId: RO, versionId: VERSION, status: 'approved', claimIds: ['other-claim'], updatedAt: NOW },
    );
    return ctx;
  }

  it.each([
    { statement: 'Corrected result' }, { assessment: 'partial' as const },
    { conditions: ['terahertz illumination'] }, { limitations: ['fixed fabricated layers'] },
  ])('invalidates exact-version source presentations for changed rendered Claim content: %j', async (patch) => {
    const ctx = presentationFixture();
    await updateClaim(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, claimId: CLAIM, expectedUpdatedAt: NOW, patch });
    expect(ctx.presentationRows.map((row) => row.status)).toEqual(['rejected', 'rejected', 'approved', 'approved']);
    expect(ctx.presentationRows[0].updatedAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('preserves existing presentations when the rendered Claim content is unchanged', async () => {
    const ctx = presentationFixture();
    await updateClaim(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, claimId: CLAIM, expectedUpdatedAt: NOW, patch: { statement: 'Original result', parentClaimId: null } });
    expect(ctx.prisma.presentationAsset.updateMany).not.toHaveBeenCalled();
    expect(ctx.presentationRows[0].status).toBe('approved');
  });

  it('does not invalidate assets on a stale Claim update', async () => {
    const ctx = presentationFixture();
    await expect(updateClaim(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, claimId: CLAIM, expectedUpdatedAt: new Date(0), patch: { statement: 'Stale edit' } })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(ctx.prisma.presentationAsset.updateMany).not.toHaveBeenCalled();
    expect(ctx.presentationRows[0].status).toBe('approved');
  });

  it('rejects presentations and detaches their source links before deleting a leaf Claim', async () => {
    const ctx = presentationFixture();
    ctx.presentationRows.splice(2, 1);
    await deleteClaim(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, claimId: CLAIM, expectedUpdatedAt: NOW });
    expect(ctx.claimRows).toHaveLength(0);
    expect(ctx.presentationRows[0]).toMatchObject({ status: 'rejected', claimIds: [] });
    expect(ctx.presentationRows[1]).toMatchObject({ status: 'rejected', claimIds: [] });
  });

  it('rolls back presentation invalidation and source removal when Claim deletion loses its CAS', async () => {
    const ctx = presentationFixture();
    await expect(deleteClaim(ctx.deps, { userId: USER, researchObjectId: RO, versionId: VERSION, claimId: CLAIM, expectedUpdatedAt: new Date(0) })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(ctx.presentationRows[0]).toMatchObject({ status: 'approved', claimIds: [CLAIM], updatedAt: NOW });
    expect(ctx.claimRows).toHaveLength(1);
  });

  it('creates a human Claim idempotently and records an auditable mutation', async () => {
    const ctx = fixture();
    const input = {
      id: CLAIM, userId: USER, researchObjectId: RO, versionId: VERSION,
      kind: 'core' as const, statement: 'The transfer completes within 43 fs.',
      assessment: 'supported' as const, conditions: ['room temperature'], limitations: [],
    };

    const first = await createClaim(ctx.deps, input);
    const replay = await createClaim(ctx.deps, input);

    expect(first.id).toBe(CLAIM);
    expect(replay.id).toBe(CLAIM);
    expect(ctx.prisma.claimNode.create).toHaveBeenCalledTimes(1);
    expect(ctx.auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'claim.create' }), expect.anything());
  });

  it('creates a reviewed ingestion Claim/Evidence batch atomically and leaves evidence unverified', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    const locator = {
      artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
      boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox,
      charRange: { start: 25, end: 30 },
    };
    const result = await createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001',
      snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{
        id: CLAIM, kind: 'core', statement: 'The transfer completes within 43 fs.',
        assessment: 'missing', conditions: ['room temperature'], limitations: [],
      }],
      evidence: [{
        id: EVIDENCE, claimId: CLAIM, artifactId: ARTIFACT, kind: 'passage',
        title: 'Original extraction quote', exactQuote: '43 fs', relation: 'supports', locator,
      }],
    });

    expect(result.claims).toHaveLength(1);
    expect(result.evidence).toEqual([expect.objectContaining({ extractionStatus: 'needs_review', verifiedByUserId: null })]);
    expect(ctx.claimRows[0]!.assessment).toBe('missing');
    expect(ctx.auditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: 'claim.create' }), expect.anything());
    expect(ctx.auditRecord).toHaveBeenCalledWith(expect.objectContaining({
      action: 'evidence.batch_create', metadata: expect.objectContaining({ evidenceIds: [EVIDENCE] }),
    }), expect.anything());
  });

  it('rolls back every reviewed ingestion row when one evidence locator fails', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    await expect(createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001',
      snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'missing' }],
      evidence: [{
        id: EVIDENCE, claimId: CLAIM, artifactId: ARTIFACT, kind: 'passage', title: 'Wrong quote',
        exactQuote: '99 fs', relation: 'supports',
        locator: {
          artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
          boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox, charRange: { start: 25, end: 30 },
        },
      }],
    })).rejects.toMatchObject({ code: 'LOCATOR_MISMATCH' });
    expect(ctx.claimRows).toHaveLength(0);
    expect(ctx.evidenceRows).toHaveLength(0);
  });

  it('rejects a reviewed Evidence artifact outside the exact ingestion authority', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    await expect(createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001', snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'missing' }],
      evidence: [{
        id: EVIDENCE, claimId: CLAIM, artifactId: '70000000-0000-4000-8000-000000000099',
        kind: 'passage', title: 'Quote', exactQuote: '43 fs', relation: 'supports',
        locator: {
          artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
          boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox, charRange: { start: 25, end: 30 },
        },
      }],
    })).rejects.toMatchObject({ code: 'LOCATOR_MISMATCH' });
    expect(ctx.prisma.evidenceRecord.createMany).not.toHaveBeenCalled();
  });

  it('replays the same reviewed batch and rejects reuse for different batch content', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    const input = {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001', snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core' as const, statement: 'Claim', assessment: 'missing' as const }], evidence: [],
    };
    await createClaimEvidenceBatch(ctx.deps, input);
    await createClaimEvidenceBatch(ctx.deps, input);
    expect(ctx.prisma.claimNode.create).toHaveBeenCalledTimes(1);
    await expect(createClaimEvidenceBatch(ctx.deps, { ...input, batchDigest: 'changed-batch' }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('creates two independent needs-review Evidence rows from ordered authenticated blocks separated by unrelated text', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    const locator = {
      artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
      boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox, charRange: { start: 25, end: 30 },
    };
    await createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001', snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'missing' }],
      evidence: [EVIDENCE, '60000000-0000-4000-8000-000000000002'].map((id, index) => ({
        id, claimId: CLAIM, artifactId: ARTIFACT, kind: 'passage' as const, title: 'Quote',
        exactQuote: '43 fs', relation: 'supports' as const, locator: index === 0 ? locator : {
          ...locator, blockId: 'block-2', boundingBox: sourceMap.pages[0]!.blocks[2]!.boundingBox,
          charRange: { start: 18, end: 23 },
        },
      })),
    });
    expect(ctx.storage.getObject).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.evidenceRecord.createMany).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.evidenceRecord.create).not.toHaveBeenCalled();
    expect(ctx.evidenceRows).toHaveLength(2);
    expect(ctx.evidenceRows.map((row) => ({ exactQuote: row.exactQuote, extractionStatus: row.extractionStatus, verifiedByUserId: row.verifiedByUserId })))
      .toEqual([
        { exactQuote: '43 fs', extractionStatus: 'needs_review', verifiedByUserId: null },
        { exactQuote: '43 fs', extractionStatus: 'needs_review', verifiedByUserId: null },
      ]);
  });

  it('uses the extractor text-block order and accepts the exact 8000-character segment limit', () => {
    const text = 'x'.repeat(8_000);
    const sourceMap = {
      artifactId: ARTIFACT, contentHash: HASH, parser: { name: 'fixture', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [
        { id: 'text-1', kind: 'paragraph' as const, text: text.slice(0, 4_000), boundingBox: { x: 0, y: 0, width: 50, height: 10 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
        { id: 'figure-1', kind: 'figure' as const, boundingBox: { x: 0, y: 10, width: 50, height: 10 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
        { id: 'unrelated-text', kind: 'paragraph' as const, text: 'unrelated', boundingBox: { x: 0, y: 15, width: 50, height: 10 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
        { id: 'text-2', kind: 'paragraph' as const, text: text.slice(4_000), boundingBox: { x: 0, y: 20, width: 50, height: 10 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
      ] }],
    };
    expect(validateCanonicalEvidenceSources(sourceMap, [
      { quote: text.slice(0, 4_000), locator: { artifactId: ARTIFACT, contentHash: HASH, blockId: 'text-1', page: 1, boundingBox: { x: 0, y: 0, width: 50, height: 10 }, charRange: { start: 0, end: 4_000 } } },
      { quote: text.slice(4_000), locator: { artifactId: ARTIFACT, contentHash: HASH, blockId: 'text-2', page: 1, boundingBox: { x: 0, y: 20, width: 50, height: 10 }, charRange: { start: 0, end: 4_000 } } },
    ])).toHaveLength(2);
  });

  it.each([
    ['reverse', ['text-2', 'text-1']],
    ['duplicate', ['text-1', 'text-1']],
    ['unknown', ['text-1', 'missing']],
  ])('rejects %s canonical source ordering or identity', (_label, ids) => {
    const sourceMap = {
      artifactId: ARTIFACT, contentHash: HASH, parser: { name: 'fixture', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [
        { id: 'text-1', kind: 'paragraph' as const, text: 'one', boundingBox: { x: 0, y: 0, width: 10, height: 10 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
        { id: 'text-2', kind: 'paragraph' as const, text: 'two', boundingBox: { x: 0, y: 20, width: 10, height: 10 }, parser: { name: 'fixture', version: '1' }, transformations: [] },
      ] }],
    };
    const sources = ids.map((blockId) => ({ quote: blockId === 'text-2' ? 'two' : 'one', locator: {
      artifactId: ARTIFACT, contentHash: HASH, blockId, page: 1,
      boundingBox: { x: 0, y: blockId === 'text-2' ? 20 : 0, width: 10, height: 10 }, charRange: { start: 0, end: 3 },
    } }));
    expect(() => validateCanonicalEvidenceSources(sourceMap, sources)).toThrow(/ordered exact source blocks|Canonical Evidence/);
  });

  it('rejects canonical source text over 8000 characters and cross-context locators', () => {
    const text = 'x'.repeat(8_001);
    const box = { x: 0, y: 0, width: 10, height: 10 };
    const sourceMap = { artifactId: ARTIFACT, contentHash: HASH, parser: { name: 'fixture', version: '1' },
      pages: [{ page: 1, width: 100, height: 100, blocks: [{ id: 'large', kind: 'paragraph' as const, text, boundingBox: box, parser: { name: 'fixture', version: '1' }, transformations: [] }] }] };
    const source = { quote: text, locator: { artifactId: ARTIFACT, contentHash: HASH, blockId: 'large', page: 1, boundingBox: box, charRange: { start: 0, end: text.length } } };
    expect(() => validateCanonicalEvidenceSources(sourceMap, [source])).toThrow(/too large/);
    expect(() => validateCanonicalEvidenceSources(sourceMap, [{ ...source, quote: 'x', locator: { ...source.locator, artifactId: 'other', charRange: { start: 0, end: 1 } } }])).toThrow(/ordered exact source blocks/);
  });

  it('rechecks task authority inside the write transaction and rolls back on change', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    ctx.prisma.ingestionTask.findUnique.mockResolvedValue({
      id: '80000000-0000-4000-8000-000000000001', state: 'confirmed', artifactId: ARTIFACT,
      updatedAt: new Date(NOW.getTime() + 1), batch: { researchObjectId: RO }, artifact: { blobSha256: HASH },
      agentTask: { id: 'agent-1', status: 'succeeded', updatedAt: NOW, result: { sourceMapRef: sourceMap.sourceMapRef } },
    });
    await expect(createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001', snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'missing' }], evidence: [],
    })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
    expect(ctx.claimRows).toHaveLength(0);
  });

  it('recovers an overlapping identical batch after a deterministic id unique collision', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    let first = true;
    ctx.prisma.$transaction.mockImplementation(async (operation: (transaction: typeof ctx.prisma) => unknown) => {
      const result = await operation(ctx.prisma);
      if (first) { first = false; throw Object.assign(new Error('overlapping unique collision'), { code: 'P2002' }); }
      return result;
    });
    const result = await createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001', snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'missing' }], evidence: [],
    });
    expect(result.claims).toHaveLength(1);
    expect(ctx.prisma.claimNode.create).toHaveBeenCalledTimes(1);
    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('preserves ingestion task lineage when a generated Claim is edited', async () => {
    const ctx = fixture();
    const sourceMap = await seedSourceMap(ctx);
    await createClaimEvidenceBatch(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION,
      sourceTaskId: '80000000-0000-4000-8000-000000000001', snapshotToken: 'snapshot-1', batchDigest: 'batch-1',
      authority: batchAuthority(sourceMap.sourceMapRef),
      claims: [{ id: CLAIM, kind: 'core', statement: 'Claim', assessment: 'missing' }], evidence: [],
    });
    const updated = await updateClaim(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, claimId: CLAIM, expectedUpdatedAt: NOW,
      patch: { statement: 'Human-edited Claim' },
    });
    expect(updated.provenance).toMatchObject({ source: 'human', sourceTaskLineage: '80000000-0000-4000-8000-000000000001' });
    expect(updated.provenance).not.toHaveProperty('snapshotToken');
  });

  it('resolves a trusted SourceMap locator, then verifies the exact quote as the current user', async () => {
    const ctx = fixture();
    ctx.claimRows.push({
      id: CLAIM, researchObjectId: RO, versionId: VERSION, kind: 'core', statement: 'Claim',
      assessment: 'supported', parentClaimId: null, conditions: [], limitations: [],
      provenance: { source: 'human' }, extractionStatus: 'succeeded', createdAt: NOW, updatedAt: NOW,
    });
    const sourceMap = await seedSourceMap(ctx);
    const locator = {
      artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
      boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox,
      charRange: { start: 25, end: 30 },
    };
    const created = await createEvidence(ctx.deps, {
      id: EVIDENCE, userId: USER, researchObjectId: RO, versionId: VERSION,
      claimId: CLAIM, artifactId: ARTIFACT, kind: 'passage', title: 'Measured lifetime',
      exactQuote: '43 fs', relation: 'supports', locator,
    });
    expect(created).toMatchObject({ extractionStatus: 'needs_review', verifiedByUserId: null });
    expect((created.provenance as Record<string, unknown>).sourceMapRef).toBeUndefined();
    expect((ctx.evidenceRows[0]!.provenance as Record<string, unknown>).sourceMapRef).toBeDefined();

    const verified = await verifyEvidence(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, evidenceId: EVIDENCE,
      expectedUpdatedAt: NOW,
    });
    expect(verified).toMatchObject({ extractionStatus: 'succeeded', verifiedByUserId: USER });
    expect(ctx.prisma.evidenceRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ extractionStatus: 'succeeded', verifiedByUserId: USER }),
    }));

    const revised = await updateEvidence(ctx.deps, {
      userId: USER, researchObjectId: RO, versionId: VERSION, evidenceId: EVIDENCE,
      expectedUpdatedAt: verified.updatedAt, patch: { title: 'Rechecked measured lifetime' },
    });
    expect(revised).toMatchObject({
      title: 'Rechecked measured lifetime', extractionStatus: 'needs_review', verifiedByUserId: null,
    });
    expect(ctx.prisma.evidenceRecord.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: EVIDENCE, updatedAt: verified.updatedAt },
      data: expect.objectContaining({ extractionStatus: 'needs_review', verifiedByUserId: null }),
    }));
  });

  it('rejects a quote that does not match the deterministic character range', async () => {
    const ctx = fixture();
    ctx.claimRows.push({ id: CLAIM, researchObjectId: RO, versionId: VERSION });
    const sourceMap = await seedSourceMap(ctx);

    await expect(createEvidence(ctx.deps, {
      id: EVIDENCE, userId: USER, researchObjectId: RO, versionId: VERSION,
      claimId: CLAIM, artifactId: ARTIFACT, kind: 'passage', title: 'Forged quote',
      exactQuote: '99 fs', relation: 'supports',
      locator: {
        artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
        boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox,
        charRange: { start: 25, end: 30 },
      },
    })).rejects.toMatchObject<Partial<ClaimEvidenceError>>({ code: 'LOCATOR_MISMATCH' });
  });

  it('replays an existing Evidence idempotently without depending on object storage availability', async () => {
    const ctx = fixture();
    ctx.claimRows.push({ id: CLAIM, researchObjectId: RO, versionId: VERSION });
    const sourceMap = await seedSourceMap(ctx);
    const input = {
      id: EVIDENCE, userId: USER, researchObjectId: RO, versionId: VERSION,
      claimId: CLAIM, artifactId: ARTIFACT, kind: 'passage' as const, title: 'Measured lifetime',
      exactQuote: '43 fs', relation: 'supports' as const,
      locator: {
        artifactId: ARTIFACT, contentHash: HASH, blockId: 'block-1', page: 1,
        boundingBox: sourceMap.pages[0]!.blocks[0]!.boundingBox,
        charRange: { start: 25, end: 30 },
      },
    };
    const created = await createEvidence(ctx.deps, input);
    ctx.storage.getObject.mockRejectedValue(new Error('storage temporarily unavailable'));

    await expect(createEvidence(ctx.deps, input)).resolves.toEqual(created);
    expect(ctx.prisma.evidenceRecord.create).toHaveBeenCalledTimes(1);
  });

  it('keeps previously published revisions immutable and archived workspaces read-only', async () => {
    const revised = fixture();
    revised.prisma.version.findUnique.mockResolvedValue({
      id: VERSION, researchObjectId: RO, status: 'revised', commitId: 'commit-1',
      researchObject: { id: RO, workspaceId: WORKSPACE }, manifest: { entries: [] },
    });
    const input = {
      id: CLAIM, userId: USER, researchObjectId: RO, versionId: VERSION,
      kind: 'core' as const, statement: 'Immutable public claim', assessment: 'missing' as const,
    };
    await expect(createClaim(revised.deps, input)).rejects.toMatchObject({ code: 'VERSION_IMMUTABLE' });

    const archived = fixture();
    archived.prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE, status: 'archived' });
    await expect(createClaim(archived.deps, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import {
  createClaim,
  updateClaim,
  deleteClaim,
  createEvidence,
  updateEvidence,
  verifyEvidence,
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
      manifest: { entries: [{ artifactId: ARTIFACT, logicalPath: 'paper.pdf', blobSha256: HASH }] },
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
    ingestionTask: { findFirst: vi.fn() },
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
    const priorPresentations = structuredClone(presentationRows);
    inTransaction = true;
    try {
      return await operation(prisma);
    } catch (error) {
      claimRows.splice(0, claimRows.length, ...priorClaims);
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
      }],
    }],
  };
  const sourceMapRef = await persistDocumentSourceMapReference(ctx.storage, sourceMap, 'succeeded');
  ctx.prisma.ingestionTask.findFirst.mockResolvedValue({
    agentTask: { status: 'succeeded', result: { sourceMapRef } },
  });
  return sourceMap;
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

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { getBlobStorageKey } from '@openscience/storage';

import { persistDocumentSourceMapReference } from '../../src/research-intelligence/source-map-ref';
import {
  PublicEvidenceSourceError,
  getPublicEvidenceSource,
} from '../../src/research-intelligence/public-evidence-source';

const RO = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
const ARTIFACT = '33333333-3333-4333-8333-333333333333';
const EVIDENCE = '44444444-4444-4444-8444-444444444444';

async function fixture() {
  const original = Buffer.from('immutable published PDF bytes');
  const hash = createHash('sha256').update(original).digest('hex');
  const objects = new Map<string, { body: Buffer; contentType?: string }>();
  objects.set(getBlobStorageKey(hash), { body: original, contentType: 'application/pdf' });
  const storage = {
    putObject: vi.fn(async (key: string, body: Buffer, options?: { contentType?: string }) => {
      objects.set(key, { body: Buffer.from(body), contentType: options?.contentType });
      return { key, size: body.length, etag: 'etag' };
    }),
    getObject: vi.fn(async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error('missing object');
      return { body: Readable.from([value.body]), size: value.body.length, contentType: value.contentType };
    }),
    headObject: vi.fn(async (key: string) => {
      const value = objects.get(key);
      return value ? { size: value.body.length, etag: 'etag', contentType: value.contentType } : null;
    }),
    deleteObject: vi.fn(async (key: string) => void objects.delete(key)),
  };
  const sourceMapRef = await persistDocumentSourceMapReference(storage, {
    artifactId: ARTIFACT,
    contentHash: hash,
    parser: { name: 'fixture', version: '1' },
    pages: [{
      page: 1, width: 100, height: 100,
      blocks: [{
        id: 'block-1', kind: 'paragraph', text: 'Measured lifetime: 43 fs.',
        boundingBox: { x: 10, y: 20, width: 80, height: 10 },
        parser: { name: 'fixture', version: '1' }, transformations: [],
      }],
    }],
  }, 'succeeded');
  const ro = { id: RO, publicId: 'OSR-2026-000001', visibility: 'public' };
  const version = {
    id: VERSION, researchObjectId: RO, versionNo: 1, status: 'published',
    publications: [{ id: 'publication-1' }],
    researchObject: { id: RO, workspaceId: 'private-workspace' },
    manifest: { entries: [{ artifactId: ARTIFACT, blobSha256: hash }] },
  };
  const artifact = {
    id: ARTIFACT, workspaceId: 'private-workspace', logicalPath: 'paper.pdf',
    mimeType: 'application/pdf', blobSha256: hash, size: BigInt(original.length),
  };
  const evidence = {
    id: EVIDENCE, researchObjectId: RO, versionId: VERSION, artifactId: ARTIFACT,
    exactQuote: '43 fs', extractionStatus: 'succeeded', verifiedByUserId: 'private-verifier',
    locator: {
      artifactId: ARTIFACT, contentHash: hash, blockId: 'block-1', page: 1,
      boundingBox: { x: 10, y: 20, width: 80, height: 10 }, charRange: { start: 19, end: 24 },
    },
    provenance: { sourceMapRef, private: true }, artifact,
  };
  const prisma = {
    researchObject: { findUnique: vi.fn().mockResolvedValue(ro) },
    version: {
      findFirst: vi.fn().mockResolvedValue(version),
      findUnique: vi.fn().mockResolvedValue(version),
    },
    evidenceRecord: { findFirst: vi.fn().mockResolvedValue(evidence) },
    artifact: { findUnique: vi.fn().mockResolvedValue(artifact) },
  };
  return { deps: { prisma, storage } as never, prisma, storage, objects, ro, version, evidence, artifact, sourceMapRef };
}

describe('public Evidence source', () => {
  it('returns a bounded, resolved public excerpt without internal identities or storage keys', async () => {
    const ctx = await fixture();
    const result = await getPublicEvidenceSource(ctx.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    });

    expect(result).toEqual({
      text: '43 fs', page: 1,
      region: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 },
      locator: {
        blockId: 'block-1', page: 1,
        boundingBox: { x: 10, y: 20, width: 80, height: 10 }, charRange: { start: 19, end: 24 },
      },
      artifact: { logicalPath: 'paper.pdf', mediaType: 'application/pdf' },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ARTIFACT);
    expect(serialized).not.toContain('private-workspace');
    expect(serialized).not.toContain('private-verifier');
    expect(serialized).not.toContain('sourceMapRef');
    expect(serialized).not.toContain('objectKey');
  });

  it('fails closed for private, unpublished and cross-version records', async () => {
    const privateContext = await fixture();
    privateContext.prisma.researchObject.findUnique.mockResolvedValue({ ...privateContext.ro, visibility: 'private' });
    await expect(getPublicEvidenceSource(privateContext.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const unpublished = await fixture();
    unpublished.prisma.version.findFirst.mockResolvedValue(null);
    await expect(getPublicEvidenceSource(unpublished.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const crossed = await fixture();
    crossed.prisma.evidenceRecord.findFirst.mockResolvedValue(null);
    await expect(getPublicEvidenceSource(crossed.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a tampered SourceMap and distinguishes an unavailable published original', async () => {
    const tampered = await fixture();
    tampered.objects.set(tampered.sourceMapRef.objectKey, {
      body: Buffer.alloc(tampered.sourceMapRef.size, 0x20), contentType: 'application/json',
    });
    await expect(getPublicEvidenceSource(tampered.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const missing = await fixture();
    missing.objects.delete(getBlobStorageKey(missing.artifact.blobSha256));
    await expect(getPublicEvidenceSource(missing.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toBeInstanceOf(PublicEvidenceSourceError);
    await expect(getPublicEvidenceSource(missing.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });

    const interrupted = await fixture();
    interrupted.storage.getObject.mockRejectedValueOnce(new Error('temporary storage outage'));
    await expect(getPublicEvidenceSource(interrupted.deps, {
      publicId: 'OSR-2026-000001', versionNo: 1, evidenceId: EVIDENCE,
    })).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  });
});

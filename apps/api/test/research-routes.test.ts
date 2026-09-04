import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { registerResearchRoutes } from '../src/routes/research';
import { httpStatusForError } from '../src/error-map';

function publicResearchObject() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    publicId: 'OSR-2026-000001',
    title: 'Published research',
    visibility: 'public',
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
  };
}

function routePrisma() {
  return {
    researchObject: { findUnique: vi.fn().mockResolvedValue(publicResearchObject()) },
    version: { findFirst: vi.fn().mockResolvedValue(null) },
    author: { findMany: vi.fn().mockResolvedValue([]) },
    contribution: { findMany: vi.fn().mockResolvedValue([]) },
    licenseAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    claimNode: { findMany: vi.fn().mockResolvedValue([]) },
    evidenceRecord: { findMany: vi.fn().mockResolvedValue([]) },
    presentationAsset: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('anonymous public research contract', () => {
  it('does not expose a public RO overview until a published Version has a Publication row', async () => {
    const prisma = routePrisma();
    const app = Fastify();
    registerResearchRoutes(app, { prisma } as never);

    const response = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001' });

    expect(response.statusCode).toBe(404);
    expect(prisma.version.findFirst).toHaveBeenCalledWith({
      where: {
        researchObjectId: publicResearchObject().id,
        status: 'published',
        publications: { some: {} },
      },
      orderBy: { versionNo: 'desc' },
    });
    await app.close();
  });

  it('scopes an exact public version read to published Versions with a Publication row', async () => {
    const prisma = routePrisma();
    const app = Fastify();
    registerResearchRoutes(app, { prisma } as never);

    const response = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001/v/2' });

    expect(response.statusCode).toBe(404);
    expect(prisma.version.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        researchObjectId: publicResearchObject().id,
        versionNo: 2,
        status: 'published',
        publications: { some: {} },
      },
    }));
    await app.close();
  });

  it('returns an explicitly mapped Claim-first DTO without private storage or verifier fields', async () => {
    const prisma = routePrisma();
    Object.assign(prisma.version, {
      findFirst: vi.fn().mockResolvedValue({
        id: 'version-1',
        versionNo: 1,
        publicVersionId: 'OSR-2026-000001-v1',
        status: 'published',
        manifest: { coreJson: { abstract: 'A bounded public snapshot.' }, entries: [] },
        publications: [{
          publicVersionId: 'OSR-2026-000001-v1',
          publishedAt: new Date('2026-08-29T01:00:00.000Z'),
          contentSha256: 'a'.repeat(64),
          legalDisclaimer: null,
        }],
        aiReview: null,
      }),
      findMany: vi.fn().mockResolvedValue([{
        versionNo: 1,
        publications: [{
          publicVersionId: 'OSR-2026-000001-v1',
          publishedAt: new Date('2026-08-29T01:00:00.000Z'),
          contentSha256: 'a'.repeat(64),
        }],
      }]),
    });
    prisma.claimNode.findMany.mockResolvedValue([
      {
        id: 'child-claim', parentClaimId: 'core-claim', kind: 'supporting',
        statement: 'The response is stable.', assessment: 'supported', conditions: [], limitations: [],
      },
      {
        id: 'core-claim', parentClaimId: null, kind: 'core',
        statement: 'The method is reproducible.', assessment: 'supported',
        conditions: ['Pinned environment'], limitations: ['CPU benchmark only'],
      },
    ]);
    prisma.evidenceRecord.findMany.mockResolvedValue([{
      id: 'evidence-1', claimId: 'core-claim', kind: 'passage', title: 'Results paragraph',
      exactQuote: 'The measured result was stable.', relation: 'supports',
      locator: { page: 3, artifactId: 'must-not-be-forwarded' }, extractionConfidence: 0.98,
      extractionStatus: 'succeeded', verifiedByUserId: 'private-verifier', contentHash: 'b'.repeat(64),
      workspaceId: 'private-workspace', provenance: { private: true }, objectKey: 'private/object/key',
      artifact: { logicalPath: 'paper.pdf', mimeType: 'application/pdf' },
    }]);
    prisma.presentationAsset.findMany.mockResolvedValue([{
      id: 'asset-1', kind: 'image', contentHash: 'c'.repeat(64), label: 'presentation_not_evidence',
      generator: 'MiniMax', generatorVersion: 'image-01', objectKey: 'private/presentation/key',
      promptHash: 'private-prompt', provenance: { private: true },
      sourceClaims: [{ claimId: 'core-claim' }],
    }]);
    const app = Fastify();
    registerResearchRoutes(app, { prisma } as never);

    const response = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001/v/1' });

    expect(response.statusCode).toBe(200);
    const research = response.json().research;
    expect(research.claims.map((claim: { id: string }) => claim.id)).toEqual(['core-claim', 'child-claim']);
    expect(research.evidence).toEqual([{
      id: 'evidence-1', claimId: 'core-claim', kind: 'passage', title: 'Results paragraph',
      exactQuote: 'The measured result was stable.', relation: 'supports',
      locator: { page: 3 }, extractionConfidence: 0.98, verified: true,
      artifact: { logicalPath: 'paper.pdf', mediaType: 'application/pdf', contentHash: 'b'.repeat(64) },
    }]);
    expect(research.presentationAssets).toEqual([{
      id: 'asset-1', kind: 'image', label: 'presentation_not_evidence', contentHash: 'c'.repeat(64),
      generator: { name: 'MiniMax', version: 'image-01' }, sourceClaimIds: ['core-claim'],
      url: '/api/research/OSR-2026-000001/v/1/presentation-assets/asset-1',
    }]);
    expect(research.history).toEqual([{
      versionNo: 1, publicVersionId: 'OSR-2026-000001-v1',
      publishedAt: '2026-08-29T01:00:00.000Z', contentSha256: 'a'.repeat(64),
      url: '/research/OSR-2026-000001/v/1',
    }]);
    const serialized = JSON.stringify(research);
    expect(serialized).not.toContain('private-verifier');
    expect(serialized).not.toContain('private-workspace');
    expect(serialized).not.toContain('private/object/key');
    expect(serialized).not.toContain('private/presentation/key');
    expect(serialized).not.toContain('private-prompt');
    expect(serialized).not.toContain('artifactId');
    await app.close();
  });

  it('serves an approved, hash-verified raster asset inline with strict response headers', async () => {
    const bytes = Buffer.from('safe-png-fixture');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const prisma = routePrisma();
    prisma.version.findFirst.mockResolvedValue({ id: 'version-1' });
    prisma.presentationAsset.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', objectKey: 'private/asset-key',
      kind: 'image', contentHash: hash,
    });
    const storage = {
      headObject: vi.fn().mockResolvedValue({ size: bytes.length, etag: 'etag', contentType: 'image/png' }),
      getObject: vi.fn().mockResolvedValue({ body: Readable.from([bytes]), size: bytes.length, contentType: 'image/png' }),
    };
    const app = Fastify();
    app.setErrorHandler((error, req, reply) => {
      const mapped = httpStatusForError(error, String(req.id));
      void reply.status(mapped.status).send(mapped.body);
    });
    registerResearchRoutes(app, { prisma, storage } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555',
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(prisma.presentationAsset.findFirst).toHaveBeenCalledWith({ where: {
      id: '55555555-5555-4555-8555-555555555555', researchObjectId: publicResearchObject().id,
      versionId: 'version-1', status: 'approved',
    } });
    await app.close();
  });

  it('forces HTML presentation bytes to download and rejects tampered assets', async () => {
    const bytes = Buffer.from('<script>top.location="https://evil.example"</script>');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const prisma = routePrisma();
    prisma.version.findFirst.mockResolvedValue({ id: 'version-1' });
    prisma.presentationAsset.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', objectKey: 'private/asset-key',
      kind: 'interactive_html', contentHash: hash,
    });
    const storage = {
      headObject: vi.fn().mockResolvedValue({ size: bytes.length, etag: 'etag', contentType: 'text/html' }),
      getObject: vi.fn().mockResolvedValue({ body: Readable.from([bytes]), size: bytes.length, contentType: 'text/html' }),
    };
    const app = Fastify();
    app.setErrorHandler((error, req, reply) => {
      const mapped = httpStatusForError(error, String(req.id));
      void reply.status(mapped.status).send(mapped.body);
    });
    registerResearchRoutes(app, { prisma, storage } as never);

    const download = await app.inject({
      method: 'GET',
      url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555',
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/octet-stream');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['content-security-policy']).toBe("sandbox; default-src 'none'");

    prisma.presentationAsset.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', objectKey: 'private/asset-key',
      kind: 'interactive_html', contentHash: '0'.repeat(64),
    });
    const tampered = await app.inject({
      method: 'GET',
      url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555',
    });
    expect(tampered.statusCode).toBe(404);

    prisma.presentationAsset.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', objectKey: 'private/asset-key',
      kind: 'interactive_html', contentHash: hash,
    });
    storage.headObject.mockResolvedValue(null);
    const unavailable = await app.inject({
      method: 'GET',
      url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555',
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe('SOURCE_UNAVAILABLE');
    await app.close();
  });

  it('serves only the platform deterministic chart SVG inline', async () => {
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>verified</text></svg>');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const prisma = routePrisma();
    prisma.version.findFirst.mockResolvedValue({ id: 'version-1' });
    prisma.presentationAsset.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', objectKey: 'private/asset-key', kind: 'chart',
      contentHash: hash, generator: 'OpenScience deterministic renderer', generatorVersion: 'openscience-presentation-v1',
    });
    const storage = {
      headObject: vi.fn().mockResolvedValue({ size: bytes.length, etag: 'etag', contentType: 'image/svg+xml' }),
      getObject: vi.fn().mockImplementation(async () => ({ body: Readable.from([bytes]), size: bytes.length, contentType: 'image/svg+xml' })),
    };
    const app = Fastify();
    registerResearchRoutes(app, { prisma, storage } as never);

    const response = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['content-disposition']).toContain('inline');

    prisma.presentationAsset.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', objectKey: 'private/asset-key', kind: 'chart',
      contentHash: hash, generator: 'other', generatorVersion: 'openscience-presentation-v1',
    });
    const untrusted = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555' });
    expect(untrusted.headers['content-type']).toContain('application/octet-stream');
    expect(untrusted.headers['content-disposition']).toContain('attachment');
    await app.close();
  });
});

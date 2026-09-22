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

const versionId = '22222222-2222-4222-8222-222222222222';
const publishedAt = new Date('2026-08-29T01:00:00.000Z');

function publicationMetadata(title = 'Published research') {
  return {
    schemaVersion: 1,
    captureSource: 'publication',
    capturedAt: publishedAt.toISOString(),
    title,
    authors: [], contributions: [], licenses: {},
    citation: {
      publicId: publicResearchObject().publicId,
      publicVersionId: `${publicResearchObject().publicId}-v1`,
      publicationNo: 1, year: 2026, publishedAt: publishedAt.toISOString(), text: null,
    },
  };
}

function frozenAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    researchObjectId: publicResearchObject().id,
    versionId,
    objectKey: 'private/asset-key',
    kind: 'image',
    contentHash: '0'.repeat(64),
    generator: 'MiniMax', generatorVersion: 'image-01', promptHash: 'private-prompt',
    status: 'approved', label: 'presentation_not_evidence', provenance: {}, sourceClaimIds: ['core-claim'],
    ...overrides,
  };
}

function frozenRecord(input: {
  claims?: unknown[]; evidence?: unknown[]; sources?: Record<string, unknown>; assets?: unknown[];
  title?: string;
} = {}) {
  return {
    dto: {
      objectId: publicResearchObject().id,
      versionId,
      claims: input.claims ?? [], evidence: input.evidence ?? [], manifest: [],
    },
    sources: input.sources ?? {},
    historyMedia: { captureSource: 'working_draft', capturedAt: publishedAt.toISOString(), items: input.assets ?? [] },
    publicationMetadata: publicationMetadata(input.title),
  };
}

function publishedVersion(researchRecord: unknown = frozenRecord()) {
  return {
    id: versionId, researchObjectId: publicResearchObject().id,
    versionNo: 7, publicationNo: 1, publicVersionId: 'OSR-2026-000001-v1',
    status: 'published', researchRecord,
    manifest: { coreJson: { abstract: 'A bounded public snapshot.' }, entries: [] },
    publications: [{
      id: 'publication-1', publicVersionId: 'OSR-2026-000001-v1',
      publishedAt, contentSha256: 'a'.repeat(64), legalDisclaimer: null,
    }],
    aiReview: null,
  };
}

function routePrisma() {
  return {
    journalArticle: { findUnique: vi.fn().mockResolvedValue(null) },
    researchObject: { findUnique: vi.fn().mockResolvedValue(publicResearchObject()) },
    version: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    author: { findMany: vi.fn().mockResolvedValue([]) },
    contribution: { findMany: vi.fn().mockResolvedValue([]) },
    licenseAssignment: { findMany: vi.fn().mockResolvedValue([]) },
    claimNode: { findMany: vi.fn().mockResolvedValue([]) },
    evidenceRecord: { findMany: vi.fn().mockResolvedValue([]) },
    presentationAsset: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('anonymous public research contract', () => {
  it('hides expired journal content through overview, fixed-version and presentation-asset routes', async () => {
    const prisma = routePrisma();
    const text = 'Synthetic authorized journal source with enough text to support a bounded full-text interpretation.';
    const url = 'https://journal.example.invalid/expired-source';
    const permissions = { internalProcessing: true, derivativeGeneration: true, publicSource: true, publicDerivative: true, externalProcessing: true, figureReuse: false, derivativeIllustration: false };
    prisma.version.findFirst.mockResolvedValue({
      id: 'version-1', researchObjectId: publicResearchObject().id,
      versionNo: 1, publicationNo: 1, publicVersionId: 'OSR-2026-000001-v1',
      status: 'published', researchRecord: {}, manifest: null,
      publications: [{ id: 'publication-1', publicVersionId: 'OSR-2026-000001-v1' }],
    });
    prisma.journalArticle.findUnique.mockResolvedValue({
      id: 'journal-article-1', contentState: 'active',
      rights: { ...permissions, license: 'CC-BY-4.0', evidence: 'Synthetic authorization.' },
      source: { kind: 'fulltext', text, url, materials: [{
        id: 'source-1', sourceType: 'publisher_full_text', url, activeForGeneration: true,
        contentSha256: createHash('sha256').update(text).digest('hex'),
        rightsStatus: 'full_public_processing_allowed', sourceConfidence: 'verified', permissions,
        evidence: { statement: 'Synthetic authorization.', license: 'CC-BY-4.0', expiresAt: '2000-01-01T00:00:00.000Z' },
      }] },
      releases: [{ versionId: 'version-1', snapshot: { draft: { scope: 'fulltext' } } }],
    });
    const storage = { headObject: vi.fn(), getObject: vi.fn() };
    const app = Fastify();
    app.setErrorHandler((error, req, reply) => {
      const mapped = httpStatusForError(error, String(req.id));
      void reply.status(mapped.status).send(mapped.body);
    });
    registerResearchRoutes(app, { prisma, storage } as never);
    try {
      for (const suffix of [
        '', '/v/1',
        '/v/1/artifacts/44444444-4444-4444-8444-444444444444/download',
        '/v/1/evidence/55555555-5555-4555-8555-555555555555/source',
        '/v/1/presentation-assets/66666666-6666-4666-8666-666666666666',
      ]) {
        const response = await app.inject({ url: `/research/OSR-2026-000001${suffix}` });
        expect(response.statusCode, response.body).toBe(404);
      }
      expect(storage.headObject).not.toHaveBeenCalled();
      expect(storage.getObject).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('does not expose a public RO overview until a published Version has a Publication row', async () => {
    const prisma = routePrisma();
    const app = Fastify();
    registerResearchRoutes(app, { prisma } as never);

    const response = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001' });

    expect(response.statusCode).toBe(404);
    expect(prisma.version.findFirst).toHaveBeenCalledWith({
      where: {
        researchObjectId: publicResearchObject().id,
        publications: { some: {} },
      },
      orderBy: { publicationNo: 'desc' },
      include: {
        manifest: { include: { entries: true } },
        publications: { orderBy: { publishedAt: 'desc' }, take: 1 },
        aiReview: true,
      },
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
        publicationNo: 2,
        publications: { some: {} },
      },
    }));
    await app.close();
  });

  it('returns an explicitly mapped Claim-first DTO without private storage or verifier fields', async () => {
    const prisma = routePrisma();
    const researchRecord = frozenRecord({
      claims: [
        {
          id: 'child-claim', parentClaimId: 'core-claim', kind: 'supporting',
          statement: 'The response is stable.', assessment: 'supported', conditions: [], limitations: [],
        },
        {
          id: 'core-claim', parentClaimId: null, kind: 'core',
          statement: 'The method is reproducible.', assessment: 'supported',
          conditions: ['Pinned environment'], limitations: ['CPU benchmark only'],
        },
      ],
      evidence: [{
        id: 'evidence-1', claimId: 'core-claim', artifactId: 'artifact-1',
        kind: 'passage', title: 'Results paragraph', relation: 'supports',
        locator: { page: 3, artifactId: 'must-not-be-forwarded' }, extractionConfidence: 0.98,
        extractionStatus: 'succeeded', verified: true, contentHash: 'b'.repeat(64),
        artifact: { logicalPath: 'paper.pdf', mimeType: 'application/pdf' },
      }],
      sources: {
        'evidence-1': {
          exactQuote: 'The measured result was stable.',
          verifiedByUserId: 'private-verifier', workspaceId: 'private-workspace',
          provenance: { private: true }, objectKey: 'private/object/key',
        },
      },
      assets: [frozenAsset({
        id: 'asset-1', contentHash: 'c'.repeat(64), objectKey: 'private/presentation/key',
        promptHash: 'private-prompt', provenance: { private: true },
      })],
    });
    Object.assign(prisma.version, {
      findFirst: vi.fn().mockResolvedValue(publishedVersion(researchRecord)),
      findMany: vi.fn().mockResolvedValue([{
        publicationNo: 1, publicVersionId: 'OSR-2026-000001-v1', status: 'published', researchRecord,
        publications: [{
          publicVersionId: 'OSR-2026-000001-v1',
          publishedAt,
          contentSha256: 'a'.repeat(64),
        }],
      }]),
    });
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
      versionNo: 1, publicationNo: 1, status: 'published', title: 'Published research',
      publicVersionId: 'OSR-2026-000001-v1',
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
    expect(prisma.claimNode.findMany).not.toHaveBeenCalled();
    expect(prisma.evidenceRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.presentationAsset.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('serves an approved, hash-verified raster asset inline with strict response headers', async () => {
    const bytes = Buffer.from('safe-png-fixture');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const prisma = routePrisma();
    prisma.version.findFirst.mockResolvedValue(publishedVersion(frozenRecord({
      assets: [frozenAsset({ kind: 'image', contentHash: hash })],
    })));
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
    expect(prisma.presentationAsset.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('forces HTML presentation bytes to download and rejects tampered assets', async () => {
    const bytes = Buffer.from('<script>top.location="https://evil.example"</script>');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const prisma = routePrisma();
    const asset = frozenAsset({ kind: 'interactive_html', contentHash: hash });
    prisma.version.findFirst.mockResolvedValue(publishedVersion(frozenRecord({ assets: [asset] })));
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

    asset.contentHash = '0'.repeat(64);
    const tampered = await app.inject({
      method: 'GET',
      url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555',
    });
    expect(tampered.statusCode).toBe(404);

    asset.contentHash = hash;
    storage.headObject.mockResolvedValue(null);
    const unavailable = await app.inject({
      method: 'GET',
      url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555',
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe('SOURCE_UNAVAILABLE');
    await app.close();
  });

  it('serves public video ranges only after publication authorization and complete digest verification', async () => {
    const bytes = Buffer.from('0123456789');
    const prisma = routePrisma();
    const asset = frozenAsset({
      objectKey: 'private/video-key', kind: 'video',
      contentHash: createHash('sha256').update(bytes).digest('hex'),
    });
    const validVersion = publishedVersion(frozenRecord({ assets: [asset] }));
    const versionWithoutAsset = publishedVersion(frozenRecord());
    prisma.version.findFirst.mockResolvedValue(validVersion);
    const storage = {
      headObject: vi.fn().mockResolvedValue({ size: bytes.length, contentType: 'video/webm' }),
      getObject: vi.fn().mockImplementation(async () => ({ body: Readable.from([bytes]), size: bytes.length, contentType: 'video/webm' })),
    };
    const app = Fastify();
    app.setErrorHandler((error, req, reply) => {
      const mapped = httpStatusForError(error, String(req.id));
      void reply.status(mapped.status).send(mapped.body);
    });
    registerResearchRoutes(app, { prisma, storage } as never);
    const url = '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555';
    const headers = { range: 'bytes=-3' };
    prisma.version.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(404);
    expect(storage.headObject).not.toHaveBeenCalled();
    prisma.version.findFirst.mockResolvedValueOnce(versionWithoutAsset).mockResolvedValueOnce(versionWithoutAsset);
    expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(404);
    expect(storage.getObject).not.toHaveBeenCalled();

    const response = await app.inject({ method: 'GET', url, headers });
    expect(response.statusCode).toBe(206);
    expect(response.body).toBe('789');
    expect(response.headers['content-range']).toBe('bytes 7-9/10');
    expect(response.headers['content-length']).toBe('3');
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(prisma.version.findFirst).toHaveBeenLastCalledWith({
      where: {
        researchObjectId: publicResearchObject().id, publicationNo: 1,
        status: { in: ['published', 'revised'] }, publications: { some: {} },
      },
      select: { id: true, researchRecord: true },
    });

    const invalid = await app.inject({ method: 'GET', url, headers: { range: 'bytes=99-' } });
    expect(invalid.statusCode).toBe(416);
    expect(invalid.headers['content-range']).toBe('bytes */10');
    storage.getObject.mockImplementation(async () => ({ body: Readable.from([Buffer.from('X123456789')]), size: bytes.length, contentType: 'video/webm' }));
    const corrupt = await app.inject({ method: 'GET', url, headers });
    expect(corrupt.statusCode).toBe(404);
    expect(corrupt.headers['content-range']).toBeUndefined();
    expect(corrupt.headers.etag).toBeUndefined();
    await app.close();
  });

  it('serves only the platform deterministic chart SVG inline', async () => {
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>verified</text></svg>');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const prisma = routePrisma();
    const asset = frozenAsset({
      kind: 'chart', contentHash: hash,
      generator: 'OpenScience deterministic renderer', generatorVersion: 'openscience-presentation-v1',
    });
    prisma.version.findFirst.mockResolvedValue(publishedVersion(frozenRecord({ assets: [asset] })));
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

    asset.generator = 'other';
    const untrusted = await app.inject({ method: 'GET', url: '/research/OSR-2026-000001/v/1/presentation-assets/55555555-5555-4555-8555-555555555555' });
    expect(untrusted.headers['content-type']).toContain('application/octet-stream');
    expect(untrusted.headers['content-disposition']).toContain('attachment');
    await app.close();
  });
});

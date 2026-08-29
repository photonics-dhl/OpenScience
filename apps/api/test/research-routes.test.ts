import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerResearchRoutes } from '../src/routes/research';

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
    presentationAsset: { findMany: vi.fn().mockResolvedValue([]) },
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
      url: '/research/OSR-2026-000001/v/1/presentation-assets/asset-1',
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
});

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createFakePrisma } from '@openscience/domain/test-helpers';
import { registerExploreRoutes } from '../src/routes/explore';

describe('GET /explore contract', () => {
  it('is anonymously readable, validates filters and returns the cursor envelope', async () => {
    const { prisma, db } = createFakePrisma();
    const now = new Date('2026-08-10T00:00:00.000Z');
    db.researchObjects.push({ id: 'ro-1', publicId: 'OSR-2026-000001', title: 'Open method', visibility: 'public', status: 'published', version: 1, updatedAt: now, createdAt: now });
    db.versions.push({ id: 'v-1', researchObjectId: 'ro-1', versionNo: 1, status: 'published', publicVersionId: 'OSR-2026-000001-v1', createdAt: now });
    db.sdfDocuments.push({ id: 'sdf-1', researchObjectId: 'ro-1', coreJson: {}, createdAt: now, updatedAt: now });
    db.sdfNodes.push({ id: 'node-1', sdfDocumentId: 'sdf-1', nodeType: 'method', content: 'Open protocol', sortOrder: 0 });
    const app = Fastify();
    registerExploreRoutes(app, { prisma } as never);

    const response = await app.inject({ method: 'GET', url: '/explore?limit=10&field=method' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [expect.objectContaining({ publicId: 'OSR-2026-000001', url: '/research/OSR-2026-000001' })],
      nextCursor: null,
    });
    expect((await app.inject({ method: 'GET', url: '/explore?field=unknown' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/explore?limit=101' })).statusCode).toBe(400);
    await app.close();
  });
});

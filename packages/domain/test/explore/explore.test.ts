import { describe, expect, it } from 'vitest';
import { createFakePrisma } from '../helpers/fakes';
import { listPublicResearchIndex } from '../../src/explore/explore';

function seedIndex() {
  const { prisma, db } = createFakePrisma();
  const now = new Date('2026-08-10T00:00:00.000Z');
  db.users.push({ id: 'u-1', displayName: 'Ada Researcher' });
  db.researchObjects.push(
    { id: 'ro-1', publicId: 'OSR-2026-000001', title: 'Ultrafast optical response', visibility: 'public', status: 'published', version: 1, updatedAt: now, createdAt: now },
    { id: 'ro-2', publicId: 'OSR-2026-000002', title: 'Reproducible climate method', visibility: 'public', status: 'published', version: 1, updatedAt: now, createdAt: now },
    { id: 'ro-private', publicId: 'OSR-2026-999999', title: 'Private optics', visibility: 'private', status: 'published', version: 1, updatedAt: now, createdAt: now },
  );
  db.sdfDocuments.push(
    { id: 'sdf-1', researchObjectId: 'ro-1', coreJson: {}, createdAt: now, updatedAt: now },
    { id: 'sdf-2', researchObjectId: 'ro-2', coreJson: {}, createdAt: now, updatedAt: now },
  );
  db.sdfNodes.push(
    { id: 'n-1', sdfDocumentId: 'sdf-1', nodeType: 'insight', content: 'A measured femtosecond response.', sortOrder: 0 },
    { id: 'n-2', sdfDocumentId: 'sdf-1', nodeType: 'method', content: 'Pump probe spectroscopy', sortOrder: 1 },
    { id: 'n-3', sdfDocumentId: 'sdf-2', nodeType: 'method', content: 'Versioned atmospheric workflow', sortOrder: 0 },
  );
  db.versions.push(
    { id: 'v-1', researchObjectId: 'ro-1', versionNo: 1, status: 'published', publicVersionId: 'OSR-2026-000001-v1', createdAt: now },
    { id: 'v-2', researchObjectId: 'ro-2', versionNo: 1, status: 'published', publicVersionId: 'OSR-2026-000002-v1', createdAt: now },
    { id: 'v-private', researchObjectId: 'ro-private', versionNo: 1, status: 'published', publicVersionId: 'OSR-2026-999999-v1', createdAt: now },
  );
  db.versionManifests.push(
    { id: 'm-1', versionId: 'v-1', coreJson: {}, createdAt: now },
    { id: 'm-2', versionId: 'v-2', coreJson: {}, createdAt: now },
  );
  db.manifestEntries.push(
    { id: 'e-1', manifestId: 'm-1', logicalPath: 'figure.png', artifactId: 'a-1', blobSha256: '1'.repeat(64) },
    { id: 'e-2', manifestId: 'm-2', logicalPath: 'analysis.py', artifactId: 'a-2', blobSha256: '2'.repeat(64) },
  );
  db.authors.push({ id: 'author-1', researchObjectId: 'ro-1', userId: 'u-1', sortOrder: 0 });
  return { prisma, db };
}

describe('public Research Index', () => {
  it('paginates only public ROs with a published version using a stable public-id cursor', async () => {
    const { prisma } = seedIndex();
    const first = await listPublicResearchIndex({ prisma } as never, { limit: 1 });
    expect(first.items).toEqual([
      expect.objectContaining({ publicId: 'OSR-2026-000001', latestVersion: 1, authors: ['Ada Researcher'], artifactTypes: ['image'] }),
    ]);
    expect(first.nextCursor).toBe('OSR-2026-000001');

    const second = await listPublicResearchIndex({ prisma } as never, { limit: 1, cursor: first.nextCursor! });
    expect(second.items.map((item) => item.publicId)).toEqual(['OSR-2026-000002']);
    expect(second.items).not.toContainEqual(expect.objectContaining({ publicId: 'OSR-2026-999999' }));
  });

  it('filters query, SDF field and artifact type before pagination', async () => {
    const { prisma } = seedIndex();
    await expect(listPublicResearchIndex({ prisma } as never, { limit: 20, query: 'femtosecond' }))
      .resolves.toMatchObject({ items: [{ publicId: 'OSR-2026-000001' }] });
    await expect(listPublicResearchIndex({ prisma } as never, { limit: 20, field: 'insight' }))
      .resolves.toMatchObject({ items: [{ publicId: 'OSR-2026-000001' }] });
    await expect(listPublicResearchIndex({ prisma } as never, { limit: 20, artifactType: 'code' }))
      .resolves.toMatchObject({ items: [{ publicId: 'OSR-2026-000002' }] });
  });
});

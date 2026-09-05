import { describe, expect, it, vi } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { importReviewedPresentationMedia } from '../../src/assets/reviewed-media-import';

const id = (n: number) => `${n}0000000-0000-4000-8000-000000000001`;
function fixture() {
  const { prisma, db } = createFakePrisma();
  seedUser(db, { id: id(1), platformRole: 'platform_admin' });
  db.workspaces.push({ id: id(2), status: 'active' });
  db.memberships.push({ workspaceId: id(2), userId: id(1), role: 'author' });
  db.researchObjects.push({ id: id(3), workspaceId: id(2) });
  db.versions.push({ id: id(4), researchObjectId: id(3), status: 'draft' });
  db.claimNodes.push({ id: id(5), researchObjectId: id(3), versionId: id(4), statement: 'Reviewed claim', extractionStatus: 'succeeded' });
  const content = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(content);
  const input = { userId: id(1), researchObjectId: id(3), versionId: id(4), sourceClaimIds: [id(5)], kind: 'image' as const, generator: 'Original generator', generatorVersion: 'v1', importRun: 'review-1', sourcePaperUrl: 'https://example.org/paper', content };
  const storage = { putObject: vi.fn(async () => ({ key: 'key', size: 32, etag: 'etag' })) };
  const audit = { record: vi.fn(async () => undefined) };
  const deps = { prisma, storage, audit } as never;
  return { db, prisma, storage, audit, deps, input };
}
describe('reviewed media import', () => {
  it('validates dry-run without mutation or upload, then imports and preserves rejected replay', async () => {
    const f = fixture();
    await expect(importReviewedPresentationMedia(f.deps, f.input, { dryRun: true })).resolves.toMatchObject({ dryRun: true, assetId: null });
    expect(f.storage.putObject).not.toHaveBeenCalled();
    expect(f.db.presentationAssets).toHaveLength(0);
    const result = await importReviewedPresentationMedia(f.deps, f.input);
    expect(result.status).toBe('draft');
    expect(f.audit.record).toHaveBeenCalledTimes(1);
    expect(f.db.presentationAssets[0].provenance.source).toBe('admin_reviewed_import');
    expect(f.db.agentTasks).toHaveLength(0);
    f.db.presentationAssets[0].status = 'rejected';
    await expect(importReviewedPresentationMedia(f.deps, f.input)).resolves.toMatchObject({ assetId: result.assetId, status: 'rejected' });
    expect(f.storage.putObject).toHaveBeenCalledTimes(1);
    expect(f.audit.record).toHaveBeenCalledTimes(1);
  });
  it.each(['admin', 'membership', 'draft', 'claims'])('rejects missing %s before storage', async (failure) => {
    const f = fixture();
    if (failure === 'admin') f.db.users[0].platformRole = 'user';
    if (failure === 'membership') f.db.memberships[0].role = 'viewer';
    if (failure === 'draft') f.db.versions[0].status = 'published';
    if (failure === 'claims') f.db.claimNodes[0].extractionStatus = 'needs_review';
    await expect(importReviewedPresentationMedia(f.deps, f.input)).rejects.toThrow();
    expect(f.storage.putObject).not.toHaveBeenCalled();
  });
  it('rejects replay metadata conflicts even during dry-run', async () => {
    const f = fixture();
    await importReviewedPresentationMedia(f.deps, f.input);
    await expect(importReviewedPresentationMedia(f.deps, { ...f.input, importRun: 'other' }, { dryRun: true })).rejects.toMatchObject({ code: 'CONCURRENT_UPDATE' });
  });
  it.each(['claim', 'admin', 'membership'])('rechecks %s after storage and before creating records', async (change) => {
    const f = fixture();
    f.storage.putObject.mockImplementation(async () => {
      if (change === 'claim') f.db.claimNodes[0].statement = 'changed';
      if (change === 'admin') f.db.users[0].platformRole = 'user';
      if (change === 'membership') f.db.memberships[0].role = 'viewer';
      return { key: 'key', size: 32, etag: 'etag' };
    });
    await expect(importReviewedPresentationMedia(f.deps, f.input)).rejects.toThrow();
    expect(f.db.presentationAssets).toHaveLength(0);
  });
  it('rejects invalid media signatures', async () => {
    const f = fixture();
    await expect(importReviewedPresentationMedia(f.deps, { ...f.input, content: Buffer.alloc(32) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f.storage.putObject).not.toHaveBeenCalled();
  });
});


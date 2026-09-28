import { describe, expect, it, vi } from 'vitest';
import { listCleanableContent, type TrashDeps } from '../../src/trash/trash';

function fixture(count = 206) {
  const assets = Array.from({ length: count }, (_, i) => ({ id: `asset-${i}`, kind: 'image', createdAt: new Date(0) }));
  const rows = new Map(assets.map(a => [a.id, { ...a, provenance: {} as Record<string, unknown> }]));
  const publicRecord = { historyMedia: { items: [
    { id: 'asset-0', kind: 'image', status: 'approved', provenance: { storyboardAssetId: 'asset-1' } },
    { id: 'asset-1', kind: 'interactive_html', status: 'approved', provenance: { subtype: 'storyboard', baseAssetId: 'asset-3' } },
    { id: 'asset-2', kind: 'image', status: 'rejected', publicationIncluded: false, provenance: {} },
    { id: 'asset-4', kind: 'image', status: 'draft', provenance: {} },
  ] } };
  rows.get('asset-3')!.provenance = { revisionAssetId: 'asset-0' };
  let active = 0;
  let peak = 0;
  const database = {
    researchObject: { findUnique: vi.fn(async () => ({ id: 'ro', workspaceId: 'space', createdBy: 'owner', deletedAt: null })) },
    workspace: { findUnique: vi.fn(async () => ({ id: 'space', status: 'active' })) },
    membership: { findUnique: vi.fn(async () => ({ role: 'owner' })) },
    agentSession: { findMany: vi.fn(async () => []) },
    agentTask: { findMany: vi.fn(async () => []) },
    artifact: { findMany: vi.fn(async () => []) },
    presentationAsset: { findMany: vi.fn(async () => assets), findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null) },
    version: { findMany: vi.fn(async () => [{ researchRecord: structuredClone(publicRecord) }]) },
    $queryRaw: vi.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 0));
      active -= 1;
      return [{ used: values[0] === 'asset-5' }];
    }),
  };
  return { deps: { prisma: database } as unknown as TrashDeps, database, peak: () => peak };
}

describe('personal content list with a large image history', () => {
  it('loads the publication reference history once and bounds concurrent reference queries', async () => {
    const f = fixture();
    const items = await listCleanableContent(f.deps, { userId: 'owner', researchObjectId: 'ro' });
    expect(items).toHaveLength(206);
    expect(f.database.version.findMany).toHaveBeenCalledTimes(1);
    expect(f.peak()).toBeLessThanOrEqual(8);
  });

  it('preserves public, unlisted, transitive and live-reference adoption without adopting an unused draft', async () => {
    const f = fixture(6);
    const items = await listCleanableContent(f.deps, { userId: 'owner', researchObjectId: 'ro' });
    const adopted = Object.fromEntries(items.map(item => [item.resourceId, item.adopted]));
    expect(adopted).toEqual({ 'asset-0': true, 'asset-1': true, 'asset-2': true, 'asset-3': true, 'asset-4': false, 'asset-5': true });
    expect(items.every(item => item.canDelete)).toBe(true);
  });

  it('checks membership before reading any publication or content history', async () => {
    const f = fixture();
    f.database.membership.findUnique.mockResolvedValueOnce(null as never);
    await expect(listCleanableContent(f.deps, { userId: 'outsider', researchObjectId: 'ro' })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    expect(f.database.presentationAsset.findMany).not.toHaveBeenCalled();
    expect(f.database.version.findMany).not.toHaveBeenCalled();
  });
});

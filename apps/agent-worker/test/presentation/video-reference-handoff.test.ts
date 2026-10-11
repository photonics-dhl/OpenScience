import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { requireVideoGenerationParents } from '@openscience/domain';
import { createPresentationGenerationHandler } from '../../src/presentation/handler';

// The domain's parent/permission checks have their own tests. This exercises the
// real handler's storage read, second authority check, and call into the spool.
vi.mock('@openscience/domain', async importOriginal => ({
  ...await importOriginal<typeof import('@openscience/domain')>(),
  requirePresentationWriteScope: vi.fn(async () => undefined),
  readReviewedPresentationEvidence: vi.fn(async () => []),
  requireVideoGenerationParents: vi.fn(),
}));

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('approved video image handoff', () => {
  it.each([false, true])('binds receipt order to the approved parents and refuses changed parents (changed=%s)', async changed => {
    const claims = [{ id: id(2), kind: 'core', statement: 'A sourced relation', extractionStatus: 'succeeded', conditions: [], limitations: [] }];
    const images = [9, 7, 8].map(n => ({ id: id(n + 10), objectKey: `frame-${n}`,
      contentHash: hash(Buffer.from(`saved-frame-${n}`)), provenance: { taskId: id(n) } }));
    const parents = { identity: 'approved-parent-snapshot', orderedImages: images,
      storyboardView: { document: { schemaVersion: 1, title: 'Reviewed paper', scenes: [] }, locale: 'zh', style: 'scientific' } };
    vi.mocked(requireVideoGenerationParents).mockReset()
      .mockResolvedValueOnce(parents as never)
      .mockResolvedValueOnce({ ...parents, identity: changed ? 'replaced-parent' : parents.identity } as never);
    const owner = { id: id(1), kind: 'presentation.generate', status: 'running', executionAttempt: 1,
      session: { userId: id(3), researchObjectId: id(4), researchObject: { id: id(4), workspaceId: id(5), workspace: { status: 'active' } } } };
    const generate = vi.fn(async () => { throw new Error('SPOOL_BOUNDARY_REACHED'); });
    const deps = {
      prisma: { agentTask: { findUnique: async () => owner }, presentationAsset: { findUnique: async () => null },
        claimNode: { findMany: async () => claims }, user: { findUnique: async () => ({ platformRole: 'platform_admin' }) } },
      storage: { getObject: async (key: string) => {
        const bytes = Buffer.from(`saved-${key}`);
        return { body: Readable.from([bytes]), size: bytes.length };
      } },
    };
    const task = { id: id(1), executionAttempt: 1, payload: { schemaVersion: 1, researchObjectId: id(4), versionId: id(6),
      kind: 'video', sourceClaimIds: [id(2)], video: { profile: 'content-driven-v1', storyboardAssetId: id(10),
        sceneImageAssetIds: images.map(image => image.id) } } };
    const result = createPresentationGenerationHandler({ videoSpool: { generate } })(deps as never, task as never);
    await expect(result).rejects.toThrow(changed ? 'approved video inputs changed' : 'SPOOL_BOUNDARY_REACHED');
    if (changed) expect(generate).not.toHaveBeenCalled();
    else expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      sceneImageTaskIds: [id(9), id(7), id(8)], sceneImages: [9, 7, 8].map(n => Buffer.from(`saved-frame-${n}`)),
    }));
  });
});

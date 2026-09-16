import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendMaterials, loadAttachmentDraft, loadResearchMaterials } from '@/lib/research-materials';
import { apiRequest, getResearchIngestion, getResearchObject, listVersions } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), getResearchIngestion: vi.fn(), getResearchObject: vi.fn(), listVersions: vi.fn() }));

describe('persistent research materials', () => {
  beforeEach(() => vi.resetAllMocks());
  it('captures the write revision before material reads on initial and post-save recovery', async () => {
    for (const revision of [1, 3]) {
      const versionReads = vi.mocked(listVersions).mock.calls.length;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      vi.mocked(getResearchObject).mockImplementationOnce(async () => {
        await gate;
        return { researchObject: { id: 'ro', version: revision, sdf: { core: { problem: `Revision ${revision}` } } } } as Awaited<ReturnType<typeof getResearchObject>>;
      });
      vi.mocked(listVersions).mockResolvedValue({ versions: [] });
      vi.mocked(getResearchIngestion).mockResolvedValue({ researchObjectId: 'ro', version: revision + 1, latestConfirmation: null, tasks: [] });
      const pending = loadAttachmentDraft('ro');
      await Promise.resolve();
      expect(vi.mocked(listVersions).mock.calls).toHaveLength(versionReads);
      release();
      const restored = await pending;
      expect(restored.researchObject.version).toBe(revision);
      expect(restored.researchObject.sdf.core.problem).toBe(`Revision ${revision}`);
      expect(restored.materials.ingestion.version).toBe(revision + 1);
    }
  });
  it('recovers the manifest without query tasks and preserves server-renamed import paths', async () => {
    vi.mocked(listVersions).mockResolvedValue({ versions: [{ versionId: 'v2', versionNo: 2, status: 'draft', commitId: 'c2', createdAt: '' }] });
    vi.mocked(getResearchIngestion).mockResolvedValue({ researchObjectId: 'ro', version: 7, latestConfirmation: null, tasks: [] });
    vi.mocked(apiRequest).mockResolvedValue({ version: { versionId: 'v2', snapshot: { artifacts: [{ artifactId: 'old', logicalPath: 'paper.pdf' }, { artifactId: 'new', logicalPath: 'imports/task/paper.pdf' }] } } });
    const restored = await loadResearchMaterials('ro');
    expect(restored.artifacts).toEqual([{ artifactId: 'old', logicalPath: 'paper.pdf' }, { artifactId: 'new', logicalPath: 'imports/task/paper.pdf' }]);
    expect(restored.ingestion.version).toBe(7);
    expect(getResearchIngestion).toHaveBeenCalledWith('ro');
  });
  it('fails closed when recovery or snapshot identity fails', async () => {
    vi.mocked(listVersions).mockResolvedValue({ versions: [{ versionId: 'v2', versionNo: 2, status: 'draft', commitId: 'c2', createdAt: '' }] });
    vi.mocked(getResearchIngestion).mockResolvedValue({ researchObjectId: 'ro', version: 7, latestConfirmation: null, tasks: [] });
    vi.mocked(apiRequest).mockResolvedValue({ version: { versionId: 'foreign', snapshot: { artifacts: [] } } });
    await expect(loadResearchMaterials('ro')).rejects.toThrow('Version snapshot mismatch');
  });
  it('adds same-name attachments without replacement, mutation, or duplicate manifest paths', () => {
    const existing = [{ artifactId: 'old', logicalPath: 'paper.pdf' }, { artifactId: 'other', logicalPath: 'paper.pdf.1' }];
    const result = appendMaterials(existing, [{ artifactId: 'new', logicalPath: 'paper.pdf' }, existing[0]]);
    expect(result).toEqual([...existing, { artifactId: 'new', logicalPath: 'paper.pdf.2' }]);
    expect(existing).toHaveLength(2);
  });
});

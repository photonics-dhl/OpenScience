import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHermesResearchRun, getCurrentUser, getExistingHermesResearchRun, getHermesVideoReadiness, getIngestionTask, isConfirmedIngestionReanalysisSource, reanalyzeConfirmedIngestion, type HermesResearchRun } from '@/lib/api';
import { startPaperNarrative } from '@/lib/hermes/start-paper-narrative';

vi.mock('@/lib/api', () => ({ createHermesResearchRun: vi.fn(), getCurrentUser: vi.fn(), getExistingHermesResearchRun: vi.fn(), getHermesVideoReadiness: vi.fn(), getIngestionTask: vi.fn(), isConfirmedIngestionReanalysisSource: vi.fn(), reanalyzeConfirmedIngestion: vi.fn() }));
const scope = { userId: 'user', researchObjectId: 'paper', ingestionTaskId: 'pdf' };
const run = { id: 'run', actorId: 'user', researchObjectId: 'paper', steps: [{ stage: 'source_ingestion', ingestionTaskId: 'pdf' }] } as HermesResearchRun;
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } } as Storage;
  return { scope, generation: { profile: 'visual-narrative-v1' as const, maxAgentTasks: 9 as const, locale: 'zh' as const, style: 'auto', instruction: '完整图文' }, storage, isCurrent: () => true, identityError: 'identity', storageError: 'storage' };
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user' } as Awaited<ReturnType<typeof getCurrentUser>>); vi.mocked(getExistingHermesResearchRun).mockResolvedValue({ run: null }); vi.mocked(getHermesVideoReadiness).mockResolvedValue({ available: true }); vi.mocked(getIngestionTask).mockResolvedValue({ batchId: 'batch', researchObjectId: 'paper', version: 1, task: { id: 'pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent', result: null } }); vi.mocked(isConfirmedIngestionReanalysisSource).mockReturnValue(false); vi.mocked(createHermesResearchRun).mockResolvedValue({ run }); });
describe('explicit creation of an illustrated paper', () => {
  it('checks video availability before any paid source reanalysis or new run', async () => {
    const input = fixture();
    vi.mocked(getHermesVideoReadiness).mockResolvedValue({ available: false });
    vi.mocked(isConfirmedIngestionReanalysisSource).mockReturnValue(true);
    await expect(startPaperNarrative({ ...input, scope: { ...scope, output: 'video' }, generation: { ...input.generation, output: 'video' } })).rejects.toThrow('unavailable');
    expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('creates and recovers a video intent separately, preserving its original payload', async () => {
    const input=fixture();
    const videoScope={...scope,output:'video' as const};
    const generation={...input.generation,output:'video' as const};
    const video={...run,generationSettings:generation};
    vi.mocked(createHermesResearchRun).mockRejectedValueOnce(new Error('network')).mockResolvedValue({run:video});
    await expect(startPaperNarrative({...input,scope:videoScope,generation})).rejects.toThrow('network');
    const first=vi.mocked(createHermesResearchRun).mock.calls[0];
    expect(await startPaperNarrative({...input,scope:videoScope,generation:{...generation,style:'ink'}})).toBe(video);
    expect(getExistingHermesResearchRun).toHaveBeenCalledWith('paper','pdf',undefined,'video');
    expect(vi.mocked(createHermesResearchRun).mock.calls[1]).toEqual(first);
    expect(first?.[3]).toEqual(generation);
  });
  it('does not reinterpret a returned image run as a video or submit a replacement', async () => {
    const input=fixture();
    vi.mocked(getExistingHermesResearchRun).mockResolvedValue({run});
    await expect(startPaperNarrative({...input,scope:{...scope,output:'video'},generation:{...input.generation,output:'video'}})).rejects.toThrow('identity');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('refuses a generation with a different medium from its saved scope', async () => {
    const input=fixture();
    await expect(startPaperNarrative({...input,scope:{...scope,output:'video'}})).rejects.toThrow('identity');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('starts the existing bounded workflow with one exact source', async () => {
    const input = fixture();
    expect(await startPaperNarrative(input)).toBe(run);
    expect(createHermesResearchRun).toHaveBeenCalledWith('paper', ['pdf'], expect.any(String), input.generation);
  });
  it('prepares a new source task when the confirmed historical source has no v5 review', async () => {
    const input = fixture();
    vi.mocked(getIngestionTask).mockResolvedValue({ batchId: 'batch', researchObjectId: 'paper', version: 1, task: {
      id: 'pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'confirmed', retryCount: 0, error: null, agentTaskId: 'agent',
      result: { canonicalExtractionContract: 'grounded-passages-v2', sourceMapAvailable: true },
    } });
    vi.mocked(isConfirmedIngestionReanalysisSource).mockReturnValue(true);
    vi.mocked(reanalyzeConfirmedIngestion).mockResolvedValue({ id: 'new-pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'queued', retryCount: 0, error: null, agentTaskId: 'new-agent' });
    const newRun = { ...run, steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun;
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: newRun });
    expect(await startPaperNarrative(input)).toBe(newRun);
    const sourceReanalysisKey = vi.mocked(reanalyzeConfirmedIngestion).mock.calls[0]?.[2];
    expect(sourceReanalysisKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(createHermesResearchRun).toHaveBeenCalledWith('paper', ['new-pdf'], expect.any(String), input.generation);
  });
  it('reuses the persisted source reanalysis key after a response loss', async () => {
    const input = fixture();
    vi.mocked(getIngestionTask).mockResolvedValue({ batchId: 'batch', researchObjectId: 'paper', version: 1, task: {
      id: 'pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'confirmed', retryCount: 0, error: null, agentTaskId: 'agent',
      result: { canonicalExtractionContract: 'grounded-passages-v2', sourceMapAvailable: true },
    } });
    vi.mocked(isConfirmedIngestionReanalysisSource).mockReturnValue(true);
    vi.mocked(reanalyzeConfirmedIngestion).mockRejectedValueOnce(new Error('network')).mockResolvedValue({
      id: 'new-pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'queued', retryCount: 0, error: null, agentTaskId: 'new-agent',
    });
    const newRun = { ...run, steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun;
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: newRun });
    await expect(startPaperNarrative(input)).rejects.toThrow('network');
    await startPaperNarrative(input);
    expect(reanalyzeConfirmedIngestion.mock.calls[1]?.[2]).toBe(reanalyzeConfirmedIngestion.mock.calls[0]?.[2]);
  });
  it('recovers the same pending key and payload after response loss', async () => {
    const input = fixture();
    vi.mocked(createHermesResearchRun).mockRejectedValueOnce(new Error('network'));
    await expect(startPaperNarrative(input)).rejects.toThrow('network');
    const first = vi.mocked(createHermesResearchRun).mock.calls[0];
    await startPaperNarrative({ ...input, generation: { ...input.generation, style: 'watercolor' } });
    expect(vi.mocked(createHermesResearchRun).mock.calls[1]).toEqual(first);
  });
  it('opens an already-created run without another write', async () => {
    vi.mocked(getExistingHermesResearchRun).mockResolvedValue({ run });
    expect(await startPaperNarrative(fixture())).toBe(run);
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('does not write when browser cannot retain recovery intent', async () => {
    await expect(startPaperNarrative({ ...fixture(), storage: null })).rejects.toThrow('storage');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('stops after account switch during the preceding read', async () => {
    let current = true;
    vi.mocked(getExistingHermesResearchRun).mockImplementation(async () => { current = false; return { run: null }; });
    await expect(startPaperNarrative({ ...fixture(), isCurrent: () => current })).rejects.toThrow('identity');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('does not accept a foreign run or actor', async () => {
    vi.mocked(getExistingHermesResearchRun).mockResolvedValue({ run: { ...run, actorId: 'other' } });
    await expect(startPaperNarrative(fixture())).rejects.toThrow('identity');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
});

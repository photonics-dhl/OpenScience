import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, createHermesResearchRun, getCurrentUser, getExistingHermesResearchRun, getHermesResearchRun, getHermesVideoCapability,
  getIngestionTask, isConfirmedIngestionReanalysisSource, reanalyzeConfirmedIngestion, type HermesResearchRun } from '@/lib/api';
import { prepareHermesNarrativeSource, startPaperNarrative } from '@/lib/hermes/start-paper-narrative';
import { loadPendingHermesRunStart, savePendingHermesRunStart } from '@/lib/hermes/draft-state';

vi.mock('@/lib/api', async importOriginal => ({ ApiClientError: (await importOriginal<typeof import('@/lib/api')>()).ApiClientError,
  createHermesResearchRun: vi.fn(), getCurrentUser: vi.fn(), getExistingHermesResearchRun: vi.fn(), getHermesResearchRun: vi.fn(),
  getHermesVideoCapability: vi.fn(), getIngestionTask: vi.fn(), isConfirmedIngestionReanalysisSource: vi.fn(), reanalyzeConfirmedIngestion: vi.fn() }));
const scope = { userId: 'user', researchObjectId: 'paper', ingestionTaskId: 'pdf' };
const run = { id: 'run', actorId: 'user', researchObjectId: 'paper', steps: [{ stage: 'source_ingestion', ingestionTaskId: 'pdf' }] } as HermesResearchRun;
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } } as Storage;
  return { scope, generation: { profile: 'visual-narrative-v1' as const, maxAgentTasks: 9 as const, locale: 'zh' as const, style: 'auto', instruction: '完整图文' }, storage, isCurrent: () => true, identityError: 'identity', storageError: 'storage' };
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user' } as Awaited<ReturnType<typeof getCurrentUser>>); vi.mocked(getExistingHermesResearchRun).mockResolvedValue({ run: null }); vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: true }); vi.mocked(getIngestionTask).mockResolvedValue({ batchId: 'batch', researchObjectId: 'paper', version: 1, task: { id: 'pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'needs_review', retryCount: 0, error: null, agentTaskId: 'agent', result: null } }); vi.mocked(isConfirmedIngestionReanalysisSource).mockReturnValue(false); vi.mocked(createHermesResearchRun).mockResolvedValue({ run }); });
afterEach(() => vi.restoreAllMocks());

function videoFixture() {
  const f = fixture(); const generation = { ...f.generation, output: 'video' as const };
  return { ...f, scope: { ...f.scope, output: 'video' as const }, generation };
}
function historicalSource() {
  const detail = { batchId: 'batch', researchObjectId: 'paper', version: 1, task: {
    id: 'pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'confirmed', retryCount: 0, error: null, agentTaskId: 'agent',
    result: { canonicalExtractionContract: 'grounded-passages-v2', sourceMapAvailable: true },
  } };
  vi.mocked(getIngestionTask).mockResolvedValue(detail);
  vi.mocked(isConfirmedIngestionReanalysisSource).mockReturnValue(true);
  vi.mocked(reanalyzeConfirmedIngestion).mockResolvedValue({ ...detail.task, id: 'new-pdf', state: 'queued', agentTaskId: 'new-agent' });
  return detail;
}

describe('fresh video readiness and exact saved requests', () => {
  it.each(['unavailable', 'network'] as const)('recovers the same prepared B body after %s without another paid preparation', async failure => {
    const f = videoFixture(); historicalSource(); const nextScope = { ...f.scope, ingestionTaskId: 'new-pdf' };
    vi.mocked(createHermesResearchRun).mockRejectedValueOnce(failure === 'unavailable'
      ? new ApiClientError('VIDEO_UNAVAILABLE', 'closed', 503) : new Error('network'));
    await expect(startPaperNarrative(f)).rejects.toBeDefined();
    const first = vi.mocked(createHermesResearchRun).mock.calls[0];
    const saved = loadPendingHermesRunStart(f.storage, nextScope);
    const original = loadPendingHermesRunStart(f.storage, f.scope);
    vi.mocked(getHermesVideoCapability).mockClear().mockResolvedValue({ canGenerateVideo: false });
    await expect(startPaperNarrative({ ...f, scope: nextScope })).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper'); expect(createHermesResearchRun).toHaveBeenCalledTimes(1);
    expect(reanalyzeConfirmedIngestion).toHaveBeenCalledTimes(1);
    expect(loadPendingHermesRunStart(f.storage, nextScope)).toEqual(saved);
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toEqual(original);
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: true });
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: { ...run, generationSettings: f.generation,
      steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun });
    await startPaperNarrative({ ...f, scope: nextScope, generation: { ...f.generation, style: 'changed' } });
    expect(vi.mocked(createHermesResearchRun).mock.calls[1]).toEqual(first);
    expect(reanalyzeConfirmedIngestion).toHaveBeenCalledTimes(1);
  });
  it('reads an existing run in the actual prepared B scope before admission or another run POST', async () => {
    const f = videoFixture(); historicalSource();
    const video = { ...run, generationSettings: f.generation, steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun;
    vi.mocked(getExistingHermesResearchRun).mockImplementation(async (_ro, source) => ({ run: source === 'new-pdf' ? video : null }));
    vi.mocked(reanalyzeConfirmedIngestion).mockImplementation(async () => {
      vi.mocked(getHermesVideoCapability).mockClear().mockResolvedValue({ canGenerateVideo: false });
      return { id: 'new-pdf', artifactId: 'artifact', logicalPath: 'paper.pdf', state: 'queued', retryCount: 0, error: null, agentTaskId: 'new-agent' };
    });
    expect(await startPaperNarrative(f)).toBe(video);
    expect(getExistingHermesResearchRun).toHaveBeenCalledWith('paper', 'new-pdf', undefined, 'video');
    expect(getHermesVideoCapability).not.toHaveBeenCalled(); expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it.each(['read', 'capability'] as const)('stops before run POST if context changes during prepared B %s', async stage => {
    const f = videoFixture(); historicalSource(); let current = true; let preparedRead = false;
    vi.mocked(getExistingHermesResearchRun).mockImplementation(async (_ro, source) => {
      if (source === 'new-pdf') { preparedRead = true; if (stage === 'read') current = false; }
      return { run: null };
    });
    vi.mocked(getHermesVideoCapability).mockImplementation(async () => {
      if (stage === 'capability' && preparedRead) current = false;
      return { canGenerateVideo: true };
    });
    await expect(startPaperNarrative({ ...f, isCurrent: () => current })).rejects.toThrow('identity');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('keeps the original source receipt only in its original scope and resumes the prepared run body', async () => {
    const f = videoFixture(); const detail = historicalSource();
    vi.mocked(createHermesResearchRun).mockRejectedValueOnce(new Error('response lost'));
    await expect(startPaperNarrative(f)).rejects.toThrow('response lost');
    const first = vi.mocked(createHermesResearchRun).mock.calls[0];
    const nextScope = { ...f.scope, ingestionTaskId: 'new-pdf' };
    const prepared = loadPendingHermesRunStart(f.storage, nextScope);
    expect(prepared).toMatchObject({ key: first?.[2], phase: 'run' });
    expect(prepared).not.toHaveProperty('sourceReanalysisKey'); expect(prepared).not.toHaveProperty('sourceReanalysisOutput');
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toMatchObject({ phase: 'source', sourceReanalysisKey: expect.any(String) });
    vi.mocked(getIngestionTask).mockClear().mockResolvedValue({ ...detail, task: { ...detail.task, id: 'new-pdf', agentTaskId: 'new-agent' } });
    vi.mocked(getHermesVideoCapability).mockClear().mockResolvedValue({ canGenerateVideo: false });
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: { ...run, generationSettings: f.generation,
      steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun });
    await expect(startPaperNarrative({ ...f, scope: nextScope })).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: true });
    await startPaperNarrative({ ...f, scope: nextScope, generation: { ...f.generation, style: 'changed' } });
    expect(vi.mocked(createHermesResearchRun).mock.calls[1]).toEqual(first);
    expect(reanalyzeConfirmedIngestion).toHaveBeenCalledTimes(1); expect(getIngestionTask).not.toHaveBeenCalled();
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper');
  });
  it('replays a legacy unknown run body without newly preparing a now-confirmed source', async () => {
    const f = videoFixture(); historicalSource();
    savePendingHermesRunStart(f.storage, f.scope, { key: 'unknown-run', generation: f.generation, savedAt: 1 });
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: false });
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: { ...run, generationSettings: f.generation } });
    await expect(startPaperNarrative(f)).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(createHermesResearchRun).not.toHaveBeenCalled();
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: true });
    await startPaperNarrative(f);
    expect(createHermesResearchRun).toHaveBeenCalledWith('paper', ['pdf'], 'unknown-run', f.generation);
    expect(getIngestionTask).not.toHaveBeenCalled(); expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper');
  });
  it('fixes the run stage before its first POST even when no reanalysis is needed', async () => {
    const f = videoFixture();
    vi.mocked(createHermesResearchRun).mockImplementationOnce(async () => {
      expect(loadPendingHermesRunStart(f.storage, f.scope)).toMatchObject({ phase: 'run' });
      throw new Error('response lost');
    });
    await expect(startPaperNarrative(f)).rejects.toThrow('response lost');
    historicalSource();
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: { ...run, generationSettings: f.generation } });
    await startPaperNarrative(f);
    expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
  });
  it('preserves a concurrently known run in the new source scope instead of overwriting it', async () => {
    const f = videoFixture(); const detail = historicalSource(); const nextScope = { ...f.scope, ingestionTaskId: 'new-pdf' };
    const video = { ...run, id: 'known-run', generationSettings: f.generation, steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun;
    vi.mocked(getHermesResearchRun).mockResolvedValue({ run: video });
    vi.mocked(reanalyzeConfirmedIngestion).mockImplementationOnce(async () => {
      const pending = loadPendingHermesRunStart(f.storage, f.scope)!;
      savePendingHermesRunStart(f.storage, nextScope, { key: pending.key, generation: pending.generation,
        savedAt: pending.savedAt, phase: 'run', runId: 'known-run' });
      return { ...detail.task, id: 'new-pdf', agentTaskId: 'new-agent' };
    });
    expect(await startPaperNarrative(f)).toBe(video);
    expect(getHermesResearchRun).toHaveBeenCalledWith('paper', 'known-run'); expect(createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(f.storage, nextScope)).toMatchObject({ runId: 'known-run', phase: 'run' });
  });
  it('does not overwrite a concurrent source key when both starts already had a run pending', async () => {
    const f = videoFixture(); historicalSource();
    savePendingHermesRunStart(f.storage, f.scope, { key: 'saved-run', generation: f.generation, savedAt: 1, phase: 'source' });
    let release: (() => void) | undefined;
    vi.mocked(getExistingHermesResearchRun).mockResolvedValueOnce({ run: null })
      .mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ run: null }); }));
    vi.mocked(reanalyzeConfirmedIngestion).mockRejectedValue(new Error('response lost'));
    const first = expect(startPaperNarrative(f)).rejects.toThrow('response lost');
    const second = expect(startPaperNarrative(f)).rejects.toThrow('response lost');
    await first;
    expect(release).toBeTypeOf('function'); release!(); await second;
    expect(vi.mocked(reanalyzeConfirmedIngestion).mock.calls).toHaveLength(2);
    expect(vi.mocked(reanalyzeConfirmedIngestion).mock.calls[1]).toEqual(vi.mocked(reanalyzeConfirmedIngestion).mock.calls[0]);
  });
  it.each(['start', 'prepare'] as const)('reuses a concurrently saved %s key after its readiness await', async entry => {
    const f = videoFixture(); const releases: Array<() => void> = [];
    vi.mocked(getHermesVideoCapability).mockImplementation(() => releases.length < 2
      ? new Promise(resolve => releases.push(() => resolve({ canGenerateVideo: true })))
      : Promise.resolve({ canGenerateVideo: true }));
    vi.mocked(createHermesResearchRun).mockRejectedValue(new Error('response lost'));
    const pending = { key: 'ui-run', generation: f.generation, savedAt: 1, phase: 'source' as const };
    if (entry === 'prepare') {
      historicalSource(); savePendingHermesRunStart(f.storage, f.scope, pending);
      vi.mocked(reanalyzeConfirmedIngestion).mockRejectedValue(new Error('response lost'));
    }
    const submit = () => entry === 'start' ? startPaperNarrative(f) : prepareHermesNarrativeSource({ ...f, pending });
    const first = expect(submit()).rejects.toThrow('response lost');
    const second = expect(submit()).rejects.toThrow('response lost');
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[0](); await first;
    releases[1](); await second;
    const calls = entry === 'start' ? vi.mocked(createHermesResearchRun).mock.calls : vi.mocked(reanalyzeConfirmedIngestion).mock.calls;
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
  });
  it.each(['closed', 'malformed', 'unreadable'] as const)('does not mint keys or submit new work when capability is %s', async mode => {
    const f = videoFixture(); const mint = vi.spyOn(crypto, 'randomUUID'); historicalSource();
    if (mode === 'unreadable') vi.mocked(getHermesVideoCapability).mockRejectedValue(new Error('network'));
    else vi.mocked(getHermesVideoCapability).mockResolvedValue(mode === 'closed' ? { canGenerateVideo: false } : null as never);
    await expect(startPaperNarrative(f)).rejects.toBeDefined();
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper'); expect(mint).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toBeNull();
    expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled(); expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('uses the common unavailable error for a closed new video', async () => {
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: false });
    await expect(startPaperNarrative(videoFixture())).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE', status: 503 });
  });
  it('reads a known pending run before readiness or source preparation', async () => {
    const f = videoFixture(); const saved = { key: 'original', generation: f.generation, savedAt: 1, runId: 'paid-run' };
    savePendingHermesRunStart(f.storage, f.scope, saved);
    const video = { ...run, id: 'paid-run', generationSettings: f.generation };
    vi.mocked(getHermesResearchRun).mockResolvedValue({ run: video });
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: false });
    expect(await startPaperNarrative(f)).toBe(video);
    expect(getHermesResearchRun).toHaveBeenCalledWith('paper', 'paid-run');
    expect(getHermesVideoCapability).not.toHaveBeenCalled(); expect(getIngestionTask).not.toHaveBeenCalled();
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('opens an existing video while closed without writing another intent', async () => {
    const f = videoFixture(); const video = { ...run, generationSettings: f.generation };
    vi.mocked(getExistingHermesResearchRun).mockResolvedValue({ run: video });
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: false });
    expect(await startPaperNarrative(f)).toBe(video);
    expect(getHermesVideoCapability).not.toHaveBeenCalled(); expect(createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toBeNull();
  });
  it.each([false, true])('replays an old source body without a video hint even after review becomes current (%s)', async reviewed => {
    const f = videoFixture(); const detail = historicalSource();
    if (reviewed) Object.assign(detail.task.result, { scientificReview: { contractVersion: '5', status: 'review_received' } });
    const pending = { key: 'original-run', generation: f.generation, savedAt: 1, sourceReanalysisKey: 'original-source' };
    savePendingHermesRunStart(f.storage, f.scope, pending);
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: { ...run, generationSettings: f.generation,
      steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun });
    await startPaperNarrative({ ...f, generation: { ...f.generation, style: 'changed' } });
    expect(reanalyzeConfirmedIngestion).toHaveBeenCalledWith('pdf', 'agent', 'original-source');
    expect(createHermesResearchRun).toHaveBeenCalledWith('paper', ['new-pdf'], 'original-run', f.generation);
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper');
  });
  it.each(['closed', 'malformed', 'unreadable'] as const)('holds an unmarked legacy source key when capability is %s without rewriting it', async mode => {
    const f = videoFixture(); historicalSource(); const mint = vi.spyOn(crypto, 'randomUUID');
    const pending = { key: 'old-run', generation: f.generation, savedAt: 1, sourceReanalysisKey: 'old-source' };
    savePendingHermesRunStart(f.storage, f.scope, pending);
    if (mode === 'unreadable') vi.mocked(getHermesVideoCapability).mockRejectedValue(new Error('network'));
    else vi.mocked(getHermesVideoCapability).mockResolvedValue(mode === 'closed' ? { canGenerateVideo: false } : null as never);
    await expect(startPaperNarrative(f)).rejects.toBeDefined();
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper'); expect(mint).not.toHaveBeenCalled();
    expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled(); expect(createHermesResearchRun).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toEqual(pending);
  });
  it('blocks a closed direct preparation before minting its source key or paying', async () => {
    const f = videoFixture(); historicalSource(); const mint = vi.spyOn(crypto, 'randomUUID');
    const pending = { key: 'ui-run-key', generation: f.generation, savedAt: 1, phase: 'source' as const };
    savePendingHermesRunStart(f.storage, f.scope, pending);
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: false });
    await expect(prepareHermesNarrativeSource({ ...f, pending })).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE', status: 503 });
    expect(mint).not.toHaveBeenCalled(); expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toEqual(pending);
  });
  it('persists a new video source body before POST and replays it unchanged after response loss and closure', async () => {
    const f = videoFixture(); const detail = historicalSource();
    const video = { ...run, generationSettings: f.generation, steps: [{ stage: 'source_ingestion', ingestionTaskId: 'new-pdf' }] } as HermesResearchRun;
    vi.mocked(createHermesResearchRun).mockResolvedValue({ run: video });
    vi.mocked(reanalyzeConfirmedIngestion).mockImplementationOnce(async (_task, _agent, key, _correction, output) => {
      expect(loadPendingHermesRunStart(f.storage, f.scope)).toMatchObject({ sourceReanalysisKey: key, sourceReanalysisOutput: 'video' });
      expect(output).toBe('video'); throw new Error('response lost');
    }).mockResolvedValue({ ...detail.task, id: 'new-pdf', state: 'queued', agentTaskId: 'new-agent' });
    await expect(startPaperNarrative(f)).rejects.toThrow('response lost');
    const first = vi.mocked(reanalyzeConfirmedIngestion).mock.calls[0];
    vi.mocked(getHermesVideoCapability).mockClear().mockResolvedValue({ canGenerateVideo: false });
    await expect(startPaperNarrative(f)).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
    expect(vi.mocked(reanalyzeConfirmedIngestion).mock.calls[1]).toEqual(first);
    expect(createHermesResearchRun).not.toHaveBeenCalled();
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: true });
    expect(await startPaperNarrative(f)).toBe(video);
    expect(vi.mocked(reanalyzeConfirmedIngestion).mock.calls[2]).toEqual(first);
  });
  it.each(['start', 'prepare'] as const)('stops %s when scope changes during the capability read', async entry => {
    const f = videoFixture(); historicalSource(); let current = true; const mint = vi.spyOn(crypto, 'randomUUID');
    vi.mocked(getHermesVideoCapability).mockImplementation(async () => { current = false; return { canGenerateVideo: true }; });
    const pending = { key: 'prepared-run', generation: f.generation, savedAt: 1, phase: 'source' as const };
    const action = entry === 'start' ? startPaperNarrative({ ...f, isCurrent: () => current })
      : prepareHermesNarrativeSource({ ...f, pending, isCurrent: () => current });
    await expect(action).rejects.toThrow('identity');
    expect(mint).not.toHaveBeenCalled(); expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
  it('guards direct preparation when its actor has changed', async () => {
    const f = videoFixture(); historicalSource();
    vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'other' } as Awaited<ReturnType<typeof getCurrentUser>>);
    await expect(prepareHermesNarrativeSource({ ...f, pending: { key: 'run', generation: f.generation, savedAt: 1, phase: 'source' } })).rejects.toThrow('identity');
    expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
  });
  it.each(['research-object', 'source-task', 'result-artifact'] as const)('rejects changed %s scope instead of creating a run', async change => {
    const f = videoFixture(); const detail = historicalSource();
    if (change === 'research-object') detail.researchObjectId = 'other';
    if (change === 'source-task') detail.task.id = 'other';
    if (change === 'result-artifact') vi.mocked(reanalyzeConfirmedIngestion).mockResolvedValue({ ...detail.task, id: 'new-pdf', artifactId: 'other' });
    await expect(startPaperNarrative(f)).rejects.toThrow('identity');
    expect(createHermesResearchRun).not.toHaveBeenCalled();
    if (change !== 'result-artifact') expect(reanalyzeConfirmedIngestion).not.toHaveBeenCalled();
    else expect(loadPendingHermesRunStart(f.storage, f.scope)?.sourceReanalysisOutput).toBe('video');
  });
  it('retains the original source recovery record if saving the new source scope fails', async () => {
    const f = videoFixture(); historicalSource();
    const setItem = f.storage.setItem;
    f.storage.setItem = (key, value) => { if (key.includes(':new-pdf:')) throw new Error('quota'); setItem(key, value); };
    await expect(startPaperNarrative(f)).rejects.toThrow('storage');
    expect(loadPendingHermesRunStart(f.storage, f.scope)).toMatchObject({ sourceReanalysisOutput: 'video', sourceReanalysisKey: expect.any(String) });
    expect(createHermesResearchRun).not.toHaveBeenCalled();
  });
});
describe('explicit creation of an illustrated paper', () => {
  it('creates and recovers a video intent separately, preserving its original payload', async () => {
    const input=fixture();
    const videoScope={...scope,output:'video' as const};
    const generation={...input.generation,output:'video' as const};
    const video={...run,generationSettings:generation};
    vi.mocked(createHermesResearchRun).mockRejectedValueOnce(new Error('network')).mockResolvedValue({run:video});
    await expect(startPaperNarrative({...input,scope:videoScope,generation})).rejects.toThrow('network');
    const first=vi.mocked(createHermesResearchRun).mock.calls[0];
    vi.mocked(getHermesVideoCapability).mockClear().mockResolvedValue({ canGenerateVideo: false });
    await expect(startPaperNarrative({...input,scope:videoScope,generation:{...generation,style:'ink'}})).rejects.toMatchObject({code:'VIDEO_UNAVAILABLE'});
    expect(createHermesResearchRun).toHaveBeenCalledTimes(1);
    vi.mocked(getHermesVideoCapability).mockResolvedValue({ canGenerateVideo: true });
    expect(await startPaperNarrative({...input,scope:videoScope,generation:{...generation,style:'ink'}})).toBe(video);
    expect(getHermesVideoCapability).toHaveBeenCalledWith('paper');
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

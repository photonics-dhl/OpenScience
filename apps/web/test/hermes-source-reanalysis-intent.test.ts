import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HermesResearchRun } from '@/lib/api';
import { generation, ids, newRun, newTask, sourceRun } from './fixtures/source-reanalysis';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
  } as unknown as Storage;
  const run = sourceRun();
  const posted: Array<{ path: string; key: string; body: unknown; saved: Record<string, unknown> | null }> = [];
  let actor = ids.actor;
  let existing: HermesResearchRun | null = null;
  let videoAvailable = true;
  const reads: string[] = [];
  const analysis = vi.fn(async () => json({ task: newTask }, 202));
  const create = vi.fn(async () => json({ run: newRun() }, 202));
  const fetcher = vi.fn(async (path: string, init?: RequestInit): Promise<Response> => {
    if (init?.method === 'POST') posted.push({ path, key: new Headers(init.headers).get('idempotency-key')!,
      body: JSON.parse(String(init.body)), saved: data.size ? JSON.parse([...data.values()][0]!) : null });
    else reads.push(path);
    if (path === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (path === '/api/auth/me') return json({ userId: actor, email: 'researcher@example.test' });
    if (path === `/api/research-objects/${ids.ro}/hermes-video-readiness`) return json({ available: videoAvailable });
    if (path === `/api/ingestion/${ids.oldIngestion}/reanalyze`) return analysis();
    if (path === `/api/research-objects/${ids.ro}/hermes-runs?ingestionTaskId=${ids.newIngestion}`) return json({ run: existing });
    if (path === `/api/research-objects/${ids.ro}/hermes-runs`) return create();
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return { run, data, storage, posted, reads, analysis, create, fetcher,
    setActor: (id: string) => { actor = id; }, setExisting: (value: HermesResearchRun | null) => { existing = value; }, setVideoAvailable: (value: boolean) => { videoAvailable = value; },
    input: { run, actorId: ids.actor, researchObjectId: ids.ro, storage, isCurrent: () => true },
    saved: () => JSON.parse([...data.values()][0]!),
  };
}

describe('bounded private source reanalysis intent', () => {
  it('blocks a video source reanalysis before its first paid POST when video is unavailable', async () => {
    const f = fixture(); f.setVideoAvailable(false);
    const videoRun = { ...f.run, generationSettings: { ...f.run.generationSettings!, output: 'video' as const } };
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis({ ...f.input, run: videoRun })).rejects.toMatchObject({ reason: 'video' });
    expect(f.analysis).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.reads).toContain(`/api/research-objects/${ids.ro}/hermes-video-readiness`);
  });
  it('advances both phases once, preserving the exact generation and saving both keys before each POST', async () => {
    const f = fixture(); const original = JSON.stringify(f.run); const phases: string[] = [];
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    expect(await continueSourceReanalysis({ ...f.input, onPhase: phase => phases.push(phase) })).toEqual(newRun());
    expect(phases).toEqual(['analysis', 'run']);
    expect(f.posted).toHaveLength(2);
    expect(f.posted[0]!.body).toEqual({ processingConsent: true, sourceAgentTaskId: ids.sourceAgent,
      sourceReanalysis: { intent: 'new_paid_private_analysis', sourceRunId: ids.oldRun, expectedRunVersion: 4 } });
    expect(f.posted[1]!.body).toEqual({ ingestionTaskIds: [ids.newIngestion], generation });
    for (const post of f.posted) expect(post.saved).toMatchObject({ actorId: ids.actor, researchObjectId: ids.ro,
      sourceRunId: ids.oldRun, expectedRunVersion: 4, ingestionTaskId: ids.oldIngestion, sourceAgentTaskId: ids.sourceAgent,
      generation, reanalysisKey: f.posted[0]!.key, runKey: f.posted[1]!.key });
    expect(f.posted[0]!.saved).not.toHaveProperty('newIngestionTaskId');
    expect(f.posted[1]!.saved).toHaveProperty('newIngestionTaskId', ids.newIngestion);
    expect(f.posted[0]!.key).not.toEqual(f.posted[1]!.key);
    expect(f.saved()).toHaveProperty('newRunId', ids.newRun);
    expect(f.reads.filter(path => path === '/api/auth/me')).toHaveLength(3);
    expect(JSON.stringify(f.run)).toBe(original);
  });

  it('stops on a lost analysis reply and explicit Continue reuses the same two keys and request', async () => {
    const f = fixture(); f.analysis.mockRejectedValueOnce(new TypeError('lost analysis reply'));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toThrow('lost analysis reply');
    expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled();
    const pending = f.saved();
    await continueSourceReanalysis(f.input);
    expect(f.posted[1]!.body).toEqual(f.posted[0]!.body);
    expect(f.posted[1]!.key).toEqual(pending.reanalysisKey);
    expect(f.posted[2]!.key).toEqual(pending.runKey);
  });

  it('reconciles a lost run reply on Continue without another paid analysis or run creation', async () => {
    const f = fixture();
    f.create.mockImplementationOnce(async () => { f.setExisting(newRun()); throw new TypeError('lost run reply'); });
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toThrow('lost run reply');
    expect(f.saved()).toHaveProperty('newIngestionTaskId', ids.newIngestion);
    expect(f.saved()).not.toHaveProperty('newRunId');
    expect(await continueSourceReanalysis(f.input)).toEqual(newRun());
    expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('reuses the saved second-phase key when no run can yet be reconciled', async () => {
    const f = fixture(); f.create.mockRejectedValueOnce(new TypeError('lost run reply'));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toThrow('lost run reply');
    await continueSourceReanalysis(f.input);
    expect(f.analysis).toHaveBeenCalledTimes(1);
    expect(f.posted[2]!.key).toEqual(f.posted[1]!.key);
    expect(f.posted[2]!.body).toEqual(f.posted[1]!.body);
  });

  it.each([true, false])('uses an existing new ingestion to restore or start its run, never another analysis (run exists: %s)', async exists => {
    const f = fixture(); f.run.sourceReanalysis!.existingIngestionTaskId = ids.newIngestion;
    if (exists) f.setExisting(newRun());
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    expect(await continueSourceReanalysis(f.input)).toEqual(newRun());
    expect(f.analysis).not.toHaveBeenCalled(); expect(f.create).toHaveBeenCalledTimes(exists ? 0 : 1);
    expect(f.reads).toContain(`/api/research-objects/${ids.ro}/hermes-runs?ingestionTaskId=${ids.newIngestion}`);
  });

  it('allows only the saved operation to continue if the eligibility handle is no longer returned', async () => {
    const f = fixture(); f.analysis.mockRejectedValueOnce(new TypeError('lost reply'));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toThrow('lost reply');
    const key = f.saved().reanalysisKey; f.run.sourceReanalysis = undefined;
    await continueSourceReanalysis(f.input);
    expect(f.posted[1]!.key).toBe(key);
    const empty = fixture(); empty.run.sourceReanalysis = undefined;
    await expect(continueSourceReanalysis(empty.input)).rejects.toMatchObject({ reason: 'context' });
    expect(empty.posted).toHaveLength(0);
  });

  it('reconciles an existing exact run after 409 without resending the mutation', async () => {
    const f = fixture(); f.create.mockImplementationOnce(async () => {
      f.setExisting(newRun()); return json({ error: { code: 'CONCURRENT_UPDATE', message: 'Already created' } }, 409);
    });
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    expect(await continueSourceReanalysis(f.input)).toEqual(newRun());
    expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('stops an unreconciled 409 with the saved source and keys intact', async () => {
    const f = fixture(); f.create.mockResolvedValueOnce(json({ error: { code: 'CONCURRENT_UPDATE', message: 'Conflict' } }, 409));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ status: 409 });
    expect(f.create).toHaveBeenCalledTimes(1); expect(f.saved().newIngestionTaskId).toBe(ids.newIngestion);
  });

  it('rejects an account switch before the first mutation', async () => {
    const f = fixture(); f.setActor(ids.ro);
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'context' });
    expect(f.posted).toHaveLength(0);
  });

  it('checks the account again before the second mutation and retains the successful new ingestion', async () => {
    const f = fixture(); f.analysis.mockImplementationOnce(async () => { f.setActor(ids.ro); return json({ task: newTask }, 202); });
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'context' });
    expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled();
    expect(f.saved().newIngestionTaskId).toBe(ids.newIngestion);
  });

  it.each(['version', 'source', 'actor', 'researchObject', 'generation'] as const)('stops before the second mutation after a visible %s change', async change => {
    const f = fixture(); let visible = f.run;
    f.analysis.mockImplementationOnce(async () => {
      visible = { ...f.run, ...(change === 'version' ? { version: 5 } : change === 'actor' ? { actorId: ids.ro }
        : change === 'researchObject' ? { researchObjectId: ids.actor }
          : change === 'generation' ? { generationSettings: { ...f.run.generationSettings!, style: 'watercolor' } }
            : { sourceReanalysis: { ...f.run.sourceReanalysis!, sourceAgentTaskId: ids.newRun } }) };
      return json({ task: newTask }, 202);
    });
    const { continueSourceReanalysis, isSourceReanalysisCurrent } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis({ ...f.input, isCurrent: intent => isSourceReanalysisCurrent(intent, visible) }))
      .rejects.toMatchObject({ reason: 'context' });
    expect(f.create).not.toHaveBeenCalled(); expect(f.saved().newIngestionTaskId).toBe(ids.newIngestion);
  });

  it('refuses a changed old-run version on Continue without replacing the original keys', async () => {
    const f = fixture(); f.analysis.mockRejectedValueOnce(new TypeError('lost reply'));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toThrow('lost reply');
    const saved = f.saved(); f.run.version = 5;
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'context' });
    expect(f.saved()).toEqual(saved); expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled();
  });

  it.each(['actor', 'source', 'generation', 'oldRun'] as const)('rejects a returned run with a mismatched %s', async change => {
    const f = fixture(); const result = newRun();
    if (change === 'actor') result.actorId = ids.ro;
    else if (change === 'source') result.steps[0]!.ingestionTaskId = ids.oldIngestion;
    else if (change === 'generation') result.generationSettings!.style = 'watercolor';
    else result.id = ids.oldRun;
    f.create.mockResolvedValueOnce(json({ run: result }, 202));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'response' });
    expect(f.saved()).not.toHaveProperty('newRunId');
  });

  it('does not return a new run after an account switch during its response', async () => {
    const f = fixture(); f.create.mockImplementationOnce(async () => { f.setActor(ids.ro); return json({ run: newRun() }, 202); });
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'context' });
    expect(f.saved()).not.toHaveProperty('newRunId');
  });

  it('requires working storage before either mutation', async () => {
    const f = fixture();
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis({ ...f.input, storage: null })).rejects.toMatchObject({ reason: 'storage' });
    expect(f.posted).toHaveLength(0);
    vi.mocked(f.storage.setItem).mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'storage' });
    expect(f.posted).toHaveLength(0);
  });

  it('retains the new source when storage fails before the run POST, so Continue skips analysis', async () => {
    const f = fixture(); const save = f.storage.setItem;
    let writes = 0;
    f.storage.setItem = (key, value) => { if (++writes === 3) throw new Error('quota'); save(key, value); };
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'storage' });
    const saved = f.saved(); expect(saved.newIngestionTaskId).toBe(ids.newIngestion); expect(f.create).not.toHaveBeenCalled();
    await continueSourceReanalysis(f.input);
    expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.posted[1]!.key).toBe(saved.runKey);
  });

  it('fails closed for a corrupt stored operation rather than generating replacement keys', async () => {
    const f = fixture(); f.analysis.mockRejectedValueOnce(new TypeError('lost reply'));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toThrow('lost reply');
    const key = [...f.data.keys()][0]!; f.data.set(key, '{broken');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'storage' });
    expect(f.analysis).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled(); expect(f.data.get(key)).toBe('{broken');
  });

  it('rejects the original ingestion ID returned as the supposed new analysis', async () => {
    const f = fixture(); f.analysis.mockResolvedValueOnce(json({ task: { ...newTask, id: ids.oldIngestion } }, 202));
    const { continueSourceReanalysis } = await import('@/lib/hermes/source-reanalysis-intent');
    await expect(continueSourceReanalysis(f.input)).rejects.toMatchObject({ reason: 'response' });
    expect(f.create).not.toHaveBeenCalled(); expect(f.saved()).not.toHaveProperty('newIngestionTaskId');
  });
});

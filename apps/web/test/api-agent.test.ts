import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('workspace.guide API client contract', () => {
  it('freshly reads the protected video capability without caching or mutation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ canGenerateVideo: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ canGenerateVideo: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getHermesVideoCapability } = await import('../lib/api');
    const signal = new AbortController().signal;
    expect(await getHermesVideoCapability('paper/scope', signal)).toEqual({ canGenerateVideo: false, audioAudition: null });
    expect(await getHermesVideoCapability('paper/scope', signal)).toEqual({ canGenerateVideo: true, audioAudition: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/research-objects/paper%2Fscope/hermes-video-capability',
      expect.objectContaining({ credentials: 'include', cache: 'no-store', signal }));
    expect(fetchMock.mock.calls.every(([, init]) => !init.body && (!init.method || init.method === 'GET'))).toBe(true);
  });
  it('sends the explicit video hint only when requested and preserves legacy reanalysis bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(async (path: string) => new Response(JSON.stringify(
      path === '/api/csrf-token' ? { csrfToken: 'csrf' } : { task: { id: 'new-source' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { reanalyzeConfirmedIngestion } = await import('../lib/api');
    await reanalyzeConfirmedIngestion('source', 'agent', 'new-video-key', undefined, 'video');
    await reanalyzeConfirmedIngestion('source', 'agent', 'old-key');
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(JSON.parse(posts[0][1].body)).toEqual({ processingConsent: true, sourceAgentTaskId: 'agent', output: 'video' });
    expect(JSON.parse(posts[1][1].body)).toEqual({ processingConsent: true, sourceAgentTaskId: 'agent' });
    expect(posts.map(([, init]) => init.headers['idempotency-key'])).toEqual(['new-video-key', 'old-key']);
  });
  it('qualifies video recovery without changing the legacy image query', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({run:null}), {status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const {getExistingHermesResearchRun}=await import('../lib/api');
    await getExistingHermesResearchRun('paper','source');
    await getExistingHermesResearchRun('paper','source',undefined,'video');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/research-objects/paper/hermes-runs?ingestionTaskId=source');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/research-objects/paper/hermes-runs?ingestionTaskId=source&output=video');
  });
  it('binds RO guidance to the existing authorized session context', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 'session-ro' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { createWorkspaceGuideSession } = await import('../lib/api');
    await createWorkspaceGuideSession('Explain the method', 'key-ro', 'ro-current');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ kind: 'workspace.guide', title: 'Explain the method', researchObjectId: 'ro-current' });
  });
  it('requests scoped work before the server task limit is applied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { listResearchIngestionTasks } = await import('../lib/api');
    await listResearchIngestionTasks('ro-current');
    expect(fetchMock).toHaveBeenCalledWith('/api/ingestion?actionable=true&researchObjectId=ro-current', expect.anything());
  });
  it('creates a guide session and submits an idempotent asynchronous task', async () => {
    const task = {
      id: 'task-1', sessionId: 'session-1', kind: 'workspace.guide', status: 'pending',
      progress: 0, result: null, error: null, createdAt: 'now', updatedAt: 'now',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 'session-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { createWorkspaceGuideSession, submitWorkspaceGuideTask } = await import('../lib/api');

    const session = await createWorkspaceGuideSession('整理今天的研究', 'session-key-1');
    await expect(submitWorkspaceGuideTask({
      sessionId: session.session.id,
      idempotencyKey: 'guide-key-1',
      payload: {
        goal: '整理今天的研究', locale: 'zh', route: 'dashboard', target: null,
        context: { tasks: [], researchObjects: [] },
      },
    })).resolves.toEqual({ task });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/agent/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ kind: 'workspace.guide', title: '整理今天的研究' }),
      headers: expect.objectContaining({ 'idempotency-key': 'session-key-1', 'x-csrf-token': 'csrf' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/agent/tasks', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session-1', kind: 'workspace.guide', payload: {
        goal: '整理今天的研究', locale: 'zh', route: 'dashboard', target: null, context: { tasks: [], researchObjects: [] },
      } }),
      headers: expect.objectContaining({ 'idempotency-key': 'guide-key-1', 'x-csrf-token': 'csrf' }),
    }));
  });
});

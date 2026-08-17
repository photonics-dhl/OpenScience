import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('workspace.guide API client contract', () => {
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

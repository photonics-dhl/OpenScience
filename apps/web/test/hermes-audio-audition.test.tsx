import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('private audio audition reads', () => {
  const auditionTask: api.AgentTaskView = {
    id: 'audio-task', sessionId: 'session', kind: 'presentation.generate', status: 'succeeded', progress: 100,
    retryCount: 0, canRetry: false, error: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
    result: { purpose: 'audio-audition', audioAudition: { taskId: 'audio-task', sceneIndex: 0, contentType: 'audio/mpeg', durationSeconds: 4.5, timingStatus: 'decoded' } },
  };

  it.each(['decoded', 'requires_revision'])('reads only a successful private sample with %s timing', (timingStatus) => {
    const metadata = { ...auditionTask.result!.audioAudition as object, timingStatus };
    expect(api.readPresentationAudioAudition({ ...auditionTask, result: { purpose: 'audio-audition', audioAudition: metadata } })).toEqual(metadata);
  });

  it.each([
    { taskId: 'different-task' }, { sceneIndex: -1 }, { sceneIndex: 6 }, { sceneIndex: 0.5 },
    { contentType: 'video/mp4' }, { durationSeconds: 0 }, { durationSeconds: Infinity }, { durationSeconds: 601 },
    { timingStatus: 'unknown' }, { objectKey: 'private/internal/file' }, { providerUrl: 'https://other.invalid/audio' },
  ])('rejects mismatched, unplayable or private metadata: %j', (change) => {
    expect(api.readPresentationAudioAudition({ ...auditionTask, result: { purpose: 'audio-audition', audioAudition: { ...auditionTask.result!.audioAudition as object, ...change } } })).toBeNull();
  });

  it.each(['pending', 'running', 'failed'] as const)('never turns a %s task into a playable result', (status) => {
    expect(api.readPresentationAudioAudition({ ...auditionTask, status })).toBeNull();
  });

  it('does not reinterpret a guide or a whole-film task as audio', () => {
    expect(api.readPresentationAudioAudition({ ...auditionTask, kind: 'workspace.guide' })).toBeNull();
    expect(api.readPresentationAudioAudition({ ...auditionTask, result: { ...auditionTask.result, purpose: 'full-film' } })).toBeNull();
  });

  it('constructs only a same-origin, encoded task-scoped path', () => {
    expect(api.presentationTaskAudioUrl('ro/1', 'v?2', 't#3')).toBe('/api/research-objects/ro%2F1/versions/v%3F2/presentation-tasks/t%233/audio');
    expect(api.presentationTaskAudioUrl('https://other.invalid', 'v', 't')).toMatch(/^\/api\/research-objects\/https%3A%2F%2Fother.invalid\//u);
  });

  it('downloads an audio Blob through an explicit authenticated GET without generating work', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ID3-local-fixture', { headers: { 'Content-Type': 'audio/mpeg' } }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const blob = await api.downloadPresentationTaskAudio('ro', 'version', 'task', signal);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/research-objects/ro/versions/version/presentation-tasks/task/audio', expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', signal }));
    expect(blob.type).toBe('audio/mpeg');
    expect(await blob.text()).toBe('ID3-local-fixture');
  });

  it.each([401, 403, 404, 500])('reports HTTP %i without saving an error body as MP3', async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(api.downloadPresentationTaskAudio('ro', 'version', 'task')).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects a non-audio success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(api.downloadPresentationTaskAudio('ro', 'version', 'task')).rejects.toMatchObject({ code: 'AUDIO_UNAVAILABLE' });
  });

  it('allows the caller to abort an in-flight download', async () => {
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const download = api.downloadPresentationTaskAudio('ro', 'version', 'task', controller.signal);
    controller.abort();
    await expect(download).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not deliver a private Blob after the signed-in session changes while it is being read', async () => {
    const response = new Response('ID3-local-fixture', { headers: { 'Content-Type': 'audio/mpeg' } });
    let finish!: () => void;
    vi.spyOn(response, 'blob').mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve(new Blob(['ID3-local-fixture'], { type: 'audio/mpeg' }));
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const download = api.downloadPresentationTaskAudio('ro', 'version', 'task');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    api.invalidateSessionClientCache();
    finish();
    await expect(download).rejects.toMatchObject({ code: 'CLIENT_SESSION_CHANGED', status: 409 });
  });
});

it('renders lazy native playback and a download action without autoplay or generation controls', async () => {
  const { HermesAudioAuditionPlayer } = await import('../components/hermes/HermesAudioAuditionPlayer');
  const markup = renderToStaticMarkup(createElement(HermesAudioAuditionPlayer, { ownerId: 'user', researchObjectId: 'ro', versionId: 'version', taskId: 'task' }));
  expect(markup).toContain('<audio');
  expect(markup).toContain('controls=""');
  expect(markup).toContain('preload="none"');
  expect(markup).toContain('src="/api/research-objects/ro/versions/version/presentation-tasks/task/audio"');
  expect(markup).toContain('download');
  expect(markup).not.toMatch(/autoplay|generate|voice|provider|objectKey/iu);
});

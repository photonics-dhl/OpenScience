import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentTaskView } from '../lib/api';
import { canReadReply, createVoiceReply, findVoiceSubmission, getVoiceCapabilities, isVoiceReplyReady, mergeVoiceTranscript, readVoiceTranscript, selectReplyVoice, transcribeVoice, voiceTaskAudioUrl } from '../lib/hermes/voice-api';

afterEach(() => { vi.unstubAllGlobals(); });

const task: AgentTaskView = {
  id: 'speech', sessionId: 'session', kind: 'voice.transcribe', status: 'succeeded', progress: 100,
  retryCount: 0, canRetry: false, error: null, result: { operation: 'transcription', transcript: '调整研究摘要' },
  createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z',
};

describe('optional voice capability read boundary', () => {
  const unavailable = { available: false, maxRecordingSeconds: 60, transcriptionCredits: 1, replyMaxUtf8Bytes: 1000, voices: [] };
  const voice = { id: 'returned-voice', name: 'Returned voice', languages: ['zh', 'en'], creditsPerRequest: 1 };

  it.each([
    {}, null, { ...unavailable, available: 'true' }, { ...unavailable, voices: null },
    { ...unavailable, voices: [null] }, { ...unavailable, voices: [{ ...voice, languages: 'zh' }] },
    { ...unavailable, voices: [{ ...voice, id: '' }] }, { ...unavailable, voices: [{ ...voice, creditsPerRequest: 4 }] },
    { ...unavailable, maxRecordingSeconds: 61 }, { ...unavailable, transcriptionCredits: 2 },
    { ...unavailable, replyMaxUtf8Bytes: 1001 },
  ])('rejects malformed successful capability data before it reaches voice rendering: %j', async payload => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(getVoiceCapabilities()).rejects.toThrow();
  });

  it.each([unavailable, { ...unavailable, available: true, voices: [voice] }])('accepts the unchanged unavailable and standard server contracts: %j', async payload => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(getVoiceCapabilities()).resolves.toEqual(payload);
  });
});

describe('Hermes voice result boundaries', () => {
  it('reads only completed transcription tasks', () => {
    expect(readVoiceTranscript(task)).toBe('调整研究摘要');
    expect(readVoiceTranscript({ ...task, status: 'running' })).toBeNull();
    expect(readVoiceTranscript({ ...task, kind: 'workspace.guide' })).toBeNull();
    expect(readVoiceTranscript({ ...task, result: { operation: 'transcription', transcript: 'x'.repeat(2001) } })).toBeNull();
  });

  it('keeps reply audio isolated from guide tasks and failed/uncertain work', () => {
    const reply = { ...task, kind: 'voice.reply', result: { operation: 'reply', audioReady: true, spokenText: 'Hello' } };
    expect(isVoiceReplyReady(reply)).toBe(true);
    expect(isVoiceReplyReady({ ...reply, kind: 'workspace.guide' })).toBe(false);
    expect(isVoiceReplyReady({ ...reply, status: 'failed' })).toBe(false);
    expect(isVoiceReplyReady({ ...reply, result: { ...reply.result, uncertain: true } })).toBe(false);
    expect(voiceTaskAudioUrl('task/#?')).toBe('/api/agent/voice/tasks/task%2F%23%3F/audio');
  });

  it('appends reviewed transcript without overwriting user edits and rejects stale scopes', () => {
    expect(mergeVoiceTranscript({ scope: 'owner:ro-a', currentScope: 'owner:ro-a', currentDraft: 'User typed while recognizing', transcript: 'New speech' }))
      .toBe('User typed while recognizing\nNew speech');
    expect(mergeVoiceTranscript({ scope: 'owner:ro-a', currentScope: 'owner:ro-b', currentDraft: '', transcript: 'New speech' })).toBeNull();
    expect(mergeVoiceTranscript({ scope: 'owner:ro-a', currentScope: 'owner:ro-a', currentDraft: 'x'.repeat(2000), transcript: 'New speech' })).toBeNull();
  });

  it('uses UTF-8 bytes for the reply limit and never silently truncates Chinese text', () => {
    const guide = { ...task, kind: 'workspace.guide', result: { summary: '研'.repeat(334) } };
    expect(canReadReply(guide, 1000)).toBe(false);
    expect(guide.result.summary.length).toBe(334);
    expect(canReadReply({ ...guide, result: { summary: '研'.repeat(333) } }, 1000)).toBe(true);
  });

  it('selects only an actual locale-matching standard voice returned by capabilities', () => {
    const caps = { available: true, maxRecordingSeconds: 60, transcriptionCredits: 1, replyMaxUtf8Bytes: 1000, voices: [
      { id: 'expensive', name: 'Premium', languages: ['zh'], creditsPerRequest: 4 },
      { id: 'actual-english', name: 'English', languages: ['en-US'], creditsPerRequest: 1 },
      { id: 'actual-chinese', name: 'Chinese', languages: ['zh-CN'], creditsPerRequest: 1 },
    ] };
    expect(selectReplyVoice(caps, 'zh')?.id).toBe('actual-chinese');
    expect(selectReplyVoice({ ...caps, voices: [] }, 'zh')).toBeUndefined();
  });
});

describe('Hermes voice authenticated transport', () => {
  it('preserves the same idempotency key and multipart body on a CSRF refresh', async () => {
    const posts: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/csrf-token') return Response.json({ csrfToken: 'csrf-refreshed' });
      posts.push(init!);
      return posts.length === 1
        ? Response.json({ error: { code: 'FST_CSRF_INVALID_TOKEN', message: 'refresh' } }, { status: 403 })
        : Response.json({ task }, { status: 202 });
    }));
    await transcribeVoice('session', new Blob(['RIFF-fixture'], { type: 'audio/wav' }), 'same-key');
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(new Headers(post.headers).get('Idempotency-Key')).toBe('same-key');
      expect(new Headers(post.headers).get('Content-Type')).toBeNull();
      expect(post.credentials).toBe('include');
      const body = post.body as FormData;
      expect(body.get('sessionId')).toBe('session');
      expect(body.has('language')).toBe(false);
      expect((body.get('file') as Blob).type).toBe('audio/wav');
    }
    expect(posts[1].body).toBe(posts[0].body);
  });

  it('does not repeat a timed-out paid POST; recovery only queries the original key', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/csrf-token') return Response.json({ csrfToken: 'csrf' });
      calls.push({ path, method: init?.method ?? 'GET' });
      if (init?.method === 'POST') throw new DOMException('Timed out', 'AbortError');
      return Response.json({ task });
    }));
    await expect(createVoiceReply('guide-source', 'actual-voice', 'original-key')).rejects.toMatchObject({ name: 'AbortError' });
    await findVoiceSubmission('original-key');
    expect(calls).toEqual([
      { path: '/api/agent/voice/replies', method: 'POST' },
      { path: '/api/agent/voice/submissions/original-key', method: 'GET' },
    ]);
  });

  it('submits only a guide task reference and chosen voice, never client-provided reply text', async () => {
    const fetch = vi.fn(async (path: string) => Response.json(path === '/api/csrf-token' ? { csrfToken: 'csrf' } : { task }));
    vi.stubGlobal('fetch', fetch);
    await createVoiceReply('guide-source', 'actual-voice', 'reply-key');
    const request = fetch.mock.calls.find(([path]) => path === '/api/agent/voice/replies') as unknown as [string, RequestInit];
    expect(JSON.parse(String(request[1].body))).toEqual({ sourceTaskId: 'guide-source', voiceId: 'actual-voice' });
  });
});

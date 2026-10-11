import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { LookupOptions } from 'node:dns';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES, SYNCLIP_AUDIO_MAX_REQUEST_BYTES, SYNCLIP_AUDIO_MAX_RESPONSE_BYTES,
  SYNCLIP_AUDIO_MAX_TEXT_BYTES, SynclipAudioClient, SynclipAudioError, downloadSynclipAudio,
  validateSynclipAudioBytes, validateSynclipAudioRequest, validateSynclipAudioTask, validateSynclipAudioVoices,
  type SynclipAudioClientConfig, type SynclipAudioDownloadOptions, type SynclipAudioDownloadRequestOptions,
  type SynclipAudioRequest,
} from '../src/synclip-audio-api';

const apiKey = 'test-only-audio-key';
const taskId = 'audio-task-123';
const voice = {
  id: 'en-US-JennyNeural', name: 'Jenny (English US)', gender: 'Female', languages: ['en'],
  preview_url: 'https://cdn.synclip.ai/previews/en-US-JennyNeural.mp3', is_premium: false, coins_per_char: 2,
};
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), {
  headers: { 'content-type': 'application/json' },
});
const chineseVoice = { ...voice, id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', languages: ['zh'], preview_url: null, coins_per_char: 0.25 };
const completed = (url = 'https://cdn.synclip.ai/audio.mp3?Signature=private') => ({
  task_id: taskId, status: 'completed' as const, progress: 100,
  output: { type: 'audio' as const, url, duration: 5.4 }, coins_used: 10, url_expires_at: '2099-01-01T00:00:00Z',
});
// Two complete MPEG-1 Layer III frames, 128 kbps / 44.1 kHz. This is a structural fixture, not provider output.
const frame = Buffer.concat([Buffer.from([255, 251, 144, 0]), Buffer.alloc(413)]);
const mp3 = Buffer.concat([frame, frame]);
const resolvePublic = () => vi.fn(async () => [{ address: '93.184.215.14', family: 4 }]);
function downloadTransport(body = mp3, headers: IncomingHttpHeaders = { 'content-type': 'audio/mpeg', 'content-length': String(body.length) }, status = 200) {
  let incoming: IncomingMessage;
  const outgoing = new EventEmitter() as ClientRequest;
  outgoing.destroy = vi.fn(() => { incoming?.destroy(); return outgoing; });
  const request = vi.fn((_url: URL, _options: SynclipAudioDownloadRequestOptions, callback: (response: IncomingMessage) => void) => {
    incoming = new PassThrough() as unknown as IncomingMessage;
    incoming.statusCode = status;
    incoming.headers = headers;
    queueMicrotask(() => { callback(incoming); if (!incoming.destroyed) (incoming as unknown as PassThrough).end(body); });
    return outgoing;
  });
  return { request, outgoing, get incoming() { return incoming; } };
}
const requestInput = { text: 'Hello, world!', voice: voice.id };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Synclip audio public contract', () => {
  it('uses returned voice IDs and submits the exact documented body to the fixed endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([voice]))
      .mockResolvedValueOnce(response({ task_id: taskId, status: 'processing', poll_url: '/v1/tasks/' + taskId }));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    await expect(client.listVoices()).resolves.toEqual([voice]);
    await expect(client.create({ text: 'Hello, world!', voice: voice.id, speed: 1.1 })).resolves.toEqual({ task_id: taskId });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.synclip.ai/v1/voices');
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe('https://api.synclip.ai/v1/audio');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: '{"text":"Hello, world!","voice":"en-US-JennyNeural","speed":1.1}' });
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' });
  });
  it('blocks a guessed voice before any provider submission', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).create({ text: 'Hello', voice: voice.id }))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_VOICE_NOT_AVAILABLE', outcome: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves Unicode text and omits defaults or undocumented fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([chineseVoice]))
      .mockResolvedValueOnce(response({ task_id: taskId, status: 'queued' }));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    await client.listVoices();
    await client.create({ text: '  原文\n光学 🧪  ', voice: chineseVoice.id });
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe('{"text":"  原文\\n光学 🧪  ","voice":"zh-CN-XiaoxiaoNeural"}');
  });
  it('accepts documented positive speed values beyond the suggested range', () => {
    expect(validateSynclipAudioRequest({ ...requestInput, speed: 0.4 })).toEqual({ ...requestInput, speed: 0.4 });
    expect(validateSynclipAudioRequest({ ...requestInput, speed: 3 })).toEqual({ ...requestInput, speed: 3 });
  });
  it('queries the saved ID at the documented route and preserves audio metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(completed()));
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).query(taskId)).resolves.toEqual(completed());
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.synclip.ai/v1/tasks/audio-task-123');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
  it.each(['queued', 'processing', 'failed'] as const)('recognizes documented %s status without inventing an output', status => {
    expect(validateSynclipAudioTask({ task_id: taskId, status, output: null }, taskId)).toEqual({ task_id: taskId, status });
  });
});

describe('Synclip audio input and catalog validation', () => {
  it('accepts a catalog with nullable or absent previews and fractional or zero prices', () => {
    const noPreview = Object.fromEntries(Object.entries(voice).filter(([key]) => key !== 'preview_url'));
    const voices = [chineseVoice, { ...noPreview, coins_per_char: 0 }];
    expect(validateSynclipAudioVoices(voices)).toEqual(voices);
    expect(validateSynclipAudioVoices([])).toEqual([]);
  });
  it.each([
    { id: '' }, { id: 'voice/path' }, { id: 7 }, { name: '' }, { gender: null }, { languages: [] },
    { languages: ['en', 'en'] }, { languages: 'en' }, { languages: [null] }, { is_premium: 'false' },
    { coins_per_char: -1 }, { coins_per_char: '2' }, { coins_per_char: Infinity }, { coins_per_char: NaN },
    { preview_url: '' }, { preview_url: 'http://cdn.synclip.ai/a.mp3' }, { preview_url: 'https://127.0.0.1/a.mp3' },
  ])('rejects malformed voice metadata %j', patch => {
    expect(() => validateSynclipAudioVoices([{ ...voice, ...patch }])).toThrow(SynclipAudioError);
  });
  it('rejects duplicate IDs and an unexpected catalog wrapper', () => {
    expect(() => validateSynclipAudioVoices([voice, voice])).toThrow();
    expect(() => validateSynclipAudioVoices({ voices: [voice] })).toThrow();
  });
  it('does not let callers add a guessed ID by mutating the returned catalog', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice]));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    const voices = await client.listVoices();
    voices[0]!.id = 'invented-voice';
    await expect(client.create({ ...requestInput, voice: 'invented-voice' })).rejects.toMatchObject({ outcome: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('requires membership in the current catalog and clears it after a failed refresh', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice]))
      .mockResolvedValueOnce(response([{ ...voice, coins_per_char: -1 }]));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    await client.listVoices();
    await expect(client.create({ ...requestInput, voice: 'other' })).rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_VOICE_NOT_AVAILABLE' });
    await expect(client.listVoices()).rejects.toMatchObject({ outcome: 'uncertain' });
    await expect(client.create(requestInput)).rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_VOICE_NOT_AVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not let an older catalog response re-enable voices after a newer refresh fails', async () => {
    let finishOlder: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>(accept => { finishOlder = accept; }))
      .mockResolvedValueOnce(response([{ ...voice, coins_per_char: -1 }]));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    const older = client.listVoices();
    await expect(client.listVoices()).rejects.toMatchObject({ outcome: 'uncertain' });
    finishOlder!(response([voice]));
    await older;
    await expect(client.create(requestInput)).rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_VOICE_NOT_AVAILABLE', outcome: 'invalid' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    null, {}, { text: 'Hello' }, { ...requestInput, text: '' }, { ...requestInput, text: ' \n ' },
    { ...requestInput, text: '\u0000Hello' }, { ...requestInput, text: '\ud800' }, { ...requestInput, voice: '' },
    { ...requestInput, speed: 0 }, { ...requestInput, speed: -1 }, { ...requestInput, speed: NaN },
    { ...requestInput, speed: Infinity }, { ...requestInput, speed: '1.1' }, { ...requestInput, speed: null },
    { ...requestInput, model: 'guessed' }, { ...requestInput, format: 'wav' }, { ...requestInput, voice_id: voice.id },
  ])('rejects invalid request %j before any network call', async input => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).create(input as SynclipAudioRequest))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_REQUEST_INVALID', outcome: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds UTF-8 text and escaped JSON independently', () => {
    expect(() => validateSynclipAudioRequest({ ...requestInput, text: '中'.repeat(Math.ceil(SYNCLIP_AUDIO_MAX_TEXT_BYTES / 3)) })).toThrow();
    const exact = validateSynclipAudioRequest({ ...requestInput, text: 'a'.repeat(SYNCLIP_AUDIO_MAX_TEXT_BYTES) });
    expect(exact.text.length).toBe(SYNCLIP_AUDIO_MAX_TEXT_BYTES);
    // Tabs are legal text, but their JSON escapes can exceed the request budget.
    const text = 'a' + '\t'.repeat(SYNCLIP_AUDIO_MAX_TEXT_BYTES - 1);
    expect(Buffer.byteLength(JSON.stringify({ text, voice: voice.id }))).toBeGreaterThan(SYNCLIP_AUDIO_MAX_REQUEST_BYTES);
    expect(() => validateSynclipAudioRequest({ ...requestInput, text })).toThrow();
  });
  it.each([
    null, {}, { apiKey: '' }, { apiKey: 'key\nprivate' }, { apiKey: 'with space' }, { apiKey: 'x'.repeat(4097) },
    { apiKey, baseUrl: 'https://attacker.test' }, { apiKey, fetch: false }, { apiKey, timeoutMs: 0 },
    { apiKey, timeoutMs: -1 }, { apiKey, timeoutMs: 1.5 }, { apiKey, timeoutMs: NaN }, { apiKey, timeoutMs: 30001 },
  ])('rejects invalid configuration %j', config => {
    expect(() => new SynclipAudioClient(config as SynclipAudioClientConfig)).toThrowError(expect.objectContaining({
      code: 'SYNCLIP_AUDIO_CONFIG_INVALID', outcome: 'invalid',
    }));
  });
  it.each(['../audio', 'a/b', 'a?secret=1', 'a#b', '', 'a'.repeat(201)])('rejects unsafe task ID %s before GET', async id => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).query(id)).rejects.toMatchObject({ outcome: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Synclip audio uncertain responses and bounds', () => {
  it.each([400, 401, 408, 429, 500, 502])('keeps HTTP %s uncertain, sanitized, and never retries POST', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice]))
      .mockResolvedValueOnce(new Response(apiKey + ' private-text https://cdn.synclip.ai/?Signature=private', { status }));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    await client.listVoices();
    const error = await client.create(requestInput).catch(error => error);
    expect(error).toMatchObject({ code: 'SYNCLIP_AUDIO_HTTP_FAILED', outcome: 'uncertain', httpStatus: status });
    expect(String(error) + JSON.stringify(error)).not.toMatch(/test-only|private-text|Signature|https/);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it.each([
    { task_id: '../other', status: 'processing' }, { task_id: taskId }, { task_id: taskId, status: ['processing'] },
    { task_id: taskId, status: 'succeeded' }, { task_id: taskId, status: 'processing', poll_url: 'https://attacker.test/task' },
  ])('keeps a malformed creation receipt uncertain %j', async data => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice])).mockResolvedValueOnce(response(data));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher });
    await client.listVoices();
    await expect(client.create(requestInput)).rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_RESPONSE_INVALID', outcome: 'uncertain' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry after a request timeout even if fetch ignores abort', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice])).mockImplementationOnce(() => new Promise(() => {}));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher, timeoutMs: 10 });
    await client.listVoices();
    const result = client.create(requestInput).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'SYNCLIP_AUDIO_TIMEOUT', outcome: 'uncertain' });
    expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('bounds a stalled response body and cancels the reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([voice]))
      .mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const client = new SynclipAudioClient({ apiKey, fetch: fetcher, timeoutMs: 10 });
    await client.listVoices();
    const result = client.create(requestInput).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'SYNCLIP_AUDIO_TIMEOUT', outcome: 'uncertain' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('sanitizes transport exceptions instead of retaining request secrets in the cause', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(apiKey + ' private-text https://private-url.test'));
    const error = await new SynclipAudioClient({ apiKey, fetch: fetcher }).listVoices().catch(error => error);
    expect(error).toMatchObject({ code: 'SYNCLIP_AUDIO_NETWORK_FAILED', outcome: 'uncertain' });
    expect(error).not.toHaveProperty('cause');
    expect(error.stack + JSON.stringify(error)).not.toMatch(/test-only-audio-key|private-text|private-url/);
  });
  it.each([
    ['advertised bytes', () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(SYNCLIP_AUDIO_MAX_RESPONSE_BYTES + 1) } })],
    ['streamed bytes', () => new Response(' '.repeat(SYNCLIP_AUDIO_MAX_RESPONSE_BYTES + 1), { headers: { 'content-type': 'application/json' } })],
    ['wrong MIME', () => new Response('{}', { headers: { 'content-type': 'text/html' } })],
    ['malformed JSON', () => new Response('{', { headers: { 'content-type': 'application/json' } })],
    ['invalid UTF-8', () => new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } })],
    ['false success', () => new Response('{"success":false,"data":[]}', { headers: { 'content-type': 'application/json' } })],
    ['bare data', () => new Response('[]', { headers: { 'content-type': 'application/json' } })],
  ] as const)('rejects %s without retrying', async (_name, buildResponse) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(buildResponse());
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).listVoices()).rejects.toMatchObject({ outcome: 'uncertain' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['https://attacker.test/v1/voices', 'https://api.synclip.ai/v1/audio'])('rejects a fetch response from %s', async url => {
    const reply = response([voice]);
    Object.defineProperty(reply, 'url', { value: url });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply);
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).listVoices()).rejects.toMatchObject({ outcome: 'uncertain' });
  });
  it('rejects a followed redirect even back to the same origin', async () => {
    const reply = response([voice]);
    Object.defineProperty(reply, 'redirected', { value: true });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply);
    await expect(new SynclipAudioClient({ apiKey, fetch: fetcher }).listVoices()).rejects.toMatchObject({ outcome: 'uncertain' });
  });
  it.each([
    { task_id: 'other' }, { status: 'succeeded' }, { status: ['completed'] }, { progress: 101 }, { coins_used: -1 },
    { output: { type: 'video', url: 'https://cdn.synclip.ai/a.mp4' } }, { output: { type: 'audio_url', url: 'https://cdn.synclip.ai/a.mp3' } },
    { output: { type: 'audio', url: 'https://cdn.synclip.ai/a.mp3', duration: -1 } },
    { url_expires_at: '2099' }, { url_expires_at: 'bad' }, { url_expires_at: undefined },
    { url_expires_at: '2099-02-30T12:00:00Z' }, { url_expires_at: '2099-01-01T24:00:00Z' },
  ])('rejects mismatched or malformed task metadata %j', patch => {
    expect(() => validateSynclipAudioTask({ ...completed(), ...patch }, taskId)).toThrowError(expect.objectContaining({ outcome: 'uncertain' }));
  });
});

describe('Synclip audio download transport', () => {
  it('pins a single public IPv4, preserves TLS host and sends no credentials', async () => {
    const resolve = resolvePublic();
    const transport = downloadTransport();
    await expect(downloadSynclipAudio(completed(), { resolve, request: transport.request })).resolves.toEqual({
      bytes: mp3, contentType: 'audio/mpeg', format: 'mp3',
    });
    expect(resolve).toHaveBeenCalledWith('cdn.synclip.ai');
    const [url, options] = transport.request.mock.calls[0]!;
    expect(url.href).toBe('https://cdn.synclip.ai/audio.mp3?Signature=private');
    expect(options).toMatchObject({ family: 4, autoSelectFamily: false, agent: false, servername: 'cdn.synclip.ai', rejectUnauthorized: true });
    expect(options.headers).toEqual({ Accept: 'audio/mpeg,application/octet-stream', 'Accept-Encoding': 'identity' });
    const callback = vi.fn();
    // Reusing the verified answer prevents a second DNS lookup from rebinding to an internal IP.
    options.lookup!('cdn.synclip.ai', { family: 4 } as LookupOptions, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.215.14', 4);
    const allCallback = vi.fn();
    options.lookup!('cdn.synclip.ai', { all: true }, allCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: '93.184.215.14', family: 4 }]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it.each([
    'http://cdn.synclip.ai/a.mp3', 'https://127.0.0.1/a.mp3', 'https://[::1]/a.mp3', 'https://2130706433/a.mp3',
    'https://user:pass@cdn.synclip.ai/a.mp3', 'https://cdn.synclip.ai:8443/a.mp3', 'https://cdn.synclip.ai/a.mp3#fragment',
    'https://localhost/a.mp3', 'https://metadata.google.internal/a.mp3', 'https://cdn.synclip.ai/ white.mp3',
    'https://cdn.synclip.ai/\u0000a.mp3', 'https://cdn.synclip.ai\\@127.0.0.1/a.mp3',
    'file:///a.mp3', 'data:audio/mpeg;base64,//s=', 'https://cdn.synclip.ai/' + 'a'.repeat(8192),
  ])('rejects unsafe result URL %s before resolving it', async url => {
    const resolve = resolvePublic();
    const request = vi.fn();
    await expect(downloadSynclipAudio(completed(url), { resolve, request })).rejects.toMatchObject({ outcome: 'uncertain' });
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['0.0.0.1', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1',
    '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '::1'])(
    'blocks nonpublic DNS answer %s before requesting', async address => {
    const resolve = vi.fn(async () => [{ address, family: address === '::1' ? 6 : 4 }]);
    const request = vi.fn();
    await expect(downloadSynclipAudio(completed(), { resolve, request })).rejects.toMatchObject({ outcome: 'uncertain' });
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private answers and an empty DNS answer', async () => {
    const request = vi.fn();
    for (const addresses of [[], [{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
      await expect(downloadSynclipAudio(completed(), { resolve: async () => addresses, request })).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });
  it('copies the selected DNS address rather than retaining a mutable resolver record', async () => {
    const addresses = [{ address: '93.184.215.14', family: 4 }];
    const transport = downloadTransport();
    await downloadSynclipAudio(completed(), { resolve: async () => addresses, request: transport.request });
    addresses[0]!.address = '127.0.0.1';
    const callback = vi.fn();
    transport.request.mock.calls[0]![1].lookup!('cdn.synclip.ai', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.215.14', 4);
  });
  it('stops DNS timeouts before opening a late download request', async () => {
    vi.useFakeTimers();
    let answer: (value: Array<{ address: string; family: number }>) => void;
    const resolve = vi.fn(() => new Promise<Array<{ address: string; family: number }>>(accept => { answer = accept; }));
    const request = vi.fn();
    const result = downloadSynclipAudio(completed(), { resolve, request, timeoutMs: 10 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'SYNCLIP_AUDIO_TIMEOUT' });
    answer!([{ address: '93.184.215.14', family: 4 }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
  });
  it('bounds a stalled download and destroys the active request', async () => {
    vi.useFakeTimers();
    const outgoing = new EventEmitter() as ClientRequest;
    outgoing.destroy = vi.fn(() => outgoing);
    const request = vi.fn(() => outgoing);
    const result = downloadSynclipAudio(completed(), { resolve: resolvePublic(), request, timeoutMs: 10 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'SYNCLIP_AUDIO_TIMEOUT', outcome: 'uncertain' });
    expect(outgoing.destroy).toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('cancels a stalled response stream at the same deadline', async () => {
    vi.useFakeTimers();
    const incoming = new PassThrough() as unknown as IncomingMessage;
    incoming.statusCode = 200;
    incoming.headers = { 'content-type': 'audio/mpeg' };
    const outgoing = new EventEmitter() as ClientRequest;
    outgoing.destroy = vi.fn(() => outgoing);
    const request = vi.fn((_url: URL, _options: SynclipAudioDownloadRequestOptions, callback: (response: IncomingMessage) => void) => {
      queueMicrotask(() => { callback(incoming); (incoming as unknown as PassThrough).write(frame); });
      return outgoing;
    });
    const result = downloadSynclipAudio(completed(), { resolve: resolvePublic(), request, timeoutMs: 10 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toMatchObject({ code: 'SYNCLIP_AUDIO_TIMEOUT', outcome: 'uncertain' });
    expect(incoming.destroyed).toBe(true);
    expect(outgoing.destroy).toHaveBeenCalled();
  });
  it.each(['aborted', 'close', 'error'])('sanitizes a premature response %s event', async event => {
    const incoming = new PassThrough() as unknown as IncomingMessage;
    incoming.statusCode = 200;
    incoming.headers = { 'content-type': 'audio/mpeg' };
    const outgoing = new EventEmitter() as ClientRequest;
    outgoing.destroy = vi.fn(() => outgoing);
    const request = vi.fn((_url: URL, _options: SynclipAudioDownloadRequestOptions, callback: (response: IncomingMessage) => void) => {
      queueMicrotask(() => { callback(incoming); incoming.emit(event, new Error(apiKey + ' private signed URL')); });
      return outgoing;
    });
    const error = await downloadSynclipAudio(completed(), { resolve: resolvePublic(), request }).catch(error => error);
    expect(error).toMatchObject({ code: 'SYNCLIP_AUDIO_NETWORK_FAILED', outcome: 'uncertain' });
    expect(error.stack + JSON.stringify(error)).not.toMatch(/test-only-audio-key|signed URL/);
    expect(incoming.destroyed).toBe(true);
  });
  it('assembles fragmented audio without padding or dropping bytes', async () => {
    const incoming = new PassThrough() as unknown as IncomingMessage;
    incoming.statusCode = 200;
    incoming.headers = { 'content-type': 'audio/mpeg', 'content-length': String(mp3.length) };
    const outgoing = new EventEmitter() as ClientRequest;
    outgoing.destroy = vi.fn(() => outgoing);
    const request = vi.fn((_url: URL, _options: SynclipAudioDownloadRequestOptions, callback: (response: IncomingMessage) => void) => {
      queueMicrotask(() => {
        callback(incoming);
        for (const byte of mp3) (incoming as unknown as PassThrough).write(Buffer.from([byte]));
        (incoming as unknown as PassThrough).end();
      });
      return outgoing;
    });
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request })).resolves.toEqual({
      bytes: mp3, format: 'mp3', contentType: 'audio/mpeg',
    });
  });
  it.each([301, 302, 307, 308, 403, 500])('rejects download status %s without following a location', async status => {
    const transport = downloadTransport(mp3, { 'content-type': 'audio/mpeg', location: 'https://127.0.0.1/secret' }, status);
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request: transport.request }))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_HTTP_FAILED', httpStatus: status });
    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(transport.incoming.destroyed).toBe(true);
  });
  it.each([
    { 'content-type': 'text/html' }, { 'content-type': 'video/mp4' }, { 'content-type': 'audio/wav' },
    { 'content-type': 'audio/mpeg', 'content-encoding': 'gzip' }, {},
  ])('rejects unexpected download headers %j', async headers => {
    const transport = downloadTransport(mp3, headers);
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request: transport.request }))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_FORMAT_UNSUPPORTED' });
  });
  it.each(['-1', 'NaN', String(SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES + 1), String(mp3.length - 1)])('bounds or checks advertised download length %s', async length => {
    const transport = downloadTransport(mp3, { 'content-type': 'audio/mpeg', 'content-length': length });
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request: transport.request })).rejects.toThrow();
    expect(transport.incoming.destroyed).toBe(true);
  });
  it('bounds streamed bytes when Content-Length is absent', async () => {
    const body = Buffer.alloc(SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES + 1);
    const transport = downloadTransport(body, { 'content-type': 'audio/mpeg' });
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request: transport.request }))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_RESPONSE_TOO_LARGE' });
  });
  it('allows a generic CDN MIME only when the bytes validate as supported audio', async () => {
    const transport = downloadTransport(mp3, { 'content-type': 'application/octet-stream' });
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request: transport.request }))
      .resolves.toMatchObject({ format: 'mp3', contentType: 'audio/mpeg', bytes: mp3 });
    const bad = downloadTransport(Buffer.from('<html>not audio</html>'), { 'content-type': 'application/octet-stream' });
    await expect(downloadSynclipAudio(completed(), { resolve: resolvePublic(), request: bad.request })).rejects.toThrow();
  });
  it('rejects expired or unfinished tasks before DNS and does not refresh the task automatically', async () => {
    const resolve = resolvePublic();
    const request = vi.fn();
    await expect(downloadSynclipAudio({ ...completed(), url_expires_at: '2020-01-01T00:00:00Z' }, { resolve, request })).rejects.toThrow();
    await expect(downloadSynclipAudio({ task_id: taskId, status: 'processing' }, { resolve, request })).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{ timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: 180001 }, { now: false }, { resolve: 1 }, { request: {} }])(
    'rejects invalid download configuration %j before DNS', async options => {
    await expect(downloadSynclipAudio(completed(), options as SynclipAudioDownloadOptions))
      .rejects.toMatchObject({ code: 'SYNCLIP_AUDIO_CONFIG_INVALID', outcome: 'invalid' });
  });
});

describe('Synclip audio byte format boundary', () => {
  it('recognizes Layer III bytes independently of the URL extension', () => {
    expect(validateSynclipAudioBytes(mp3)).toEqual({ bytes: mp3, format: 'mp3', contentType: 'audio/mpeg' });
    const tag = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
    expect(validateSynclipAudioBytes(Buffer.concat([tag, mp3])).format).toBe('mp3');
  });
  it.each([
    Buffer.from('RIFF0000WAVEfmt '), Buffer.from('....ftypisom00000000000000'), Buffer.from('OggS000000000000000000000000'),
    Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), Buffer.from('ID3not-a-valid-frame'),
    mp3.subarray(0, mp3.length - 1), frame, Buffer.concat([Buffer.from([255, 251, 240, 0]), Buffer.alloc(830)]),
    Buffer.concat([mp3, Buffer.from('trailing junk')]),
  ])('rejects unsupported, truncated or false-positive audio %#', bytes => {
    expect(() => validateSynclipAudioBytes(bytes)).toThrow(SynclipAudioError);
  });
  it('rejects an oversized byte buffer even outside the downloader', () => {
    expect(() => validateSynclipAudioBytes(Buffer.alloc(SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES + 1)))
      .toThrowError(expect.objectContaining({ code: 'SYNCLIP_AUDIO_RESPONSE_TOO_LARGE' }));
  });
});

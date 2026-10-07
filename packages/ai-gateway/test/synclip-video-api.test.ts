import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { SynclipVideoClient, downloadSynclipVideo, validateSynclipVideoRequest } from '../src/synclip-video-api';

const taskId = 'remote-video-123';
const apiKey = 'test-only-key';
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { 'content-type': 'application/json' } });
const completed = (url = 'https://cdn.synclip.ai/video.mp4?signature=private') => ({ task_id: taskId, status: 'completed', output: { type: 'video', url, watermarked: false }, url_expires_at: '2099-01-01T00:00:00.000Z' });

describe('Synclip fixed video API', () => {
  it('submits one documented LTX request to the fixed endpoint', async () => {
    const fetcher = vi.fn(async () => response({ task_id: taskId, status: 'processing' }));
    const client = new SynclipVideoClient({ apiKey, fetch: fetcher });
    await expect(client.create({ prompt: 'A controlled scientific transition.', model: 'ltx23', duration: 5, resolution: '720p' })).resolves.toEqual({ task_id: taskId });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.synclip.ai/v1/video'); expect(init.method).toBe('POST'); expect(init.redirect).toBe('error');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer ' + apiKey });
    expect(JSON.parse(String(init.body))).toEqual({ prompt: 'A controlled scientific transition.', model: 'ltx23', duration: 5, resolution: '720p' });
  });
  it('queries only the saved task and normalizes a succeeded alias', async () => {
    const fetcher = vi.fn(async () => response({ ...completed(), status: 'succeeded' }));
    await expect(new SynclipVideoClient({ apiKey, fetch: fetcher }).query(taskId)).resolves.toMatchObject({ task_id: taskId, status: 'completed' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.synclip.ai/v1/tasks/remote-video-123');
  });
  it('accepts independent first and last frame fields', () => {
    expect(validateSynclipVideoRequest({ prompt: 'bridge', model: 'ltx23fast', duration: 10, resolution: '720p', first_frame_url: 'https://assets.example/frame.png' })).toMatchObject({ model: 'ltx23fast', duration: 10, first_frame_url: 'https://assets.example/frame.png' });
  });
  it.each([4, 20])('rejects unsupported duration %s before POST', async duration => {
    const fetcher = vi.fn();
    await expect(new SynclipVideoClient({ apiKey, fetch: fetcher }).create({ prompt: 'x', model: 'ltx23', duration: duration as 5, resolution: '720p' })).rejects.toMatchObject({ code: 'SYNCLIP_VIDEO_REQUEST_INVALID', outcome: 'invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not retry an uncertain provider response', async () => {
    const fetcher = vi.fn(async () => new Response(apiKey + ': private provider details', { status: 429 }));
    const error = await new SynclipVideoClient({ apiKey, fetch: fetcher }).create({ prompt: 'x', model: 'ltx23', duration: 5, resolution: '720p' }).catch(error => error);
    expect(error).toMatchObject({ code: 'SYNCLIP_VIDEO_HTTP_FAILED', outcome: 'uncertain' }); expect(String(error)).not.toContain(apiKey); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('downloads only an https public result through pinned DNS', async () => {
    const resolve = vi.fn(async () => [{ address: '93.184.215.14', family: 4 }]);
    const request = vi.fn((_url: URL, _options: unknown, callback: (response: IncomingMessage) => void) => {
      const outgoing = new EventEmitter() as ClientRequest; const incoming = new PassThrough() as unknown as IncomingMessage;
      incoming.statusCode = 200; incoming.headers = { 'content-type': 'video/mp4', 'content-length': String(mp4.length) };
      outgoing.destroy = vi.fn(() => { incoming.destroy(); return outgoing; });
      queueMicrotask(() => { callback(incoming); (incoming as unknown as PassThrough).end(mp4); }); return outgoing;
    });
    await expect(downloadSynclipVideo(completed(), { resolve, request })).resolves.toEqual(mp4);
    expect(resolve).toHaveBeenCalledWith('cdn.synclip.ai');
    await expect(downloadSynclipVideo(completed('http://cdn.synclip.ai/video.mp4'), { resolve, request })).rejects.toThrow();
  });
});

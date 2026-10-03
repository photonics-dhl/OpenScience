import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { SynclipImageClient, downloadSynclipImage } from '../src/synclip-image-api';

const taskId = 'remote-image-123';
const apiKey = 'test-only-key';
const original = readFileSync(new URL('./fixtures/minimax-reference.png', import.meta.url));
const completed = (url = 'https://cdn.synclip.ai/image.png?signature=private') => ({ task_id: taskId,
  status: 'completed' as const, output: { type: 'image', url, watermarked: false }, url_expires_at: '2099-01-01T00:00:00.000Z' });
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), {
  status, headers: { 'content-type': 'application/json' },
});

describe('Synclip fixed image API', () => {
  it('submits exactly one text-only gpt-image-2 request to the fixed origin', async () => {
    const fetcher = vi.fn(async () => response({ task_id: taskId, status: 'processing' }));
    const client = new SynclipImageClient({ apiKey, fetch: fetcher });
    await expect(client.create('Preserve the exact scientific labels.')).resolves.toEqual({ task_id: taskId, status: 'processing' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.synclip.ai/v1/image');
    expect(init.method).toBe('POST'); expect(init.redirect).toBe('error');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${apiKey}` });
    expect(JSON.parse(String(init.body))).toEqual({ prompt: 'Preserve the exact scientific labels.', model: 'gpt-image-2', aspectRatio: '16:9' });
  });
  it('queries only the saved ID and checks the response identity', async () => {
    const fetcher = vi.fn(async () => response(completed()));
    const client = new SynclipImageClient({ apiKey, fetch: fetcher });
    await expect(client.query(taskId)).resolves.toEqual(completed());
    expect(fetcher.mock.calls[0]).toMatchObject(['https://api.synclip.ai/v1/tasks/remote-image-123', { method: 'GET' }]);
    fetcher.mockImplementation(async () => response({ ...completed(), task_id: 'another-task' }));
    await expect(client.query(taskId)).rejects.toMatchObject({ code: 'SYNCLIP_RESPONSE_INVALID' });
  });
  it.each(['queued', 'processing', 'failed'])('accepts actual %s status without inventing a completed image', async status => {
    const fetcher = vi.fn(async () => response({ task_id: taskId, status }));
    await expect(new SynclipImageClient({ apiKey, fetch: fetcher }).query(taskId)).resolves.toEqual({ task_id: taskId, status });
  });
  it.each([408, 429, 500])('does not retry uncertain HTTP %s or expose response text', async status => {
    const fetcher = vi.fn(async () => new Response(`${apiKey}: private upstream details`, { status }));
    const error = await new SynclipImageClient({ apiKey, fetch: fetcher }).create('Bound prompt').catch(error => error);
    expect(error).toMatchObject({ code: 'SYNCLIP_HTTP_FAILED', outcome: 'uncertain' });
    expect(String(error)).not.toContain(apiKey); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('aborts a stalled POST once, preserving uncertainty', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    await expect(new SynclipImageClient({ apiKey, fetch: fetcher, timeoutMs: 5 }).create('Bound prompt'))
      .rejects.toMatchObject({ code: 'SYNCLIP_TIMEOUT', outcome: 'uncertain' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
  });
  it.each(['', ' ', 'x'.repeat(16 * 1024)])('refuses invalid or oversized prompt before any POST', async prompt => {
    const fetcher = vi.fn();
    await expect(new SynclipImageClient({ apiKey, fetch: fetcher }).create(prompt)).rejects.toMatchObject({ code: 'SYNCLIP_REQUEST_INVALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['../image', 'remote/id', ''])('refuses invalid task ID %s before GET', async id => {
    const fetcher = vi.fn();
    await expect(new SynclipImageClient({ apiKey, fetch: fetcher }).query(id)).rejects.toMatchObject({ code: 'SYNCLIP_TASK_ID_INVALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects redirect, oversized JSON and invalid completed payloads', async () => {
    for (const reply of [new Response(null, { status: 302, headers: { location: 'https://other.invalid' } }),
      new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
      response({ task_id: taskId, status: 'completed' }), response({ ...completed(), url_expires_at: 'bad' })]) {
      const fetcher = vi.fn(async () => reply);
      await expect(new SynclipImageClient({ apiKey, fetch: fetcher }).query(taskId)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});

function transport(options: { status?: number; body?: Buffer; headers?: Record<string, string>; hang?: boolean } = {}) {
  const resolve = vi.fn(async () => [{ address: '93.184.215.14', family: 4 }]);
  const request = vi.fn((_url: URL, _options: unknown, callback: (response: IncomingMessage) => void) => {
    const outgoing = new EventEmitter() as ClientRequest;
    const incoming = new PassThrough() as unknown as IncomingMessage;
    incoming.statusCode = options.status ?? 200;
    incoming.headers = options.headers ?? { 'content-type': 'image/png' };
    outgoing.destroy = vi.fn(() => { incoming.destroy(); return outgoing; });
    queueMicrotask(() => { callback(incoming); if (!options.hang) (incoming as unknown as PassThrough).end(options.body ?? original); });
    return outgoing;
  });
  return { resolve, request };
}
describe('Synclip result download', () => {
  it('downloads an original through pinned public DNS without an API credential', async () => {
    const mock = transport();
    await expect(downloadSynclipImage(completed(), mock)).resolves.toEqual(original);
    const options = mock.request.mock.calls[0][1] as { headers: unknown; agent: boolean;
      lookup: (hostname: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void };
    expect(options.headers).toEqual({ Accept: 'image/png,image/jpeg,image/webp,application/octet-stream' });
    expect(options.agent).toBe(false);
    const resolved = vi.fn(); options.lookup('cdn.synclip.ai', {}, resolved);
    expect(resolved).toHaveBeenCalledWith(null, '93.184.215.14', 4);
  });
  it.each(['http://cdn.synclip.ai/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://u:p@cdn.synclip.ai/a'])('rejects unsafe URL %s', async url => {
    const mock = transport(); await expect(downloadSynclipImage(completed(url), mock)).rejects.toThrow();
    expect(mock.request).not.toHaveBeenCalled(); expect(mock.resolve).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS, expired results and unfinished tasks', async () => {
    const mock = transport(); mock.resolve.mockResolvedValue([{ address: '93.184.215.14', family: 4 }, { address: '169.254.169.254', family: 4 }]);
    await expect(downloadSynclipImage(completed(), mock)).rejects.toThrow(); expect(mock.request).not.toHaveBeenCalled();
    await expect(downloadSynclipImage({ ...completed(), url_expires_at: '2000-01-01T00:00:00.000Z' }, mock)).rejects.toThrow();
    await expect(downloadSynclipImage({ task_id: taskId, status: 'processing' }, mock)).rejects.toThrow();
  });
  it('rejects redirects, invalid image bytes, oversized bodies and stalled download', async () => {
    for (const mock of [transport({ status: 302 }), transport({ body: Buffer.from('not an image') }),
      transport({ headers: { 'content-type': 'image/png', 'content-length': String(31 * 1024 * 1024) } })]) {
      await expect(downloadSynclipImage(completed(), mock)).rejects.toThrow(); expect(mock.request).toHaveBeenCalledTimes(1);
    }
    await expect(downloadSynclipImage(completed(), { ...transport({ hang: true }), timeoutMs: 5 })).rejects.toMatchObject({ code: 'SYNCLIP_TIMEOUT' });
  });
});

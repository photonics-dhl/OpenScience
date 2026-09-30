import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MiniMaxVideoClient, MiniMaxVideoError, validateMiniMaxVideoBaseUrl } from '../src/minimax-video';

const request = {
  model: 'MiniMax-H3',
  content: [{ type: 'text', text: 'Public promotional concept with Mandarin narration.' }],
  resolution: '768P', duration: 10, ratio: '16:9',
};

describe('bounded MiniMax video gateway', () => {
  it('sends exactly one authorized V2 create request without redirects or retry', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ task_id: 'task-123' }));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    expect(await client.create(request)).toEqual({ task_id: 'task-123' });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('https://api.minimax.cn/v2/video_generation');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(init?.body).toBe(JSON.stringify(request));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-only-key');
  });

  it.each([
    { duration: 15 }, { model: 'MiniMax-H3-Max' }, { ratio: '9:16' }, { resolution: '2K' },
    { content: [{ type: 'text', text: '' }] }, { callback_url: 'https://example.com' },
    { content: [{ type: 'text', text: 'a'.repeat(40000) }] },
  ])('refuses an out-of-scope request before transport: %j', async change => {
    const transport = vi.fn<typeof fetch>();
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    await expect(client.create({ ...request, ...change })).rejects.toMatchObject({ code: 'VIDEO_REQUEST_INVALID', outcome: 'invalid' });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(['http://api.minimax.cn', 'https://evil.example', 'https://api.minimax.cn/redirect', 'https://user@api.minimax.cn',
    'https://api.minimax.cn/?key=x', 'https://api.minimax.cn/#x'])('rejects an altered API origin: %s', baseUrl => {
    expect(() => validateMiniMaxVideoBaseUrl(baseUrl)).toThrow('VIDEO_CONFIG_INVALID');
  });

  it.each([400, 401, 402, 403, 422, 429])('preserves a definitive HTTP %s rejection without leaking response content', async status => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { type: 'insufficient_balance_error', message: 'private provider body' } }, { status }));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    const error = await client.create(request).catch(value => value);
    expect(error).toBeInstanceOf(MiniMaxVideoError);
    expect(error).toMatchObject({ outcome: 'rejected', httpStatus: status, providerCode: 'insufficient_balance_error' });
    expect(String(error) + JSON.stringify(error)).not.toContain('private provider body');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([408, 500, 502, 503])('treats HTTP %s as uncertain with no automatic retry', async status => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('private error', { status }));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    await expect(client.create(request)).rejects.toMatchObject({ outcome: 'uncertain', httpStatus: status });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { task_id: 123 }, { task_id: '../other' }, { task_id: 'ok', error: { message: 'secret' } }])('rejects a malformed create receipt: %j', async receipt => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(receipt));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    await expect(client.create(request)).rejects.toMatchObject({ outcome: 'uncertain', code: 'VIDEO_RESPONSE_INVALID' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('bounds both declared and chunked response size', async () => {
    for (const response of [
      new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '70000' } }),
      new Response(JSON.stringify({ task_id: 'x'.repeat(70000) }), { headers: { 'content-type': 'application/json' } }),
    ]) {
      const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: vi.fn<typeof fetch>().mockResolvedValue(response) });
      await expect(client.create(request)).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_TOO_LARGE', outcome: 'uncertain' });
    }
  });

  it('aborts stalled network calls and does not reuse or expose the key', async () => {
    let signal: AbortSignal | null | undefined;
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      signal = options?.signal; return new Promise<Response>(() => {});
    });
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', timeoutMs: 5, fetch: transport });
    await expect(client.create(request)).rejects.toMatchObject({ code: 'VIDEO_TIMEOUT', outcome: 'uncertain' });
    expect(signal?.aborted).toBe(true); expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(client)).not.toContain('test-only-key');
  });

  it('rejects redirects and non-JSON content without following or retrying', async () => {
    for (const response of [new Response(null, { status: 302, headers: { location: 'https://evil.example' } }), new Response('<html>secret</html>')]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
      await expect(client.create(request)).rejects.toMatchObject({ outcome: 'uncertain' });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  const task = { id: 'pilot-123', model: 'MiniMax-H3', status: 'running', content: {}, duration: 10, resolution: '768P', ratio: '16:9' };
  it.each(['queued', 'running', 'failed', 'cancelled', 'succeeded'])('queries the saved task as %s with GET only', async status => {
    const value = { ...task, status, content: status === 'succeeded' ? { url: 'https://cdn.hailuoai.com/output.mp4' } : {}, privatePrompt: 'discard me' };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ task: value }));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    const result = await client.query('pilot-123');
    expect(result.status).toBe(status); expect(result).not.toHaveProperty('privatePrompt');
    expect(transport.mock.calls[0][0]).toBe('https://api.minimax.cn/v2/query/video_generation/pilot-123');
    expect(transport.mock.calls[0][1]?.method).toBe('GET'); expect(transport.mock.calls[0][1]?.body).toBeUndefined();
  });

  it.each([{ id: 'other' }, { model: 'MiniMax-H3-Max' }, { duration: 15 }, { status: 'unrecognized' },
    { status: 'succeeded', content: {} }, { status: 'succeeded', content: { url: 'http://127.0.0.1/private' } }])('rejects a mismatched or malformed task: %j', async change => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ task: { ...task, ...change } }));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    await expect(client.query('pilot-123')).rejects.toMatchObject({ outcome: 'uncertain', code: 'VIDEO_RESPONSE_INVALID' });
  });
});

describe('explicit paper-reference video mode', () => {
  const png = readFileSync(new URL('./fixtures/minimax-reference.png', import.meta.url));
  const paper = {
    ...request, resolution: '2K', duration: 15,
    content: [request.content[0], { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` }, role: 'reference_image' }],
  };
  it('submits the original reference once only after explicit paper opt-in', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ task_id: 'paper-hook' }));
    const legacy = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', fetch: transport });
    await expect(legacy.create(paper)).rejects.toMatchObject({ code: 'VIDEO_REQUEST_INVALID' });
    expect(transport).not.toHaveBeenCalled();
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', mode: 'paper', fetch: transport });
    expect(await client.create(paper)).toEqual({ task_id: 'paper-hook' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.body).toBe(JSON.stringify(paper));
  });
  it.each(['https://example.com/reference.png', 'data:image/png;base64,bm90LXBuZw=='])('rejects invalid reference %s before transport', async url => {
    const transport = vi.fn<typeof fetch>();
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', mode: 'paper', fetch: transport });
    await expect(client.create({ ...paper, content: [paper.content[0], { ...paper.content[1], image_url: { url } }] })).rejects.toMatchObject({ code: 'VIDEO_REQUEST_INVALID' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('matches paper task parameters and rejects legacy or different identities', async () => {
    const task = { id: 'paper-hook', model: 'MiniMax-H3', status: 'running', content: {}, resolution: '2K', duration: 15, ratio: '16:9' };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ task }));
    const client = new MiniMaxVideoClient({ baseUrl: 'https://api.minimax.cn', apiKey: 'test-only-key', mode: 'paper', fetch: transport });
    expect(await client.query('paper-hook')).toEqual(task);
    for (const change of [{ id: 'other' }, { duration: 10 }, { resolution: '768P' }]) {
      transport.mockResolvedValueOnce(Response.json({ task: { ...task, ...change } }));
      await expect(client.query('paper-hook')).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    }
  });
});

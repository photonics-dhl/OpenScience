import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { downloadMiniMaxVideo, type MiniMaxVideoDownloadRequestOptions } from '../src/minimax-video-download.js';
import type { MiniMaxVideoTask } from '../src/minimax-video.js';

// 16x16 H.264 fixture generated and fully decoded with the existing media runtime.
const bytes = readFileSync(new URL('./fixtures/minimax-video-sample.mp4', import.meta.url));
const task = (url = 'https://media.example.com/movie.mp4?signature=private-signature'): MiniMaxVideoTask => ({
  id: 'pilot-123', model: 'MiniMax-H3', status: 'succeeded', content: { url },
  resolution: '768P', duration: 10, ratio: '16:9',
});

function transport(options: {
  status?: number; headers?: Record<string, string>; body?: Buffer;
  hang?: boolean; aborted?: boolean; networkError?: boolean;
} = {}) {
  const resolve = vi.fn(async () => [{ address: '93.184.215.14', family: 4 }]);
  const request = vi.fn((_url: URL, _options: MiniMaxVideoDownloadRequestOptions, callback: (response: IncomingMessage) => void) => {
    const outgoing = new EventEmitter() as ClientRequest;
    const response = new PassThrough() as unknown as IncomingMessage;
    response.statusCode = options.status ?? 200;
    response.headers = options.headers ?? { 'content-type': 'video/mp4' };
    outgoing.destroy = vi.fn(() => { response.destroy(); return outgoing; });
    queueMicrotask(() => {
      if (options.networkError) {
        outgoing.emit('error', new Error('https://media.example.com/?signature=private-signature'));
        return;
      }
      callback(response);
      if (options.aborted) response.emit('aborted');
      else if (!options.hang) (response as unknown as PassThrough).end(options.body ?? bytes);
    });
    return outgoing;
  });
  return { resolve, request };
}

describe('saved MiniMax video download', () => {
  it('downloads paper output only with explicit mode and does not relax legacy validation', async () => {
    const input: MiniMaxVideoTask = { ...task(), resolution: '2K', duration: 15 };
    const mock = transport();
    await expect(downloadMiniMaxVideo(input, mock)).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    expect(mock.resolve).not.toHaveBeenCalled();
    await expect(downloadMiniMaxVideo(input, { ...mock, mode: 'paper' })).resolves.toEqual(bytes);
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
  it('returns complete MP4 bytes without sending API credentials', async () => {
    const mock = transport();
    await expect(downloadMiniMaxVideo(task(), mock)).resolves.toEqual(bytes);
    expect(mock.request).toHaveBeenCalledTimes(1);
    const options = mock.request.mock.calls[0][1];
    expect(options.headers).toEqual({ Accept: 'video/mp4,application/octet-stream' });
    expect(options.family).toBe(4);
    expect(options.autoSelectFamily).toBe(false);
    expect(options.agent).toBe(false);
    const resolved = vi.fn();
    options.lookup?.('media.example.com', {}, resolved);
    expect(resolved).toHaveBeenCalledWith(null, '93.184.215.14', 4);
  });

  it.each([
    'http://media.example.com/movie.mp4', 'https://127.0.0.1/movie.mp4',
    'https://[::1]/movie.mp4', 'https://media.example.com:8443/movie.mp4',
    'https://user:password@media.example.com/movie.mp4',
  ])('rejects unsafe URL %s before networking', async url => {
    const mock = transport();
    await expect(downloadMiniMaxVideo(task(url), mock)).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    expect(mock.resolve).not.toHaveBeenCalled();
    expect(mock.request).not.toHaveBeenCalled();
  });

  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.100.100.200', '192.168.1.1', '172.16.0.1', '0.0.0.0', '224.0.0.1'])(
    'rejects a private or reserved DNS result %s', async address => {
    const mock = transport();
    mock.resolve.mockResolvedValue([{ address, family: 4 }]);
    await expect(downloadMiniMaxVideo(task(), mock)).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    expect(mock.request).not.toHaveBeenCalled();
    });

  it('rejects mixed public and private DNS answers', async () => {
    const mock = transport();
    mock.resolve.mockResolvedValue([{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    await expect(downloadMiniMaxVideo(task(), mock)).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    expect(mock.request).not.toHaveBeenCalled();
  });

  it('does not download a nonterminal task', async () => {
    const mock = transport();
    await expect(downloadMiniMaxVideo({ ...task(), status: 'running', content: {} }, mock))
      .rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    expect(mock.resolve).not.toHaveBeenCalled();
  });

  it('does not follow redirects', async () => {
    const mock = transport({ status: 302, headers: { location: 'https://127.0.0.1/secret' } });
    await expect(downloadMiniMaxVideo(task(), mock)).rejects.toMatchObject({ code: 'VIDEO_HTTP_FAILED', httpStatus: 302 });
    expect(mock.request).toHaveBeenCalledTimes(1);
  });

  it('limits streaming downloads without content-length', async () => {
    await expect(downloadMiniMaxVideo(task(), { ...transport(), maxBytes: 12 }))
      .rejects.toMatchObject({ code: 'VIDEO_RESPONSE_TOO_LARGE' });
  });

  it('rejects an oversized declared response', async () => {
    await expect(downloadMiniMaxVideo(task(), {
      ...transport({ headers: { 'content-type': 'video/mp4', 'content-length': '1000000000' } }),
    })).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_TOO_LARGE' });
  });

  it('rejects a truncated response rather than returning a partial movie', async () => {
    await expect(downloadMiniMaxVideo(task(), transport({ headers: {
      'content-type': 'video/mp4', 'content-length': String(bytes.length + 1),
    } }))).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
  });

  it.each([false, true])('rejects a truncated MP4 even with a consistent HTTP length (%s)', async declared => {
    const truncated = bytes.subarray(0, bytes.length - 2);
    await expect(downloadMiniMaxVideo(task(), transport({ body: truncated, headers: {
      'content-type': 'video/mp4', ...(declared ? { 'content-length': String(truncated.length) } : {}),
    } }))).rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
  });

  it('rejects an impossible box length despite a matching ftyp signature', async () => {
    const malformed = Buffer.from(bytes);
    malformed.writeUInt32BE(bytes.length + 8, 0);
    await expect(downloadMiniMaxVideo(task(), transport({ body: malformed })))
      .rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
  });

  it('rejects ftyp without a movie and media payload', async () => {
    await expect(downloadMiniMaxVideo(task(), transport({ body: bytes.subarray(0, bytes.readUInt32BE(0)) })))
      .rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
  });

  it('rejects HTML or non-MP4 content', async () => {
    await expect(downloadMiniMaxVideo(task(), transport({ body: Buffer.from('<html>expired</html>') })))
      .rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
    await expect(downloadMiniMaxVideo(task(), transport({ headers: { 'content-type': 'text/html' } })))
      .rejects.toMatchObject({ code: 'VIDEO_RESPONSE_INVALID' });
  });

  it('rejects an aborted stream', async () => {
    await expect(downloadMiniMaxVideo(task(), transport({ aborted: true })))
      .rejects.toMatchObject({ code: 'VIDEO_NETWORK_FAILED' });
  });

  it('bounds DNS resolution and streaming by the same deadline', async () => {
    await expect(downloadMiniMaxVideo(task(), {
      ...transport(), resolve: () => new Promise(() => {}), timeoutMs: 10,
    })).rejects.toMatchObject({ code: 'VIDEO_TIMEOUT' });
    const hung = transport({ hang: true });
    await expect(downloadMiniMaxVideo(task(), { ...hung, timeoutMs: 10 }))
      .rejects.toMatchObject({ code: 'VIDEO_TIMEOUT' });
    expect(hung.request.mock.results[0].value.destroy).toHaveBeenCalled();
  });

  it('does not expose a signed URL in transport errors', async () => {
    await expect(downloadMiniMaxVideo(task(), transport({ networkError: true })))
      .rejects.toMatchObject({ message: 'VIDEO_NETWORK_FAILED', code: 'VIDEO_NETWORK_FAILED' });
  });
});

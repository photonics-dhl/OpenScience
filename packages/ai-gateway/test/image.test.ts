import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { AiGateway } from '../src/gateway';
import { MiniMaxImageProvider } from '../src/image';

function pngChunk(type: string, payload: Buffer): Buffer {
  const data = Buffer.concat([Buffer.from(type), payload]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length);
  data.copy(chunk, 4);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}
function makePng(width = 1280, height = 720, inflatedBytes?: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.alloc(inflatedBytes ?? (width * 4 + 1) * height))), pngChunk('IEND', Buffer.alloc(0))]);
}
const png = makePng();
const config = { baseUrl: 'https://api.minimax.io', apiKey: 'secret-key', model: 'image-01' };
const response = (images: string[] = [png.toString('base64')]) => new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { image_base64: images } }));
describe('bounded scene image provider', () => {
  it('rejects blank keys and trims the transmitted credential', async () => {
    expect(() => new MiniMaxImageProvider('image', { ...config, apiKey: '   ' })).toThrow();
    const fetcher = vi.fn(async () => response());
    await new MiniMaxImageProvider('image', { ...config, apiKey: ' secret-key \n' }, fetcher).generate({ prompt: 'scene' });
    expect(fetcher.mock.calls[0]).toMatchObject([expect.any(String), { headers: { Authorization: 'Bearer secret-key' } }]);
  });
  it.each([[640, 360], [1280, 721], [1, 1]])('rejects non-target dimensions %ix%i', async (width, height) => {
    await expect(new MiniMaxImageProvider('image', config, async () => response([makePng(width, height).toString('base64')])).generate({ prompt: 'scene' })).rejects.toThrow();
  });
  it('rejects PNG inflation exceeding the target raster budget', async () => {
    await expect(new MiniMaxImageProvider('image', config, async () => response([makePng(1280, 720, 8 * 1024 * 1024 + 1).toString('base64')])).generate({ prompt: 'scene' })).rejects.toThrow();
  });
  it('rejects nonofficial origins and invalid dimensions', async () => {
    expect(() => new MiniMaxImageProvider('image', { ...config, baseUrl: 'https://evil.test' })).toThrow();
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(4097, 16);
    await expect(new MiniMaxImageProvider('image', config, async () => response([oversized.toString('base64')])).generate({ prompt: 'scene' })).rejects.toThrow();
  });
  it('times out a stalled paid request without retry', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(() => new Promise<Response>(() => {}));
      const pending = new MiniMaxImageProvider('image', config, fetcher).generate({ prompt: 'scene' });
      const rejected = expect(pending).rejects.toThrow('image generation failed');
      await vi.advanceTimersByTimeAsync(120_000);
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('returns hashed metadata after success even when auditing fails', async () => {
    const generate = vi.fn(async () => ({ bytes: png, contentType: 'image/png' as const }));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const gateway = new AiGateway({ providers: [{ name: 'text', model: 'text', complete: vi.fn() }], imageProviders: [{ name: 'image', model: 'image-01', generate }], killSwitch: { isEnabled: () => ({ enabled: true }) }, logger, audit: { record: async () => { throw new Error('secret-key'); } } });
    expect(await gateway.generateImage({ prompt: 'scene' })).toMatchObject({ bytes: png, contentType: 'image/png', model: 'image-01', provider: 'image', promptHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret-key');
  });
  it('sends one exact base64 request and returns validated bytes', async () => {
    const fetcher = vi.fn(async () => response());
    const provider = new MiniMaxImageProvider('minimax-image', config, fetcher);
    expect(await provider.generate({ prompt: 'A scene' })).toEqual({ bytes: png, contentType: 'image/png' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toMatchObject(['https://api.minimax.io/v1/image_generation', { redirect: 'error', body: JSON.stringify({ model: 'image-01', prompt: 'A scene', aspect_ratio: '16:9', n: 1, response_format: 'base64', prompt_optimizer: false }) }]);
  });
  it.each([[], ['AAAA'], [png.toString('base64'), png.toString('base64')], [png.subarray(0, 24).toString('base64')]].map(images => ({ images })))('rejects invalid image result $images', async ({ images }) => {
    await expect(new MiniMaxImageProvider('minimax-image', config, async () => response(images)).generate({ prompt: 'scene' })).rejects.toThrow('image generation failed');
  });
  it('rejects oversized prompts before payment and does not fetch URLs', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { image_urls: ['https://evil.test'] } })));
    const provider = new MiniMaxImageProvider('minimax-image', config, fetcher);
    await expect(provider.generate({ prompt: 'x'.repeat(1501) })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(provider.generate({ prompt: 'scene' })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('cancels an oversized response before JSON parsing', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(15 * 1024 * 1024)); }, cancel });
    await expect(new MiniMaxImageProvider('minimax-image', config, async () => new Response(body)).generate({ prompt: 'scene' })).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it('honors kill switch, never retries or falls back, and audits metadata only', async () => {
    const generate = vi.fn(async () => { throw new Error('secret-key scene provider-response'); });
    const fallback = vi.fn();
    const record = vi.fn();
    const isEnabled = vi.fn(() => ({ enabled: false }));
    const gateway = new AiGateway({ providers: [{ name: 'text', model: 'text', complete: vi.fn() }], imageProviders: [{ name: 'image', model: 'image-01', generate }, { name: 'fallback', model: 'image-01', generate: fallback }], killSwitch: { isEnabled }, audit: { record } });
    await expect(gateway.generateImage({ prompt: 'scene' })).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    isEnabled.mockReturnValue({ enabled: true });
    await expect(gateway.generateImage({ prompt: 'scene' })).rejects.toThrow('image generation failed');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(isEnabled).toHaveBeenCalledWith('image', 'image');
    expect(record.mock.calls[0][0].metadata).toMatchObject({ operation: 'image', actualCostUsdMicros: null, inputTokens: null, retryCount: 0, error: 'image_provider_failed' });
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/secret-key|provider-response|"scene"/);
  });
});

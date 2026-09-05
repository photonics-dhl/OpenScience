import { inflateSync } from 'node:zlib';
import { AiGatewayError } from './errors';
import { encodedImageDimensions, type OcrMediaType } from './ocr';

export interface ImageRequest { prompt: string }
export interface ImageProviderResult { bytes: Buffer; contentType: OcrMediaType }
export interface ImageResult extends ImageProviderResult { model: string; provider: string; promptHash: string }
export interface ImageProvider { readonly name: string; readonly model: string; generate(request: ImageRequest): Promise<ImageProviderResult> }
export interface MiniMaxImageConfig { baseUrl: string; apiKey: string; model: string }
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 * 1024;
const failed = () => new AiGatewayError('IMAGE_PROVIDER_FAILED', 'image generation failed');

export function validateImageRequest(request: ImageRequest): string {
  if (!request || typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 1500) {
    throw new AiGatewayError('IMAGE_REQUEST_INVALID', 'image prompt must contain 1 to 1500 characters');
  }
  return request.prompt;
}

/** Validate containers and PNG scanlines, not full JPEG/WebP entropy decoding.
 * Browser decoding remains part of controlled acceptance; never trust declared MIME types. */
export function validateImageBytes(input: Uint8Array): ImageProviderResult {
  if (!(input instanceof Uint8Array) || !input.byteLength || input.byteLength > MAX_IMAGE_BYTES) throw failed();
  const bytes = Buffer.from(input);
  const contentType: OcrMediaType = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : 'image/webp';
  try {
    const { width, height } = encodedImageDimensions(contentType, bytes);
    if (width !== 1280 || height !== 720) throw failed();
    if (contentType === 'image/png') {
      if (bytes.length < 33 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) throw failed();
      const depth = bytes[24];
      const color = bytes[25];
      const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(color);
      const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
      if (!channels || !depths.includes(depth)) throw failed();
      let offset = 8;
      const data: Buffer[] = [];
      let ended = false;
      while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (offset + length + 12 > bytes.length) throw failed();
        if (type === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += length + 12;
        if (type === 'IEND') { if (length !== 0) throw failed(); ended = true; break; }
      }
      if (!ended || offset !== bytes.length || !data.length) throw failed();
      // Bounded inflation also rejects truncated/corrupt image data and decompression bombs.
      // 1280x720 RGBA16 plus Adam7 scanline prefixes fits below 8 MiB.
      const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: 8 * 1024 * 1024 });
      const passes = bytes[28] === 0 ? [[0, 0, 1, 1]] : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
      let decodedOffset = 0;
      for (const [x, y, dx, dy] of passes) {
        const passWidth = Math.max(0, Math.ceil((width - x) / dx));
        const passHeight = Math.max(0, Math.ceil((height - y) / dy));
        if (!passWidth) continue;
        const stride = 1 + Math.ceil(passWidth * channels * depth / 8);
        for (let row = 0; row < passHeight; row++) {
          if (decodedOffset >= decoded.length || decoded[decodedOffset] > 4) throw failed();
          decodedOffset += stride;
        }
      }
      if (decodedOffset !== decoded.length) throw failed();
    } else if (contentType === 'image/jpeg') {
      let offset = 2;
      let scan = false;
      let ended = false;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) throw failed();
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xd9) { ended = true; break; }
        if (offset + 2 > bytes.length) throw failed();
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) throw failed();
        if (marker === 0xda) {
          if (length < 6 || length !== 6 + 2 * bytes[offset + 2]) throw failed();
          scan = true;
          offset += length;
          const start = offset;
          while (offset < bytes.length) {
            if (bytes[offset] !== 0xff) { offset++; continue; }
            if (bytes[offset + 1] === 0 || (bytes[offset + 1] >= 0xd0 && bytes[offset + 1] <= 0xd7)) { offset += 2; continue; }
            break;
          }
          if (offset === start) throw failed();
        } else { offset += length; }
      }
      if (!scan || !ended || offset !== bytes.length) throw failed();
    } else {
      let offset = 12;
      let image = false;
      while (offset + 8 <= bytes.length) {
        const type = bytes.toString('ascii', offset, offset + 4);
        const length = bytes.readUInt32LE(offset + 4);
        if (length < 1 || offset + 8 + length > bytes.length) throw failed();
        if (type === 'VP8 ' || type === 'VP8L') {
          if (image || length <= (type === 'VP8 ' ? 10 : 5)) throw failed();
          const frame = Buffer.concat([bytes.subarray(0, 12), bytes.subarray(offset, offset + 8 + length + length % 2)]);
          frame.writeUInt32LE(frame.length - 8, 4);
          const dimensions = encodedImageDimensions('image/webp', frame);
          if (dimensions.width !== width || dimensions.height !== height) throw failed();
          image = true;
        }
        offset += 8 + length + (length % 2);
      }
      if (!image || offset !== bytes.length) throw failed();
    }
    return { bytes, contentType };
  } catch { throw failed(); }
}

export class MiniMaxImageProvider implements ImageProvider {
  readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  constructor(readonly name: string, config: MiniMaxImageConfig, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(config.baseUrl);
    if (!['https://api.minimax.io', 'https://api.minimaxi.com'].includes(url.origin) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || config.model !== 'image-01' || !config.apiKey.trim()) throw new AiGatewayError('NO_PROVIDER_CONFIG', 'invalid image provider configuration');
    this.apiKey = config.apiKey.trim();
    this.model = config.model;
    this.endpoint = `${url.origin}/v1/image_generation`;
  }

  async generate(request: ImageRequest): Promise<ImageProviderResult> {
    const prompt = validateImageRequest(request);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(failed()); }, 120_000); });
    try {
      return await Promise.race([this.request(prompt, controller.signal), timeout]);
    } catch { throw failed(); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  private async request(prompt: string, signal: AbortSignal): Promise<ImageProviderResult> {
    const response = await this.fetcher(this.endpoint, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, prompt, aspect_ratio: '16:9', n: 1, response_format: 'base64', prompt_optimizer: false }),
    });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) { await response.body?.cancel(); throw failed(); }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw failed();
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value?.base_resp?.status_code !== 0 || !Array.isArray(value?.data?.image_base64) || value.data.image_base64.length !== 1) throw failed();
    const encoded = value.data.image_base64[0];
    if (typeof encoded !== 'string' || !encoded.length || encoded.length % 4 !== 0 || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(encoded)) throw failed();
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw failed();
    return validateImageBytes(bytes);
  }
}

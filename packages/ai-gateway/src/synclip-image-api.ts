import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { get, type RequestOptions } from 'node:https';
import { BlockList, isIP, type TcpSocketConnectOpts } from 'node:net';
import { CODEX_IMAGE_MAX_JSON_BYTES } from './codex-image-protocol';
import { encodedImageDimensions } from './ocr';

export const SYNCLIP_IMAGE_ORIGIN = 'https://api.synclip.ai/v1';
export const SYNCLIP_IMAGE_MODEL = 'gpt-image-2';
export const SYNCLIP_IMAGE_MAX_BYTES = 30 * 1024 * 1024;
export interface SynclipImageTask {
  task_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  output?: { type: 'image'; url: string; watermarked?: boolean };
  url_expires_at?: string;
}
type ErrorCode = 'SYNCLIP_CONFIG_INVALID' | 'SYNCLIP_REQUEST_INVALID' | 'SYNCLIP_TASK_ID_INVALID'
  | 'SYNCLIP_RESPONSE_INVALID' | 'SYNCLIP_RESPONSE_TOO_LARGE' | 'SYNCLIP_HTTP_FAILED' | 'SYNCLIP_TIMEOUT' | 'SYNCLIP_NETWORK_FAILED';
/** Never carries upstream bodies, signed URLs, credentials, or a raw cause. */
export class SynclipImageError extends Error {
  constructor(readonly code: ErrorCode, readonly outcome: 'invalid' | 'uncertain' = 'uncertain', readonly httpStatus?: number) {
    super(code); this.name = 'SynclipImageError';
  }
}
const invalid = () => new SynclipImageError('SYNCLIP_RESPONSE_INVALID');
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validateSynclipTaskId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/u.test(value))
    throw new SynclipImageError('SYNCLIP_TASK_ID_INVALID', 'invalid');
  return value;
}
function outputUrl(value: unknown): URL {
  try {
    if (typeof value !== 'string' || value.length > 8192) throw invalid();
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || isIP(url.hostname.replace(/^\[|\]$/gu, ''))) throw invalid();
    return url;
  } catch { throw invalid(); }
}
export function validateSynclipImageTask(value: unknown, expectedId: string): SynclipImageTask {
  if (!record(value) || value.task_id !== validateSynclipTaskId(expectedId)
    || !['queued', 'processing', 'completed', 'failed'].includes(String(value.status))) throw invalid();
  const result: SynclipImageTask = { task_id: expectedId, status: value.status as SynclipImageTask['status'] };
  if (result.status === 'completed') {
    const output = value.output;
    if (!record(output) || output.type !== 'image' || typeof value.url_expires_at !== 'string'
      || !Number.isFinite(Date.parse(value.url_expires_at))
      || (output.watermarked !== undefined && typeof output.watermarked !== 'boolean')) throw invalid();
    outputUrl(output.url);
    result.output = { type: 'image', url: output.url as string,
      ...(typeof output.watermarked === 'boolean' ? { watermarked: output.watermarked } : {}) };
    result.url_expires_at = value.url_expires_at;
  }
  return result;
}
async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 65536)) {
    void response.body?.cancel().catch(() => {});
    throw new SynclipImageError('SYNCLIP_RESPONSE_TOO_LARGE');
  }
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '') || !response.body) throw invalid();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { void reader.cancel().catch(() => {}); throw new SynclipImageError('SYNCLIP_RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { reader.releaseLock(); }
}
export interface SynclipImageClientConfig { apiKey: string; timeoutMs?: number; fetch?: typeof fetch }
/** One POST or one GET per method. Durable submission ownership belongs to the host transport. */
export class SynclipImageClient {
  readonly #apiKey: string; readonly #fetch: typeof fetch; readonly #timeoutMs: number;
  constructor(config: SynclipImageClientConfig) {
    if (typeof config?.apiKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(config.apiKey)
      || (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 30000)))
      throw new SynclipImageError('SYNCLIP_CONFIG_INVALID', 'invalid');
    this.#apiKey = config.apiKey; this.#fetch = config.fetch ?? globalThis.fetch; this.#timeoutMs = config.timeoutMs ?? 15000;
  }
  async #request(method: 'POST' | 'GET', path: string, body?: string): Promise<Record<string, unknown>> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = async () => {
      const response = await this.#fetch(SYNCLIP_IMAGE_ORIGIN + path, { method, redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body } : {}) });
      if (response.redirected || (response.url && new URL(response.url).origin !== 'https://api.synclip.ai')) throw invalid();
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new SynclipImageError('SYNCLIP_HTTP_FAILED', 'uncertain', response.status); }
      const envelope = await boundedJson(response);
      if (!record(envelope) || envelope.success !== true || !record(envelope.data)) throw invalid();
      return envelope.data;
    };
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new SynclipImageError('SYNCLIP_TIMEOUT')); }, this.#timeoutMs);
      })]);
    } catch (error) {
      controller.abort(); if (error instanceof SynclipImageError) throw error;
      throw new SynclipImageError('SYNCLIP_NETWORK_FAILED');
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async create(prompt: string): Promise<Pick<SynclipImageTask, 'task_id' | 'status'>> {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new SynclipImageError('SYNCLIP_REQUEST_INVALID', 'invalid');
    const body = JSON.stringify({ prompt, model: SYNCLIP_IMAGE_MODEL, aspectRatio: '16:9' });
    if (Buffer.byteLength(body) > CODEX_IMAGE_MAX_JSON_BYTES) throw new SynclipImageError('SYNCLIP_REQUEST_INVALID', 'invalid');
    const data = await this.#request('POST', '/image', body);
    try {
      const task_id = validateSynclipTaskId(data.task_id);
      if (!['queued', 'processing', 'completed', 'failed'].includes(String(data.status))) throw invalid();
      return { task_id, status: data.status as SynclipImageTask['status'] };
    } catch { throw invalid(); }
  }
  async query(id: string): Promise<SynclipImageTask> {
    validateSynclipTaskId(id);
    return validateSynclipImageTask(await this.#request('GET', `/tasks/${id}`), id);
  }
}

// Same public-address policy and DNS-pinned HTTPS pattern as minimax-video-download.
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
export type SynclipDownloadRequestOptions = RequestOptions & Pick<TcpSocketConnectOpts, 'autoSelectFamily'>;
export interface SynclipDownloadOptions {
  timeoutMs?: number; now?: () => number;
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
  request?: (url: URL, options: SynclipDownloadRequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
}
export function validateSynclipOriginal(bytes: Buffer): Buffer {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > SYNCLIP_IMAGE_MAX_BYTES) throw invalid();
  try {
    const media = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : 'image/webp';
    const { width, height } = encodedImageDimensions(media, bytes);
    if (!width || !height || width > 4096 || height > 4096 || width * height > 16 * 1024 * 1024) throw invalid();
    return bytes; // Full decoding and strict 1280x720 validation follow in the existing host normalizer.
  } catch { throw invalid(); }
}
export async function downloadSynclipImage(input: SynclipImageTask, options: SynclipDownloadOptions = {}): Promise<Buffer> {
  const task = validateSynclipImageTask(input, input.task_id);
  if (task.status !== 'completed' || !task.output || Date.parse(task.url_expires_at!) <= (options.now ?? Date.now)()) throw invalid();
  const url = outputUrl(task.output.url); const timeout = options.timeoutMs ?? 45000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 90000) throw new SynclipImageError('SYNCLIP_CONFIG_INVALID', 'invalid');
  const resolver = options.resolve ?? (hostname => lookup(hostname, { family: 4, all: true }));
  const request = options.request ?? get; const controller = new AbortController();
  let active: ClientRequest | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async () => {
    const addresses = await resolver(url.hostname);
    if (controller.signal.aborted) throw new SynclipImageError('SYNCLIP_TIMEOUT');
    if (!addresses.length || addresses.some(value => value.family !== 4 || isIP(value.address) !== 4 || blocked.check(value.address, 'ipv4'))) throw invalid();
    return new Promise<Buffer>((resolveBytes, reject) => {
      const fail = (error: SynclipImageError) => { reject(error); active?.destroy(); };
      active = request(url, { method: 'GET', family: 4, autoSelectFamily: false, agent: false,
        lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, 4), signal: controller.signal,
        headers: { Accept: 'image/png,image/jpeg,image/webp,application/octet-stream' } }, response => {
        response.on('error', () => fail(new SynclipImageError('SYNCLIP_NETWORK_FAILED')));
        response.on('aborted', () => fail(new SynclipImageError('SYNCLIP_NETWORK_FAILED')));
        const stop = (error: SynclipImageError) => { fail(error); response.destroy(); };
        if (response.statusCode !== 200) { stop(new SynclipImageError('SYNCLIP_HTTP_FAILED', 'uncertain', response.statusCode)); return; }
        const length = response.headers['content-length'];
        if (length !== undefined && (typeof length !== 'string' || !/^\d+$/u.test(length) || Number(length) > SYNCLIP_IMAGE_MAX_BYTES)) {
          stop(new SynclipImageError('SYNCLIP_RESPONSE_TOO_LARGE')); return;
        }
        if (!/^(?:image\/(?:png|jpeg|webp)|application\/octet-stream)(?:\s*;|$)/iu.test(String(response.headers['content-type'] ?? ''))) { stop(invalid()); return; }
        const chunks: Buffer[] = []; let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > SYNCLIP_IMAGE_MAX_BYTES) stop(new SynclipImageError('SYNCLIP_RESPONSE_TOO_LARGE')); else chunks.push(chunk);
        });
        response.on('end', () => {
          if (length !== undefined && size !== Number(length)) { reject(invalid()); return; }
          try { resolveBytes(validateSynclipOriginal(Buffer.concat(chunks))); } catch { reject(invalid()); }
        });
      });
      active.on('error', () => fail(new SynclipImageError('SYNCLIP_NETWORK_FAILED')));
    });
  };
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); active?.destroy(); reject(new SynclipImageError('SYNCLIP_TIMEOUT')); }, timeout);
    })]);
  } catch (error) { if (error instanceof SynclipImageError) throw error; throw new SynclipImageError('SYNCLIP_NETWORK_FAILED'); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

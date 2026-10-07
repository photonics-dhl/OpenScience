import { lookup } from 'node:dns/promises';
import { get, type RequestOptions } from 'node:https';
import { BlockList, isIP, type TcpSocketConnectOpts } from 'node:net';

export const SYNCLIP_VIDEO_ORIGIN = 'https://api.synclip.ai/v1';
export const SYNCLIP_VIDEO_MODELS = ['ltx23', 'ltx23fast'] as const;
export const SYNCLIP_VIDEO_MODEL = 'ltx23' as const;
export const SYNCLIP_VIDEO_DURATIONS = [5, 10, 15] as const;
export const SYNCLIP_VIDEO_MAX_REQUEST_BYTES = 256 * 1024;
export const SYNCLIP_VIDEO_MAX_RESPONSE_BYTES = 128 * 1024;
export const SYNCLIP_VIDEO_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
export type SynclipVideoModel = typeof SYNCLIP_VIDEO_MODELS[number];
export type SynclipVideoDuration = typeof SYNCLIP_VIDEO_DURATIONS[number];

export interface SynclipVideoRequest {
  prompt: string; model: SynclipVideoModel; duration: SynclipVideoDuration; resolution: '720p' | '1080p';
  first_frame_url?: string; last_frame_url?: string;
}
export type SynclipVideoStatus = 'queued' | 'processing' | 'completed' | 'failed';
export interface SynclipVideoTask {
  task_id: string; status: SynclipVideoStatus;
  output?: { type: 'video'; url: string; watermarked?: boolean }; url_expires_at?: string;
}
type ErrorCode = 'SYNCLIP_VIDEO_CONFIG_INVALID' | 'SYNCLIP_VIDEO_REQUEST_INVALID' | 'SYNCLIP_VIDEO_TASK_ID_INVALID'
  | 'SYNCLIP_VIDEO_RESPONSE_INVALID' | 'SYNCLIP_VIDEO_RESPONSE_TOO_LARGE' | 'SYNCLIP_VIDEO_HTTP_FAILED'
  | 'SYNCLIP_VIDEO_TIMEOUT' | 'SYNCLIP_VIDEO_NETWORK_FAILED';
export class SynclipVideoError extends Error {
  constructor(readonly code: ErrorCode, readonly outcome: 'invalid' | 'uncertain' = 'uncertain', readonly httpStatus?: number) {
    super(code); this.name = 'SynclipVideoError';
  }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = () => new SynclipVideoError('SYNCLIP_VIDEO_RESPONSE_INVALID');
function publicUrl(v: unknown): string {
  if (typeof v !== 'string' || v.length > 8192 || /\s/u.test(v)) throw invalid();
  try { const u = new URL(v); if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash || isIP(u.hostname.replace(/^\[|\]$/gu, ''))) throw invalid(); return v; }
  catch { throw invalid(); }
}
export function validateSynclipVideoTaskId(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/u.test(v)) throw new SynclipVideoError('SYNCLIP_VIDEO_TASK_ID_INVALID', 'invalid');
  return v;
}
function frameUrl(v: unknown): string {
  if (typeof v !== 'string' || v.length > 16 * 1024 * 1024) throw new Error();
  if (v.startsWith('data:image/png;base64,')) {
    const encoded = v.slice('data:image/png;base64,'.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) || Buffer.byteLength(encoded, 'base64') > 10 * 1024 * 1024) throw new Error();
    return v;
  }
  const u = new URL(v);
  if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash || isIP(u.hostname.replace(/^\[|\]$/gu, ''))) throw new Error();
  return v;
}
export function validateSynclipVideoRequest(v: unknown): SynclipVideoRequest {
  try {
    if (!record(v) || !['prompt', 'model', 'duration', 'resolution'].every(k => Object.hasOwn(v, k))
      || Object.keys(v).some(k => !['prompt', 'model', 'duration', 'resolution', 'first_frame_url', 'last_frame_url'].includes(k))
      || typeof v.prompt !== 'string' || !v.prompt.trim() || Buffer.byteLength(v.prompt, 'utf8') > 64 * 1024
      || !SYNCLIP_VIDEO_MODELS.includes(v.model as SynclipVideoModel) || !SYNCLIP_VIDEO_DURATIONS.includes(v.duration as SynclipVideoDuration)
      || !['720p', '1080p'].includes(String(v.resolution))) throw new Error();
    const request: SynclipVideoRequest = { prompt: v.prompt, model: v.model as SynclipVideoModel,
      duration: v.duration as SynclipVideoDuration, resolution: v.resolution as '720p' | '1080p',
      ...(v.first_frame_url === undefined ? {} : { first_frame_url: frameUrl(v.first_frame_url) }),
      ...(v.last_frame_url === undefined ? {} : { last_frame_url: frameUrl(v.last_frame_url) }) };
    if (Buffer.byteLength(JSON.stringify(request), 'utf8') > SYNCLIP_VIDEO_MAX_REQUEST_BYTES) throw new Error();
    return request;
  } catch { throw new SynclipVideoError('SYNCLIP_VIDEO_REQUEST_INVALID', 'invalid'); }
}
export function validateSynclipVideoTask(v: unknown, expectedId: string): SynclipVideoTask {
  if (!record(v) || v.task_id !== validateSynclipVideoTaskId(expectedId)) throw invalid();
  const raw = String(v.status); const status = raw === 'succeeded' ? 'completed' : raw;
  if (!['queued', 'processing', 'completed', 'failed'].includes(status)) throw invalid();
  const result: SynclipVideoTask = { task_id: expectedId, status: status as SynclipVideoStatus };
  if (status === 'completed') {
    if (!record(v.output) || v.output.type !== 'video' || typeof v.url_expires_at !== 'string'
      || !Number.isFinite(Date.parse(v.url_expires_at)) || (v.output.watermarked !== undefined && typeof v.output.watermarked !== 'boolean')) throw invalid();
    result.output = { type: 'video', url: publicUrl(v.output.url), ...(typeof v.output.watermarked === 'boolean' ? { watermarked: v.output.watermarked } : {}) };
    result.url_expires_at = v.url_expires_at;
  }
  return result;
}
async function boundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > SYNCLIP_VIDEO_MAX_RESPONSE_BYTES)) { void response.body?.cancel().catch(() => {}); throw new SynclipVideoError('SYNCLIP_VIDEO_RESPONSE_TOO_LARGE'); }
  if (!response.body || !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) throw invalid();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > SYNCLIP_VIDEO_MAX_RESPONSE_BYTES) throw new SynclipVideoError('SYNCLIP_VIDEO_RESPONSE_TOO_LARGE'); chunks.push(item.value); } return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  finally { reader.releaseLock(); }
}
export interface SynclipVideoClientConfig { apiKey: string; timeoutMs?: number; fetch?: typeof fetch; }
export class SynclipVideoClient {
  readonly #apiKey: string; readonly #fetch: typeof fetch; readonly #timeoutMs: number;
  constructor(config: SynclipVideoClientConfig) {
    if (typeof config?.apiKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(config.apiKey)
      || (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 30000))) throw new SynclipVideoError('SYNCLIP_VIDEO_CONFIG_INVALID', 'invalid');
    this.#apiKey = config.apiKey; this.#fetch = config.fetch ?? globalThis.fetch; this.#timeoutMs = config.timeoutMs ?? 15000;
  }
  async #request(method: 'POST' | 'GET', path: string, body?: string): Promise<Record<string, unknown>> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = async () => {
      const response = await this.#fetch(SYNCLIP_VIDEO_ORIGIN + path, { method, redirect: 'error', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + this.#apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body } : {}) });
      if (response.redirected || (response.url && new URL(response.url).origin !== 'https://api.synclip.ai')) throw invalid();
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new SynclipVideoError('SYNCLIP_VIDEO_HTTP_FAILED', 'uncertain', response.status); }
      const envelope = await boundedJson(response); if (!record(envelope)) throw invalid();
      const data = envelope.success === true && record(envelope.data) ? envelope.data : envelope;
      if (!record(data)) throw invalid(); return data;
    };
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new SynclipVideoError('SYNCLIP_VIDEO_TIMEOUT')); }, this.#timeoutMs); })]); }
    catch (error) { controller.abort(); if (error instanceof SynclipVideoError) throw error; throw new SynclipVideoError('SYNCLIP_VIDEO_NETWORK_FAILED'); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async create(input: SynclipVideoRequest): Promise<{ task_id: string }> { const data = await this.#request('POST', '/video', JSON.stringify(validateSynclipVideoRequest(input))); return { task_id: validateSynclipVideoTaskId(data.task_id) }; }
  async query(taskId: string): Promise<SynclipVideoTask> { const id = validateSynclipVideoTaskId(taskId); return validateSynclipVideoTask(await this.#request('GET', '/tasks/' + id), id); }
}
export type SynclipVideoDownloadRequestOptions = RequestOptions & Pick<TcpSocketConnectOpts, 'autoSelectFamily'>;
export interface SynclipVideoDownloadOptions { timeoutMs?: number; now?: () => number; resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>; request?: (url: URL, options: SynclipVideoDownloadRequestOptions, callback: (response: import('node:http').IncomingMessage) => void) => import('node:http').ClientRequest; }
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(address, prefix, 'ipv4');
export function validateSynclipVideoBytes(bytes: Buffer): Buffer { if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > SYNCLIP_VIDEO_MAX_DOWNLOAD_BYTES || !bytes.subarray(4, 12).includes(Buffer.from('ftyp'))) throw new SynclipVideoError('SYNCLIP_VIDEO_RESPONSE_INVALID'); return bytes; }
export async function downloadSynclipVideo(task: SynclipVideoTask, options: SynclipVideoDownloadOptions = {}): Promise<Buffer> {
  const value = validateSynclipVideoTask(task, task.task_id); if (value.status !== 'completed' || !value.output || Date.parse(value.url_expires_at ?? '') <= (options.now ?? Date.now)()) throw invalid();
  const url = new URL(publicUrl(value.output.url)); const timeout = options.timeoutMs ?? 90_000; if (!Number.isInteger(timeout) || timeout < 1 || timeout > 180_000) throw new SynclipVideoError('SYNCLIP_VIDEO_CONFIG_INVALID', 'invalid');
  const resolver = options.resolve ?? (hostname => lookup(hostname, { family: 4, all: true })); const request = options.request ?? get; const controller = new AbortController(); let active: import('node:http').ClientRequest | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async () => {
    const addresses = await resolver(url.hostname); if (!addresses.length || addresses.some(item => item.family !== 4 || isIP(item.address) !== 4 || blocked.check(item.address, 'ipv4'))) throw invalid();
    return new Promise<Buffer>((resolveBytes, reject) => {
      const fail = (error: SynclipVideoError) => { reject(error); active?.destroy(); };
      active = request(url, { method: 'GET', family: 4, autoSelectFamily: false, agent: false, lookup: (_host, _opts, callback) => callback(null, addresses[0]!.address, 4), signal: controller.signal, headers: { Accept: 'video/mp4,video/*,application/octet-stream' } }, response => {
        const stop = (error: SynclipVideoError) => { fail(error); response.destroy(); };
        if (response.statusCode !== 200) { stop(new SynclipVideoError('SYNCLIP_VIDEO_HTTP_FAILED', 'uncertain', response.statusCode)); return; }
        const length = response.headers['content-length']; if (length !== undefined && (typeof length !== 'string' || !/^\d+$/u.test(length) || Number(length) > SYNCLIP_VIDEO_MAX_DOWNLOAD_BYTES)) { stop(new SynclipVideoError('SYNCLIP_VIDEO_RESPONSE_TOO_LARGE')); return; }
        const chunks: Buffer[] = []; let size = 0; response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > SYNCLIP_VIDEO_MAX_DOWNLOAD_BYTES) stop(new SynclipVideoError('SYNCLIP_VIDEO_RESPONSE_TOO_LARGE')); else chunks.push(chunk); });
        response.on('error', () => fail(new SynclipVideoError('SYNCLIP_VIDEO_NETWORK_FAILED'))); response.on('aborted', () => fail(new SynclipVideoError('SYNCLIP_VIDEO_NETWORK_FAILED')));
        response.on('end', () => { if (length !== undefined && size !== Number(length)) { reject(invalid()); return; } try { resolveBytes(validateSynclipVideoBytes(Buffer.concat(chunks))); } catch (error) { reject(error); } });
      }); active.on('error', () => fail(new SynclipVideoError('SYNCLIP_VIDEO_NETWORK_FAILED')));
    });
  };
  try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); active?.destroy(); reject(new SynclipVideoError('SYNCLIP_VIDEO_TIMEOUT')); }, timeout); })]); }
  catch (error) { if (error instanceof SynclipVideoError) throw error; throw new SynclipVideoError('SYNCLIP_VIDEO_NETWORK_FAILED'); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

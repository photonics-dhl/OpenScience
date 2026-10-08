import { lookup } from 'node:dns/promises';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { get, type RequestOptions } from 'node:https';
import { BlockList, isIP, type TcpSocketConnectOpts } from 'node:net';

// Public contract: https://synclip.ai/dev/docs/audio (including its linked doc/i18n modules).
export const SYNCLIP_AUDIO_ORIGIN = 'https://api.synclip.ai/v1';
// These are local resource budgets, not advertised provider limits.
export const SYNCLIP_AUDIO_MAX_TEXT_BYTES = 64 * 1024;
export const SYNCLIP_AUDIO_MAX_REQUEST_BYTES = 128 * 1024;
export const SYNCLIP_AUDIO_MAX_RESPONSE_BYTES = 256 * 1024;
export const SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;

export interface SynclipAudioVoice {
  id: string;
  name: string;
  gender: string;
  languages: string[];
  preview_url?: string | null;
  is_premium: boolean;
  coins_per_char: number;
}
export interface SynclipAudioRequest { text: string; voice: string; speed?: number }
export interface SynclipAudioSubmission { task_id: string }
export type SynclipAudioStatus = 'queued' | 'processing' | 'completed' | 'failed';
interface SynclipAudioTaskBase { task_id: string; progress?: number; coins_used?: number }
export type SynclipAudioTask = SynclipAudioTaskBase & (
  | { status: 'queued' | 'processing' | 'failed'; output?: never; url_expires_at?: never }
  | { status: 'completed'; output: { type: 'audio'; url: string; duration?: number }; url_expires_at: string }
);
export type SynclipAudioErrorCode = 'SYNCLIP_AUDIO_CONFIG_INVALID' | 'SYNCLIP_AUDIO_REQUEST_INVALID'
  | 'SYNCLIP_AUDIO_VOICE_NOT_AVAILABLE' | 'SYNCLIP_AUDIO_TASK_ID_INVALID' | 'SYNCLIP_AUDIO_RESPONSE_INVALID'
  | 'SYNCLIP_AUDIO_RESPONSE_TOO_LARGE' | 'SYNCLIP_AUDIO_HTTP_FAILED' | 'SYNCLIP_AUDIO_TIMEOUT'
  | 'SYNCLIP_AUDIO_NETWORK_FAILED' | 'SYNCLIP_AUDIO_FORMAT_UNSUPPORTED';

/** Provider responses can arrive after a charge: only local validation is definitely invalid. */
export class SynclipAudioError extends Error {
  constructor(readonly code: SynclipAudioErrorCode, readonly outcome: 'invalid' | 'uncertain' = 'uncertain', readonly httpStatus?: number) {
    super(code);
    this.name = 'SynclipAudioError';
  }
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new SynclipAudioError('SYNCLIP_AUDIO_RESPONSE_INVALID');
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(value);
const label = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= max && !invalidCharacters(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function invalidCharacters(value: string, allowWhitespace = false): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code === 127 || (code >= 0xd800 && code <= 0xdfff)
      || (code < 32 && (!allowWhitespace || ![9, 10, 13].includes(code)))) return true;
  }
  return false;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  // Date.parse normalizes impossible calendar dates and 24:00; do not accept that coercion.
  const wallClock = parts[1] + 'T' + parts[2];
  const time = Date.parse(wallClock + 'Z');
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(wallClock + '.');
}

function publicUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192 || invalidCharacters(value) || /[\s\\]/u.test(value)) throw invalid();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
      || isIP(url.hostname.replace(/^\[|\]$/gu, '')) || url.hostname.length > 253
      || !url.hostname.includes('.') || !url.hostname.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(part))
      || /(?:^|\.)(?:localhost|local|internal|invalid|test|onion)$/iu.test(url.hostname)) throw invalid();
    return value;
  } catch { throw invalid(); }
}

export function validateSynclipAudioTaskId(value: unknown): string {
  if (!token(value)) throw new SynclipAudioError('SYNCLIP_AUDIO_TASK_ID_INVALID', 'invalid');
  return value;
}

export function validateSynclipAudioRequest(value: unknown): SynclipAudioRequest {
  try {
    if (!record(value) || !Object.hasOwn(value, 'text') || !Object.hasOwn(value, 'voice')
      || Object.keys(value).some(key => !['text', 'voice', 'speed'].includes(key))
      || typeof value.text !== 'string' || !value.text.trim() || Buffer.byteLength(value.text, 'utf8') > SYNCLIP_AUDIO_MAX_TEXT_BYTES
      || invalidCharacters(value.text, true)
      || !token(value.voice) || (value.speed !== undefined && (typeof value.speed !== 'number' || !Number.isFinite(value.speed) || value.speed <= 0))) {
      throw new Error();
    }
    const request: SynclipAudioRequest = { text: value.text, voice: value.voice, ...(value.speed === undefined ? {} : { speed: value.speed }) };
    if (Buffer.byteLength(JSON.stringify(request), 'utf8') > SYNCLIP_AUDIO_MAX_REQUEST_BYTES) throw new Error();
    return request;
  } catch { throw new SynclipAudioError('SYNCLIP_AUDIO_REQUEST_INVALID', 'invalid'); }
}

export function validateSynclipAudioVoices(value: unknown): SynclipAudioVoice[] {
  if (!Array.isArray(value) || value.length > 1024) throw invalid();
  const ids = new Set<string>();
  return value.map(item => {
    if (!record(item) || !token(item.id) || ids.has(item.id) || !label(item.name, 256) || !label(item.gender, 64)
      || !Array.isArray(item.languages) || !item.languages.length || item.languages.length > 64
      || item.languages.some(language => !label(language, 64)) || new Set(item.languages).size !== item.languages.length
      || typeof item.is_premium !== 'boolean' || !nonnegative(item.coins_per_char)) throw invalid();
    ids.add(item.id);
    return { id: item.id, name: item.name, gender: item.gender, languages: [...item.languages] as string[],
      ...(item.preview_url === undefined ? {} : { preview_url: item.preview_url === null ? null : publicUrl(item.preview_url) }),
      is_premium: item.is_premium, coins_per_char: item.coins_per_char };
  });
}

export function validateSynclipAudioTask(value: unknown, expectedId: string): SynclipAudioTask {
  const id = validateSynclipAudioTaskId(expectedId);
  if (!record(value) || value.task_id !== id || typeof value.status !== 'string' || !['queued', 'processing', 'completed', 'failed'].includes(value.status)
    || (value.progress !== undefined && (!nonnegative(value.progress) || value.progress > 100))
    || (value.coins_used !== undefined && !nonnegative(value.coins_used))) throw invalid();
  const base: SynclipAudioTaskBase = { task_id: id,
    ...(value.progress === undefined ? {} : { progress: value.progress as number }),
    ...(value.coins_used === undefined ? {} : { coins_used: value.coins_used as number }) };
  if (value.status !== 'completed') {
    if (value.output !== undefined && value.output !== null) throw invalid();
    return { ...base, status: value.status as 'queued' | 'processing' | 'failed' };
  }
  if (!record(value.output) || value.output.type !== 'audio'
    || (value.output.duration !== undefined && (!nonnegative(value.output.duration) || value.output.duration === 0))
    || !timestamp(value.url_expires_at)) throw invalid();
  return { ...base, status: 'completed', output: { type: 'audio', url: publicUrl(value.output.url),
    ...(value.output.duration === undefined ? {} : { duration: value.output.duration as number }) }, url_expires_at: value.url_expires_at };
}

function cancel(response: Response): void { void response.body?.cancel().catch(() => {}); }
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > SYNCLIP_AUDIO_MAX_RESPONSE_BYTES)) {
    cancel(response);
    throw new SynclipAudioError('SYNCLIP_AUDIO_RESPONSE_TOO_LARGE');
  }
  if (!response.body || !/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) {
    cancel(response);
    throw invalid();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new SynclipAudioError('SYNCLIP_AUDIO_TIMEOUT');
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > SYNCLIP_AUDIO_MAX_RESPONSE_BYTES) throw new SynclipAudioError('SYNCLIP_AUDIO_RESPONSE_TOO_LARGE');
      chunks.push(item.value);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw invalid(); }
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export interface SynclipAudioClientConfig { apiKey: string; timeoutMs?: number; fetch?: typeof fetch }

/** One submission per create; catalog selection is explicit, with no fallback or automatic retry. */
export class SynclipAudioClient {
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #timeout: number;
  #voices: Set<string> | undefined;
  #catalogRequest = 0;

  constructor(config: SynclipAudioClientConfig) {
    if (!record(config) || Object.keys(config).some(key => !['apiKey', 'timeoutMs', 'fetch'].includes(key))
      || typeof config.apiKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(config.apiKey)
      || (config.fetch !== undefined && typeof config.fetch !== 'function')
      || (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 30_000))) {
      throw new SynclipAudioError('SYNCLIP_AUDIO_CONFIG_INVALID', 'invalid');
    }
    this.#key = config.apiKey;
    this.#fetch = config.fetch ?? globalThis.fetch;
    this.#timeout = config.timeoutMs ?? 15_000;
  }

  async #request(method: 'GET' | 'POST', path: string, body?: string): Promise<unknown> {
    const url = SYNCLIP_AUDIO_ORIGIN + path;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = async () => {
      const response = await this.#fetch(url, { method, redirect: 'error', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + this.#key, Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body }) });
      if (controller.signal.aborted) { cancel(response); throw new SynclipAudioError('SYNCLIP_AUDIO_TIMEOUT'); }
      if (response.redirected || (response.url && response.url !== url)) { cancel(response); throw invalid(); }
      if (!response.ok) { cancel(response); throw new SynclipAudioError('SYNCLIP_AUDIO_HTTP_FAILED', 'uncertain', response.status); }
      const envelope = await boundedJson(response, controller.signal);
      if (!record(envelope) || envelope.success !== true || !Object.hasOwn(envelope, 'data')) throw invalid();
      return envelope.data;
    };
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new SynclipAudioError('SYNCLIP_AUDIO_TIMEOUT')); controller.abort(); }, this.#timeout);
      })]);
    } catch (error) {
      controller.abort();
      if (error instanceof SynclipAudioError) throw error;
      throw new SynclipAudioError('SYNCLIP_AUDIO_NETWORK_FAILED');
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  async listVoices(): Promise<SynclipAudioVoice[]> {
    // A failed refresh must not leave a stale catalog eligible for a new paid submission.
    const catalogRequest = ++this.#catalogRequest;
    this.#voices = undefined;
    const voices = validateSynclipAudioVoices(await this.#request('GET', '/voices'));
    if (catalogRequest === this.#catalogRequest) this.#voices = new Set(voices.map(voice => voice.id));
    return voices;
  }

  async create(input: SynclipAudioRequest): Promise<SynclipAudioSubmission> {
    const request = validateSynclipAudioRequest(input);
    if (!this.#voices?.has(request.voice)) throw new SynclipAudioError('SYNCLIP_AUDIO_VOICE_NOT_AVAILABLE', 'invalid');
    const data = await this.#request('POST', '/audio', JSON.stringify(request));
    if (!record(data) || !token(data.task_id) || typeof data.status !== 'string' || !['queued', 'processing'].includes(data.status)
      || (data.poll_url !== undefined && data.poll_url !== '/v1/tasks/' + data.task_id)) throw invalid();
    return { task_id: data.task_id };
  }

  async query(taskId: string): Promise<SynclipAudioTask> {
    const id = validateSynclipAudioTaskId(taskId);
    return validateSynclipAudioTask(await this.#request('GET', '/tasks/' + id), id);
  }
}

export interface SynclipAudioBytes { bytes: Buffer; format: 'mp3'; contentType: 'audio/mpeg' }
const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] as const;
const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] as const;

/** MP3 is evidenced by the official voice preview example; generated encoding is not promised.
 * Inspect Layer III frame boundaries, not MP4 magic or an ID3 tag alone. This is not a codec decoder.
 */
export function validateSynclipAudioBytes(bytes: Buffer): SynclipAudioBytes {
  if (!Buffer.isBuffer(bytes)) throw invalid();
  if (bytes.length > SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES) throw new SynclipAudioError('SYNCLIP_AUDIO_RESPONSE_TOO_LARGE');
  const unsupported = () => new SynclipAudioError('SYNCLIP_AUDIO_FORMAT_UNSUPPORTED');
  let offset = 0;
  if (bytes.subarray(0, 3).equals(Buffer.from('ID3'))) {
    if (bytes.length < 10 || ![2, 3, 4].includes(bytes[3]!) || bytes[4] === 255
      || (bytes[5]! & (bytes[3] === 2 ? 63 : bytes[3] === 3 ? 31 : 15))
      || bytes.subarray(6, 10).some(value => value >= 128)) throw invalid();
    const tagSize = bytes[6]! * 2 ** 21 + bytes[7]! * 2 ** 14 + bytes[8]! * 128 + bytes[9]!;
    offset = 10 + tagSize;
    // Footer-bearing metadata is outside the presently verified MP3 subset.
    if (bytes[3] === 4 && (bytes[5]! & 16)) throw unsupported();
    if (offset >= bytes.length) throw invalid();
  } else if (bytes.length < 4 || bytes[0] !== 255 || (bytes[1]! & 224) !== 224) throw unsupported();
  let frames = 0;
  let sampleRate: number | undefined;
  while (offset < bytes.length) {
    if (bytes.length - offset === 128 && bytes.subarray(offset, offset + 3).equals(Buffer.from('TAG'))) break;
    if (bytes.length - offset < 4 || bytes[offset] !== 255 || (bytes[offset + 1]! & 224) !== 224) throw invalid();
    const version = (bytes[offset + 1]! >> 3) & 3;
    const layer = (bytes[offset + 1]! >> 1) & 3;
    const bitrateIndex = bytes[offset + 2]! >> 4;
    const rateIndex = (bytes[offset + 2]! >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3
      || (bytes[offset + 3]! & 3) === 2) throw invalid();
    const bitrate = (version === 3 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex]!;
    const rate = [44100, 48000, 32000][rateIndex]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
    if (sampleRate !== undefined && sampleRate !== rate) throw invalid();
    sampleRate = rate;
    const frameLength = Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((bytes[offset + 2]! >> 1) & 1);
    if (offset + frameLength > bytes.length) throw invalid();
    offset += frameLength;
    frames++;
  }
  if (frames < 2) throw invalid();
  return { bytes, format: 'mp3', contentType: 'audio/mpeg' };
}

export type SynclipAudioDownloadRequestOptions = RequestOptions & Pick<TcpSocketConnectOpts, 'autoSelectFamily'>;
export interface SynclipAudioDownloadOptions {
  timeoutMs?: number;
  now?: () => number;
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  request?: (url: URL, options: SynclipAudioDownloadRequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
}
function validateDownloadOptions(value: unknown): asserts value is SynclipAudioDownloadOptions {
  if (!record(value) || Object.keys(value).some(key => !['timeoutMs', 'now', 'resolve', 'request'].includes(key))
    || ['now', 'resolve', 'request'].some(key => value[key] !== undefined && typeof value[key] !== 'function')
    || (value.timeoutMs !== undefined && (typeof value.timeoutMs !== 'number' || !Number.isInteger(value.timeoutMs)
      || value.timeoutMs < 1 || value.timeoutMs > 180_000))) {
    throw new SynclipAudioError('SYNCLIP_AUDIO_CONFIG_INVALID', 'invalid');
  }
}
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) {
  blocked.addSubnet(address, prefix, 'ipv4');
}

/** Download a saved completed result without credentials, redirects, or another provider request. */
export async function downloadSynclipAudio(task: SynclipAudioTask, options: SynclipAudioDownloadOptions = {}): Promise<SynclipAudioBytes> {
  validateDownloadOptions(options);
  const value = validateSynclipAudioTask(task, record(task) ? String(task.task_id) : '');
  const now = (options.now ?? Date.now)();
  if (!Number.isFinite(now)) throw new SynclipAudioError('SYNCLIP_AUDIO_CONFIG_INVALID', 'invalid');
  if (value.status !== 'completed' || Date.parse(value.url_expires_at) <= now) throw invalid();
  const url = new URL(value.output.url);
  const resolve = options.resolve ?? (hostname => lookup(hostname, { family: 4, all: true }));
  const request = options.request ?? get;
  const controller = new AbortController();
  let active: ClientRequest | undefined;
  let incoming: IncomingMessage | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = async () => {
    const addresses = await resolve(url.hostname);
    if (controller.signal.aborted) throw new SynclipAudioError('SYNCLIP_AUDIO_TIMEOUT');
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64
      || addresses.some(item => !record(item) || item.family !== 4 || typeof item.address !== 'string'
        || isIP(item.address) !== 4 || blocked.check(item.address, 'ipv4'))) throw invalid();
    const address = addresses[0]!.address;
    return new Promise<SynclipAudioBytes>((accept, reject) => {
      let settled = false;
      const chunks: Buffer[] = [];
      let partial: Buffer | undefined;
      let partialSize = 0;
      const fail = (error: SynclipAudioError) => {
        if (settled) return;
        settled = true;
        chunks.length = 0;
        partial = undefined;
        reject(error);
        incoming?.destroy();
        active?.destroy();
      };
      const outgoing = request(url, { method: 'GET', family: 4, autoSelectFamily: false, agent: false,
        servername: url.hostname, rejectUnauthorized: true, signal: controller.signal,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address, family: 4 }]);
          else callback(null, address, 4);
        },
        headers: { Accept: 'audio/mpeg,application/octet-stream', 'Accept-Encoding': 'identity' } }, response => {
        incoming = response;
        response.on('error', () => fail(new SynclipAudioError('SYNCLIP_AUDIO_NETWORK_FAILED')));
        response.on('aborted', () => fail(new SynclipAudioError('SYNCLIP_AUDIO_NETWORK_FAILED')));
        response.on('close', () => { if (!settled) fail(new SynclipAudioError('SYNCLIP_AUDIO_NETWORK_FAILED')); });
        if (controller.signal.aborted || settled) { response.destroy(); return; }
        // https.get does not follow Location; every redirect is rejected here.
        if (response.statusCode !== 200) { fail(new SynclipAudioError('SYNCLIP_AUDIO_HTTP_FAILED', 'uncertain', response.statusCode)); return; }
        const encoding = response.headers['content-encoding'];
        const contentType = response.headers['content-type'];
        if ((encoding !== undefined && encoding !== 'identity') || typeof contentType !== 'string'
          || !['audio/mpeg', 'application/octet-stream'].includes(contentType.split(';')[0]!.trim().toLowerCase())) {
          fail(new SynclipAudioError('SYNCLIP_AUDIO_FORMAT_UNSUPPORTED')); return;
        }
        const length = response.headers['content-length'];
        if (length !== undefined && (typeof length !== 'string' || !/^\d+$/u.test(length) || Number(length) > SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES)) {
          fail(new SynclipAudioError('SYNCLIP_AUDIO_RESPONSE_TOO_LARGE')); return;
        }
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          if (settled) return;
          if (!Buffer.isBuffer(chunk)) { fail(invalid()); return; }
          size += chunk.length;
          if (size > SYNCLIP_AUDIO_MAX_DOWNLOAD_BYTES) { fail(new SynclipAudioError('SYNCLIP_AUDIO_RESPONSE_TOO_LARGE')); return; }
          // Coalesce tiny network chunks so the byte cap also bounds retained Buffer objects.
          for (let offset = 0; offset < chunk.length;) {
            if (!partial || partialSize === partial.length) {
              partial = Buffer.allocUnsafe(64 * 1024);
              partialSize = 0;
              chunks.push(partial);
            }
            const copied = chunk.copy(partial, partialSize, offset, offset + Math.min(chunk.length - offset, partial.length - partialSize));
            partialSize += copied;
            offset += copied;
          }
        });
        response.on('end', () => {
          if (settled) return;
          if (length !== undefined && size !== Number(length)) { fail(invalid()); return; }
          try {
            if (partial) chunks[chunks.length - 1] = partial.subarray(0, partialSize);
            const result = validateSynclipAudioBytes(Buffer.concat(chunks, size));
            chunks.length = 0;
            partial = undefined;
            settled = true;
            accept(result);
          } catch (error) { fail(error instanceof SynclipAudioError ? error : invalid()); }
        });
      });
      active = outgoing;
      outgoing.on('error', () => fail(new SynclipAudioError('SYNCLIP_AUDIO_NETWORK_FAILED')));
      if (settled || controller.signal.aborted) outgoing.destroy();
    });
  };
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new SynclipAudioError('SYNCLIP_AUDIO_TIMEOUT'));
        controller.abort(); incoming?.destroy(); active?.destroy();
      }, options.timeoutMs ?? 90_000);
    })]);
  } catch (error) {
    controller.abort(); incoming?.destroy(); active?.destroy();
    if (error instanceof SynclipAudioError) throw error;
    throw new SynclipAudioError('SYNCLIP_AUDIO_NETWORK_FAILED');
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

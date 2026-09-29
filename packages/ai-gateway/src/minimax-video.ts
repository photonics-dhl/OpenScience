/** One explicitly authorized H3 pilot. This client never retries or falls back.
 * Durable cross-process create ownership belongs to the root-only operator CLI. */
export const MINIMAX_VIDEO_API_ORIGIN = 'https://api.minimax.cn';
export const MINIMAX_VIDEO_MAX_REQUEST_BYTES = 32 * 1024;
export const MINIMAX_VIDEO_PILOT = Object.freeze({
  model: 'MiniMax-H3', duration: 10, resolution: '768P', ratio: '16:9', maxCreateRequests: 1,
} as const);

export interface MiniMaxVideoRequest {
  model: 'MiniMax-H3';
  content: [{ type: 'text'; text: string }];
  resolution: '768P';
  duration: 10;
  ratio: '16:9';
}
export type MiniMaxVideoStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface MiniMaxVideoTask {
  id: string;
  model: 'MiniMax-H3';
  status: MiniMaxVideoStatus;
  content: { url?: string };
  resolution: '768P';
  duration: 10;
  ratio: '16:9';
}
export type MiniMaxVideoErrorCode = 'VIDEO_CONFIG_INVALID' | 'VIDEO_REQUEST_INVALID'
  | 'VIDEO_TASK_ID_INVALID' | 'VIDEO_RESPONSE_INVALID' | 'VIDEO_RESPONSE_TOO_LARGE'
  | 'VIDEO_HTTP_FAILED' | 'VIDEO_NETWORK_FAILED' | 'VIDEO_TIMEOUT';
export type MiniMaxVideoOutcome = 'invalid' | 'rejected' | 'uncertain';

const PROVIDER_CODES = new Set([
  'insufficient_balance_error', 'invalid_request_error', 'authentication_error',
  'permission_error', 'not_found_error', 'rate_limit_error',
  'bad_request_error', 'authorized_error', 'unprocessable_entity_error',
]);

/** Contains only allowlisted diagnostics, never a response, URL, key or cause. */
export class MiniMaxVideoError extends Error {
  readonly providerCode?: string;
  constructor(
    readonly code: MiniMaxVideoErrorCode,
    readonly outcome: MiniMaxVideoOutcome,
    readonly httpStatus?: number,
    providerCode?: string,
  ) {
    super(code);
    this.name = 'MiniMaxVideoError';
    if (providerCode !== undefined) this.providerCode = PROVIDER_CODES.has(providerCode) ? providerCode : 'provider_error';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function badResponse(): never { throw new MiniMaxVideoError('VIDEO_RESPONSE_INVALID', 'uncertain'); }

export function validateMiniMaxVideoBaseUrl(value: unknown): string {
  try {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value);
    if (url.origin !== MINIMAX_VIDEO_API_ORIGIN || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error();
    return MINIMAX_VIDEO_API_ORIGIN;
  } catch { throw new MiniMaxVideoError('VIDEO_CONFIG_INVALID', 'invalid'); }
}

/** Canonical serialization is also the exact body saved before submission. */
export function validateMiniMaxVideoRequest(value: unknown): MiniMaxVideoRequest {
  try {
    if (!record(value) || !exactKeys(value, ['model', 'content', 'resolution', 'duration', 'ratio'])
      || value.model !== 'MiniMax-H3' || value.resolution !== '768P' || value.duration !== 10 || value.ratio !== '16:9'
      || !Array.isArray(value.content) || value.content.length !== 1) throw new Error();
    const content: unknown = value.content[0];
    if (!record(content) || !exactKeys(content, ['type', 'text']) || content.type !== 'text'
      || typeof content.text !== 'string' || !content.text.trim()
      || [...content.text].some(char => { const code = char.charCodeAt(0); return code === 127 || (code < 32 && ![9, 10, 13].includes(code)); })) throw new Error();
    const request: MiniMaxVideoRequest = {
      model: 'MiniMax-H3', content: [{ type: 'text', text: content.text }],
      resolution: '768P', duration: 10, ratio: '16:9',
    };
    if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MINIMAX_VIDEO_MAX_REQUEST_BYTES) throw new Error();
    return request;
  } catch { throw new MiniMaxVideoError('VIDEO_REQUEST_INVALID', 'invalid'); }
}

export function validateMiniMaxVideoTaskId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new MiniMaxVideoError('VIDEO_TASK_ID_INVALID', 'invalid');
  }
  return value;
}

/** Unknown provider fields (including errors and usage metadata) are discarded. */
export function validateMiniMaxVideoTask(value: unknown, expectedId: string): MiniMaxVideoTask {
  if (!record(value) || value.id !== validateMiniMaxVideoTaskId(expectedId) || value.model !== 'MiniMax-H3'
    || value.resolution !== '768P' || value.duration !== 10 || value.ratio !== '16:9'
    || !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(value.status))) badResponse();
  let videoUrl: string | undefined;
  if (value.content !== undefined && value.content !== null) {
    if (!record(value.content)) badResponse();
    const rawUrl = value.content.url;
    if (rawUrl !== undefined && rawUrl !== null && rawUrl !== '') {
      try {
        if (typeof rawUrl !== 'string' || rawUrl.length > 8192 || /\s/u.test(rawUrl)) badResponse();
        const url = new URL(rawUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) badResponse();
        videoUrl = rawUrl;
      } catch { badResponse(); }
    }
  }
  if (value.status === 'succeeded' && !videoUrl) badResponse();
  return {
    id: expectedId, model: 'MiniMax-H3', status: value.status as MiniMaxVideoStatus,
    content: value.status === 'succeeded' ? { url: videoUrl } : {},
    resolution: '768P', duration: 10, ratio: '16:9',
  };
}

export interface MiniMaxVideoClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetch?: typeof fetch;
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const tooLarge = () => new MiniMaxVideoError('VIDEO_RESPONSE_TOO_LARGE', 'uncertain', response.status);
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) throw tooLarge();
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '') || !response.body) badResponse();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { reader.releaseLock(); }
}

export class MiniMaxVideoClient {
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;

  constructor(config: MiniMaxVideoClientConfig) {
    validateMiniMaxVideoBaseUrl(config.baseUrl);
    if (typeof config.apiKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/u.test(config.apiKey)) {
      throw new MiniMaxVideoError('VIDEO_CONFIG_INVALID', 'invalid');
    }
    this.#timeoutMs = config.timeoutMs ?? 15000;
    this.#maxResponseBytes = config.maxResponseBytes ?? 64 * 1024;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 30000
      || !Number.isInteger(this.#maxResponseBytes) || this.#maxResponseBytes < 64 || this.#maxResponseBytes > 64 * 1024) {
      throw new MiniMaxVideoError('VIDEO_CONFIG_INVALID', 'invalid');
    }
    this.#apiKey = config.apiKey;
    this.#fetch = config.fetch ?? globalThis.fetch;
  }

  async #request(method: 'POST' | 'GET', path: string, body?: string): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let httpStatus: number | undefined;
    const operation = async () => {
      const url = `${MINIMAX_VIDEO_API_ORIGIN}${path}`;
      const response = await this.#fetch(url, {
        method, redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body } : {}),
      });
      httpStatus = response.status;
      if (response.redirected || (response.status >= 300 && response.status < 400)
        || (response.url && new URL(response.url).origin !== MINIMAX_VIDEO_API_ORIGIN)) badResponse();
      if (response.status >= 500 || response.status === 408) {
        void response.body?.cancel().catch(() => {});
        throw new MiniMaxVideoError('VIDEO_HTTP_FAILED', 'uncertain', response.status);
      }
      const data = await boundedJson(response, this.#maxResponseBytes);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && record(data) && record(data.error) && typeof data.error.type === 'string') {
          throw new MiniMaxVideoError('VIDEO_HTTP_FAILED', 'rejected', response.status, data.error.type);
        }
        badResponse();
      }
      return data;
    };
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new MiniMaxVideoError('VIDEO_TIMEOUT', 'uncertain', httpStatus));
          }, this.#timeoutMs);
        }),
      ]);
    } catch (error) {
      controller.abort();
      if (error instanceof MiniMaxVideoError) throw error;
      throw new MiniMaxVideoError(httpStatus === undefined ? 'VIDEO_NETWORK_FAILED' : 'VIDEO_RESPONSE_INVALID', 'uncertain', httpStatus);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  async create(input: unknown): Promise<{ task_id: string }> {
    const request = validateMiniMaxVideoRequest(input);
    const data = await this.#request('POST', '/v2/video_generation', JSON.stringify(request));
    try {
      if (!record(data) || data.error !== undefined) badResponse();
      return { task_id: validateMiniMaxVideoTaskId(data.task_id) };
    } catch { return badResponse(); }
  }

  async query(taskId: string): Promise<MiniMaxVideoTask> {
    const id = validateMiniMaxVideoTaskId(taskId);
    const data = await this.#request('GET', `/v2/query/video_generation/${id}`);
    if (!record(data) || data.error !== undefined) badResponse();
    return validateMiniMaxVideoTask(data.task, id);
  }
}

import { Buffer } from 'node:buffer';

const EMBEDDING_SCHEMA_VERSION = 1;
const EMBEDDING_DIMENSION = 1024;
const EXPECTED_MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const MAX_BATCH_SIZE = 16;
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

export type EmbeddingPurpose = 'query' | 'chunk';

export interface EmbeddingResult {
  modelRevision: string;
  dimension: 1024;
  vectors: number[][];
}

export interface EmbeddingClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  logger?: (message: string) => void;
}

type EmbeddingResponse = {
  schemaVersion: number;
  modelRevision: string;
  dimension: number;
  encoding: string;
  vectors: unknown;
};

class EmbeddingClientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'EmbeddingClientError';
  }
}

function fail(code: string): never {
  throw new EmbeddingClientError(code);
}

function validateBaseUrl(rawBaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    return fail('embedding_configuration_invalid');
  }
  if (
    url.protocol !== 'http:'
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
    || url.pathname !== '/'
    || url.port !== '8080'
    || !['embedding-worker', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    return fail('embedding_configuration_invalid');
  }
  return url.toString().replace(/\/$/, '');
}

function validateInput(purpose: EmbeddingPurpose, texts: string[]): void {
  if (purpose !== 'query' && purpose !== 'chunk') {
    fail('embedding_purpose_invalid');
  }
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > MAX_BATCH_SIZE) {
    fail('embedding_batch_invalid');
  }
  for (const text of texts) {
    if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_CHARACTERS) {
      fail('embedding_limit_exceeded');
    }
  }
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (response.body === null) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) {
        break;
      }
      totalBytes += item.value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        fail('embedding_response_too_large');
      }
      chunks.push(item.value);
    }
  } catch (error) {
    if (error instanceof EmbeddingClientError) {
      throw error;
    }
    fail('embedding_response_unavailable');
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeVector(raw: unknown): number[] {
  if (typeof raw !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) {
    return fail('embedding_response_invalid');
  }
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT || bytes.toString('base64') !== raw) {
    return fail('embedding_response_invalid');
  }
  const vector: number[] = [];
  let squaredNorm = 0;
  for (let offset = 0; offset < bytes.length; offset += Float32Array.BYTES_PER_ELEMENT) {
    const value = bytes.readFloatLE(offset);
    if (!Number.isFinite(value)) {
      return fail('embedding_response_invalid');
    }
    vector.push(value);
    squaredNorm += value * value;
  }
  if (!Number.isFinite(squaredNorm) || Math.abs(Math.sqrt(squaredNorm) - 1) > 1e-4) {
    return fail('embedding_response_invalid');
  }
  return vector;
}

function decodeResponse(rawBody: Buffer, expectedCount: number): EmbeddingResult {
  let raw: unknown;
  try {
    raw = JSON.parse(rawBody.toString('utf8')) as unknown;
  } catch {
    return fail('embedding_response_invalid');
  }
  if (!isPlainObject(raw)) {
    return fail('embedding_response_invalid');
  }
  const expectedKeys = ['dimension', 'encoding', 'modelRevision', 'schemaVersion', 'vectors'];
  if (Object.keys(raw).sort().join('\0') !== expectedKeys.join('\0')) {
    return fail('embedding_response_invalid');
  }
  const response = raw as EmbeddingResponse;
  if (
    response.schemaVersion !== EMBEDDING_SCHEMA_VERSION
    || response.modelRevision !== EXPECTED_MODEL_REVISION
    || response.dimension !== EMBEDDING_DIMENSION
    || response.encoding !== 'base64-f32le'
    || !Array.isArray(response.vectors)
    || response.vectors.length !== expectedCount
  ) {
    return fail('embedding_response_invalid');
  }
  return {
    modelRevision: response.modelRevision,
    dimension: EMBEDDING_DIMENSION,
    vectors: response.vectors.map(decodeVector),
  };
}

export class EmbeddingClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: (message: string) => void;

  constructor(options: EmbeddingClientOptions) {
    this.baseUrl = validateBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
  }

  async embed(input: { purpose: EmbeddingPurpose; texts: string[] }): Promise<EmbeddingResult> {
    validateInput(input.purpose, input.texts);
    const body = JSON.stringify({
      schemaVersion: EMBEDDING_SCHEMA_VERSION,
      purpose: input.purpose,
      texts: input.texts,
    });
    if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) {
      fail('embedding_limit_exceeded');
    }

    let response: Response | undefined;
    let responseTimeout: ReturnType<typeof setTimeout> | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
      try {
        response = await this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: abortController.signal,
          redirect: 'error',
        });
        responseTimeout = timeout;
        break;
      } catch {
        clearTimeout(timeout);
        if (attempt === 1) {
          this.logger?.('embedding_request_failed:embedding_transport_unavailable');
          fail('embedding_transport_unavailable');
        }
      }
    }

    if (response === undefined) {
      return fail('embedding_transport_unavailable');
    }
    try {
      const rawBody = await readBoundedBody(response);
      if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
        fail('embedding_response_unavailable');
      }
      return decodeResponse(rawBody, input.texts.length);
    } catch (error) {
      const code = error instanceof EmbeddingClientError ? error.code : 'embedding_response_unavailable';
      this.logger?.(`embedding_request_failed:${code}`);
      throw error instanceof EmbeddingClientError ? error : new EmbeddingClientError(code);
    } finally {
      if (responseTimeout !== undefined) {
        clearTimeout(responseTimeout);
      }
    }
  }
}

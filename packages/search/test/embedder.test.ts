import { describe, expect, it, vi } from 'vitest';

import { EmbeddingClient } from '../src/embedder';

const MODEL_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const SOURCE_SHA256 = '1'.repeat(64);
const PACKAGE_FREEZE_SHA256 = '2'.repeat(64);
const MODEL_MANIFEST_SHA256 = '3'.repeat(64);

function encodedUnitVector(): string {
  const bytes = Buffer.alloc(1024 * Float32Array.BYTES_PER_ELEMENT);
  bytes.writeFloatLE(1, 0);
  return bytes.toString('base64');
}

function validResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    schemaVersion: 1,
    modelRevision: MODEL_REVISION,
    sourceSha256: SOURCE_SHA256,
    packageFreezeSha256: PACKAGE_FREEZE_SHA256,
    modelManifestSha256: MODEL_MANIFEST_SHA256,
    dimension: 1024,
    encoding: 'base64-f32le',
    vectors: [encodedUnitVector()],
    ...overrides,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('EmbeddingClient', () => {
  it('rejects oversized text and batches before any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new EmbeddingClient({ baseUrl: 'http://embedding-worker:8080', fetchImpl });

    await expect(client.embed({ purpose: 'query', texts: ['x'.repeat(20_001)] }))
      .rejects.toThrow('embedding_limit_exceeded');
    await expect(client.embed({ purpose: 'query', texts: Array.from({ length: 17 }, () => 'bounded') }))
      .rejects.toThrow('embedding_batch_invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a combined oversized request and non-worker destinations', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new EmbeddingClient({ baseUrl: 'http://embedding-worker:8080', fetchImpl });
    await expect(client.embed({ purpose: 'chunk', texts: Array.from({ length: 16 }, () => 'x'.repeat(20_000)) }))
      .rejects.toThrow('embedding_limit_exceeded');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => new EmbeddingClient({ baseUrl: 'https://example.com', fetchImpl }))
      .toThrow('embedding_configuration_invalid');
  });

  it('sends only the versioned bounded request and decodes normalized f32le', async () => {
    let requestBody = '';
    let redirectMode: RequestRedirect | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      requestBody = String(init?.body);
      redirectMode = init?.redirect;
      return validResponse();
    });
    const client = new EmbeddingClient({ baseUrl: 'http://embedding-worker:8080', fetchImpl });

    const result = await client.embed({ purpose: 'query', texts: ['bounded'] });

    expect(JSON.parse(requestBody)).toEqual({ schemaVersion: 1, purpose: 'query', texts: ['bounded'] });
    expect(redirectMode).toBe('error');
    expect(result).toMatchObject({
      modelRevision: MODEL_REVISION,
      sourceSha256: SOURCE_SHA256,
      packageFreezeSha256: PACKAGE_FREEZE_SHA256,
      modelManifestSha256: MODEL_MANIFEST_SHA256,
      dimension: 1024,
    });
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]?.[0]).toBe(1);
    expect(result.vectors[0]?.[1]).toBe(0);
  });

  it('rejects unknown response fields and never logs input text', async () => {
    const messages: string[] = [];
    const client = new EmbeddingClient({
      baseUrl: 'http://embedding-worker:8080',
      fetchImpl: async () => validResponse({ reflected: 'sensitive-bounded-text' }),
      logger: (message) => messages.push(message),
    });

    await expect(client.embed({ purpose: 'query', texts: ['sensitive-bounded-text'] }))
      .rejects.toThrow('embedding_response_invalid');
    expect(messages.join('\n')).not.toContain('sensitive-bounded-text');
  });

  it('rejects vectors from any unpinned model revision', async () => {
    const client = new EmbeddingClient({
      baseUrl: 'http://embedding-worker:8080',
      fetchImpl: async () => validResponse({ modelRevision: 'a'.repeat(40) }),
    });
    await expect(client.embed({ purpose: 'query', texts: ['bounded'] }))
      .rejects.toThrow('embedding_response_invalid');
  });

  it('rejects malformed runtime identity hashes', async () => {
    const client = new EmbeddingClient({
      baseUrl: 'http://embedding-worker:8080',
      fetchImpl: async () => validResponse({ packageFreezeSha256: 'not-a-hash' }),
    });
    await expect(client.embed({ purpose: 'query', texts: ['bounded'] }))
      .rejects.toThrow('embedding_response_invalid');
  });

  it('retries one transport failure before response bytes', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(validResponse());
    const client = new EmbeddingClient({ baseUrl: 'http://embedding-worker:8080', fetchImpl });

    await expect(client.embed({ purpose: 'query', texts: ['bounded'] })).resolves.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a response-body failure and caps response bytes', async () => {
    const brokenFetch = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([123]));
        controller.error(new Error('body failed'));
      },
    })));
    const brokenClient = new EmbeddingClient({ baseUrl: 'http://embedding-worker:8080', fetchImpl: brokenFetch });
    await expect(brokenClient.embed({ purpose: 'query', texts: ['bounded'] }))
      .rejects.toThrow('embedding_response_unavailable');
    expect(brokenFetch).toHaveBeenCalledTimes(1);

    const oversizedClient = new EmbeddingClient({
      baseUrl: 'http://embedding-worker:8080',
      fetchImpl: async () => new Response('x'.repeat(256 * 1024 + 1)),
    });
    await expect(oversizedClient.embed({ purpose: 'query', texts: ['bounded'] }))
      .rejects.toThrow('embedding_response_too_large');
  });

  it('keeps the timeout active while response bytes are being read', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      })));
      const client = new EmbeddingClient({ baseUrl: 'http://embedding-worker:8080', fetchImpl });
      const result = client.embed({ purpose: 'query', texts: ['bounded'] });
      const rejection = expect(result).rejects.toThrow('embedding_response_unavailable');
      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createScanSciAdapter } from '../../src/retrieval/scansci';

describe('ScanSci legal-only adapter', () => {
  it('is explicitly unavailable until the isolated service is enabled', async () => {
    const fetchImpl = vi.fn();
    const adapter = createScanSciAdapter({ fetchImpl, enabled: false });
    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'unavailable', provider: 'scansci', code: 'disabled', retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('hard-codes legal-only with Sci-Hub and Tor disabled', async () => {
    const bytes = Buffer.from('%PDF-safe-fixture');
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'x-scansci-route': 'institutional',
        'x-scansci-public-url': 'https://publisher.example/paper',
        'x-scansci-entitlement': 'verified',
        'x-scansci-entitlement-subject': 'a'.repeat(64),
        'x-scansci-entitlement-valid-until': '2026-09-30T00:00:00.000Z',
      },
    }));
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      fetchImpl,
      now: () => new Date('2026-08-30T00:00:00.000Z'),
    });

    const result = await adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) });

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected success');
    expect(result).toMatchObject({
      provider: 'scansci',
      route: 'institutional',
      sourceUrl: 'https://publisher.example/paper',
      access: { kind: 'institutional_access', entitlementVerified: true },
      entitlementValidUntil: new Date('2026-09-30T00:00:00.000Z'),
    });
    expect(result.bytes.equals(bytes)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://scansci-legal:8080/v1/legal-download');
    expect(JSON.parse(String(init?.body))).toEqual({
      identifier: '10.1000/example',
      strategy: 'legal_only',
      scihub: false,
      tor: false,
      institutional: true,
      subject_id: 'a'.repeat(64),
    });
  });

  it('rejects an institutional entitlement issued for another subject', async () => {
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      fetchImpl: async () => new Response(Buffer.from('%PDF-safe'), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'x-scansci-route': 'institutional',
          'x-scansci-public-url': 'https://publisher.example/paper',
          'x-scansci-entitlement': 'verified',
          'x-scansci-entitlement-subject': 'b'.repeat(64),
          'x-scansci-entitlement-valid-until': '2026-09-30T00:00:00.000Z',
        },
      }),
      now: () => new Date('2026-08-30T00:00:00.000Z'),
    });
    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'blocked', provider: 'scansci', code: 'route_not_allowed', retryable: false,
    });
  });

  it('cancels a response stream as soon as the byte limit is exceeded', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('%PDF-12345'));
        controller.enqueue(new TextEncoder().encode('overflow'));
      },
      cancel() { cancelled = true; },
    });
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      maximumBytes: 10,
      fetchImpl: async () => new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'x-scansci-route': 'open_access',
          'x-scansci-public-url': 'https://publisher.example/paper',
          'x-scansci-license': 'CC-BY-4.0',
        },
      }),
    });
    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'blocked', provider: 'scansci', code: 'limit_exceeded', retryable: false,
    });
    expect(cancelled).toBe(true);
  });

  it('maps a failed PDF stream to a stable redacted provider error', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('%PDF-safe'));
        controller.error(new Error('cookie=secret http://scansci-legal/private'));
      },
    });
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      fetchImpl: async () => new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'x-scansci-route': 'open_access',
          'x-scansci-public-url': 'https://publisher.example/paper',
        },
      }),
    });

    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'unavailable', provider: 'scansci', code: 'upstream_error', retryable: true,
    });
  });

  it('blocks a grey-source route even if the service returns a PDF', async () => {
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      fetchImpl: async () => new Response(Buffer.from('%PDF'), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'x-scansci-route': 'scihub',
          'x-scansci-public-url': 'https://example.org/paper',
        },
      }),
    });
    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'blocked', provider: 'scansci', code: 'route_not_allowed', retryable: false,
    });
  });

  it.each([
    ['disabled', 503, { status: 'unavailable', code: 'disabled', retryable: false }],
    ['auth_required', 409, { status: 'unavailable', code: 'auth_required', retryable: false }],
    ['not_entitled', 403, { status: 'blocked', code: 'not_entitled', retryable: false }],
    ['not_found', 404, { status: 'unavailable', code: 'not_found', retryable: false }],
    ['rate_limited', 429, { status: 'unavailable', code: 'rate_limited', retryable: true }],
    ['invalid_pdf', 422, { status: 'unavailable', code: 'invalid_response', retryable: false }],
    ['policy_blocked', 422, { status: 'blocked', code: 'route_not_allowed', retryable: false }],
    ['upstream_timeout', 504, { status: 'unavailable', code: 'timeout', retryable: true }],
    ['upstream_unavailable', 502, { status: 'unavailable', code: 'upstream_error', retryable: true }],
  ] as const)('maps stable service code %s without retaining its response text', async (serviceCode, status, expected) => {
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      fetchImpl: async () => new Response(JSON.stringify({ code: serviceCode, detail: 'sensitive upstream detail' }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    });

    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      provider: 'scansci',
      ...expected,
    });
  });

  it('rejects an invalid final public URL after receiving an otherwise valid PDF', async () => {
    const adapter = createScanSciAdapter({
      enabled: true,
      baseUrl: 'http://scansci-legal:8080',
      serviceToken: 'service-token',
      fetchImpl: async () => new Response(Buffer.from('%PDF-safe'), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'x-scansci-route': 'open_access',
          'x-scansci-public-url': 'http://127.0.0.1/internal.pdf',
        },
      }),
    });

    await expect(adapter.acquire({ identifier: '10.1000/example', subjectId: 'a'.repeat(64) })).resolves.toEqual({
      status: 'unavailable', provider: 'scansci', code: 'invalid_response', retryable: false,
    });
  });
});

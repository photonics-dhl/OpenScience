import { describe, expect, it, vi } from 'vitest';

import { MiniMaxCodingPlanVisionProvider } from '../src/provider';

const providerRequest = () => ({
  pageNumber: 4,
  mediaType: 'image/png' as const,
  bytes: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')),
  width: 1,
  height: 1,
  selectionReason: 'low_confidence' as const,
  prompt: 'OCR this page.',
  promptHash: 'b'.repeat(64),
  inputContentHash: 'c'.repeat(64),
});

describe('MiniMax Coding Plan VLM provider', () => {
  it('uses the official single-image VLM endpoint without a provider SDK', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      content: 'recognized text',
      base_resp: { status_code: 0, status_msg: '' },
    }), { status: 200 }));
    const provider = new MiniMaxCodingPlanVisionProvider('minimax-vision', {
      baseUrl: 'https://api.minimax.io',
      apiKey: 'test-only-key',
      model: 'coding-plan-vlm',
      pricing: {
        usdMicrosPerPage: 450,
        version: 'operator-2026-08',
        effectiveDate: '2026-08-01',
        serviceTier: 'token-plan',
      },
    }, fetcher as never);

    const result = await provider.recognize(providerRequest());

    expect(result).toEqual({
      text: 'recognized text',
      usage: { inputTokens: null, outputTokens: null },
      actualCostUsdMicros: null,
    });
    expect(provider.estimate(providerRequest())).toEqual({
      inputTokens: null,
      outputTokens: null,
      costUsdMicros: 450,
      currency: 'USD',
      pricingVersion: 'operator-2026-08',
      effectiveDate: '2026-08-01',
      serviceTier: 'token-plan',
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.minimax.io/v1/coding_plan/vlm');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-only-key');
    expect(JSON.parse(String(init.body))).toEqual({
      prompt: 'OCR this page.',
      image_url: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });

  it('fails closed on a non-zero provider status without echoing raw content/status text', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      content: 'sensitive provider output',
      base_resp: { status_code: 1033, status_msg: 'upstream detail must not escape' },
    }), { status: 200 }));
    const provider = new MiniMaxCodingPlanVisionProvider('minimax-vision', {
      baseUrl: 'https://api.minimax.io/', apiKey: 'key', model: 'coding-plan-vlm',
    }, fetcher as never);

    await expect(provider.recognize(providerRequest())).rejects.toThrow('status 1033');
    await expect(provider.recognize(providerRequest())).rejects.not.toThrow(/sensitive provider output|upstream detail/);
  });

  it('rejects unsupported or oversized direct inputs before fetch', async () => {
    const fetcher = vi.fn();
    const provider = new MiniMaxCodingPlanVisionProvider('minimax-vision', {
      baseUrl: 'https://api.minimax.io', apiKey: 'key', model: 'coding-plan-vlm', maxPageBytes: 4,
    }, fetcher as never);

    await expect(provider.recognize({ ...providerRequest(), bytes: new Uint8Array(5) })).rejects.toThrow(/size limit/);
    await expect(provider.recognize({ ...providerRequest(), mediaType: 'image/gif' as never })).rejects.toThrow(/media type/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bounds the provider response before JSON parsing', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ content: 'x'.repeat(100), base_resp: { status_code: 0 } }), { status: 200 }));
    const provider = new MiniMaxCodingPlanVisionProvider('minimax-vision', {
      baseUrl: 'https://api.minimax.io', apiKey: 'key', model: 'coding-plan-vlm', maxResponseBytes: 32,
    }, fetcher as never);
    await expect(provider.recognize(providerRequest())).rejects.toThrow(/response too large/);
  });

  it.each([
    'https://attacker.example',
    'https://user@api.minimax.io',
    'https://api.minimax.io/other',
    'https://api.minimax.io?redirect=evil',
  ])('rejects non-official or decorated provider origin %s', (baseUrl) => {
    expect(() => new MiniMaxCodingPlanVisionProvider('minimax-vision', {
      baseUrl, apiKey: 'key', model: 'coding-plan-vlm',
    })).toThrow(/official origin/);
  });

  it.each([
    { timeoutMs: 120_001 },
    { maxResponseBytes: 2 * 1024 * 1024 + 1 },
    { maxPageBytes: 4 * 1024 * 1024 + 1 },
  ])('rejects configuration above the hard transport ceiling', (override) => {
    expect(() => new MiniMaxCodingPlanVisionProvider('minimax-vision', {
      baseUrl: 'https://api.minimax.io', apiKey: 'key', model: 'coding-plan-vlm', ...override,
    })).toThrow(/configuration limit/);
  });
});

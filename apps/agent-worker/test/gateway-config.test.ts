import { describe, expect, it, vi } from 'vitest';
import { buildGateway, buildSourceRetrieveHandlerFromEnv } from '../src/index';

const ocrRequest = () => ({
  authorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'user-1' },
  source: { artifactId: 'artifact-1', documentSha256: 'a'.repeat(64) },
  pages: [{
    pageNumber: 1,
    mediaType: 'image/png' as const,
    bytes: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')),
    width: 1,
    height: 1,
    selectionReason: 'low_confidence' as const,
  }],
});

describe('MiniMax worker gateway config', () => {
  it.each([
    ['legacy ScanSci HTTP credentials', {
      SCANSCI_ENABLED: 'true',
      SCANSCI_SERVICE_TOKEN: 'stale-token',
    }, /legacy ScanSci HTTP adapter/],
    ['non-canonical production MCP endpoint', {
      NODE_ENV: 'production',
      SCANSCI_ENABLED: 'true',
      SCANSCI_MCP_URL: 'http://other-service:8000/mcp',
    }, /isolated internal official MCP service/],
    ['non-canonical production paper path', {
      NODE_ENV: 'production',
      SCANSCI_ENABLED: 'true',
      SCANSCI_PAPERS_DIR: '/other/papers',
    }, /fixed shared-volume path/],
  ])('rejects $s', (_label, env, expected) => {
    expect(() => buildSourceRetrieveHandlerFromEnv({
      RETRIEVAL_QUERY_HMAC_SECRET: 'retrieval-query-test-secret-at-least-32-bytes',
      ...env,
    })).toThrow(expected);
  });

  it('Token Plan key1 配额失败后以 Anthropic 协议回退 key2，model ID 保持不变', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>)['x-api-key'];
      if (key === 'sk-cp-primary') return new Response('rate limited', { status: 429 });
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage: { input_tokens: 5, output_tokens: 2 },
        model: 'MiniMax-M3',
      }), { status: 200 });
    });

    const gateway = buildGateway({
      MINIMAX_API_KEY: 'sk-cp-primary',
      MINIMAX_API_KEY_2: 'sk-cp-secondary',
      MINIMAX_MODEL: 'MiniMax-M3',
    }, fetchMock as never);
    const result = await gateway.complete([{ role: 'user', content: 'Return JSON.' }]);

    expect(result.text).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(url).toBe('https://api.minimax.io/anthropic/v1/messages');
      expect(JSON.parse(String(init.body)).model).toBe('MiniMax-M3');
    }
  });

  it('persists redacted AI call metadata through the injected audit sink', async () => {
    const events: Array<Record<string, unknown>> = [];
    const gateway = buildGateway({ MINIMAX_API_KEY: 'test-key', MINIMAX_MODEL: 'MiniMax-M3' }, vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 3, completion_tokens: 1 },
      model: 'MiniMax-M3',
    }), { status: 200 })) as never, { record: async (event) => { events.push(event as unknown as Record<string, unknown>); } });

    await gateway.complete([{ role: 'user', content: 'sensitive research goal' }]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'ai.gateway.call', targetType: 'ai_gateway' });
    expect(JSON.stringify(events[0])).not.toContain('sensitive research goal');
    expect(JSON.stringify(events[0])).not.toContain('test-key');
  });

  it('registers the MiniMax VLM route only with explicit enable, key and server authorization policy', async () => {
    const events: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.minimax.io/v1/coding_plan/vlm');
      return new Response(JSON.stringify({ content: 'OCR result', base_resp: { status_code: 0 } }), { status: 200 });
    });
    const gateway = buildGateway({
      MINIMAX_API_KEY: 'test-token-plan-key',
      MINIMAX_VISION_ENABLED: 'true',
      MINIMAX_VISION_MODEL: 'coding-plan-vlm',
      MINIMAX_VISION_USD_MICROS_PER_PAGE: '450',
      MINIMAX_VISION_PRICING_VERSION: 'operator-2026-08',
      MINIMAX_VISION_PRICING_EFFECTIVE_DATE: '2026-08-01',
      MINIMAX_VISION_SERVICE_TIER: 'token-plan',
    }, fetchMock as never, { record: async (event) => { events.push(event as unknown as Record<string, unknown>); } }, async () => true);

    const result = await gateway.ocr(ocrRequest());

    expect(result.status).toBe('succeeded');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'ai.gateway.call',
      metadata: {
        operation: 'ocr',
        provider: 'minimax-vision',
        estimatedCostUsdMicros: 450,
        pricingVersion: 'operator-2026-08',
      },
    });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('OCR result');
    expect(serialized).not.toContain('test-token-plan-key');
    expect(serialized).not.toContain('data:image');
  });

  it.each([
    { label: 'default-disabled', env: { MINIMAX_API_KEY: 'test-key' } },
    { label: 'missing-key', env: { MINIMAX_VISION_ENABLED: 'true' } },
    { label: 'kill-switch', env: { MINIMAX_API_KEY: 'test-key', MINIMAX_VISION_ENABLED: 'true', AI_DISABLED_PROVIDERS: 'minimax-vision' } },
  ])('$label vision configuration sends zero bytes', async ({ env }) => {
    const fetchMock = vi.fn();
    const gateway = buildGateway(env, fetchMock as never, undefined, async () => true);
    const result = await gateway.ocr(ocrRequest());
    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('production composition denies external processing until Task 4 injects a trusted policy', async () => {
    const fetchMock = vi.fn();
    const gateway = buildGateway({ MINIMAX_API_KEY: 'test-key', MINIMAX_VISION_ENABLED: 'true' }, fetchMock as never);
    await expect(gateway.ocr(ocrRequest())).rejects.toThrow(/external processing denied/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains an injected runtime kill switch for immediate post-construction changes', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: 'OCR result', base_resp: { status_code: 0 } }), { status: 200 }));
    const runtimeKillSwitch = new (await import('@openscience/ai-gateway')).MutableProviderKillSwitch();
    const gateway = buildGateway(
      { MINIMAX_API_KEY: 'test-key', MINIMAX_VISION_ENABLED: 'true' },
      fetchMock as never,
      undefined,
      async () => true,
      runtimeKillSwitch,
    );
    runtimeKillSwitch.disable('minimax-vision', 'operator_disabled');
    const result = await gateway.ocr(ocrRequest());
    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a configured region to an official MiniMax origin instead of accepting arbitrary URLs', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://api.minimaxi.com/v1/coding_plan/vlm');
      return new Response(JSON.stringify({ content: 'OCR result', base_resp: { status_code: 0 } }), { status: 200 });
    });
    const gateway = buildGateway(
      { MINIMAX_API_KEY: 'test-key', MINIMAX_VISION_ENABLED: 'true', MINIMAX_VISION_REGION: 'cn' },
      fetchMock as never,
      undefined,
      async () => true,
      new (await import('@openscience/ai-gateway')).MutableProviderKillSwitch(),
    );
    expect((await gateway.ocr(ocrRequest())).status).toBe('succeeded');
  });
});

it('scene image runtime stays off by default and uses a single configured provider when enabled', async () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ base_resp: { status_code: 1008 } })));
  await expect(buildGateway({ MINIMAX_API_KEY: 'test' }, fetchMock as never).generateImage({ prompt: 'A watercolor wave' })).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  const gateway = buildGateway({ AI_ENABLED: 'true', MINIMAX_IMAGE_ENABLED: 'true', MINIMAX_API_KEY: 'test', MINIMAX_API_KEY_2: 'second' }, fetchMock as never);
  await expect(gateway.generateImage({ prompt: 'A watercolor wave' })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.minimax.io/v1/image_generation');
});

it('image region is independent from vision and the first nonblank image key is used', async () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ base_resp: { status_code: 1008 } })));
  const flags = { AI_ENABLED: 'true', MINIMAX_IMAGE_ENABLED: 'true', MINIMAX_API_KEY: ' ', MINIMAX_API_KEY_2: ' second ', MINIMAX_IMAGE_REGION: 'cn', MINIMAX_VISION_REGION: 'invalid' };
  await expect(buildGateway(flags, fetchMock as never).generateImage({ prompt: 'A blue wave' })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.minimaxi.com/v1/image_generation');
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer second');
  expect(() => buildGateway({ ...flags, MINIMAX_IMAGE_REGION: 'invalid' })).toThrow('MINIMAX_IMAGE_REGION');
});

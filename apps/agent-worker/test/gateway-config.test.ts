import { constants } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { buildGateway, buildSourceRetrieveHandlerFromEnv, loadScanSciServiceTokenFile } from '../src/index';

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
  it('reads a ScanSci service token once from a validated nofollow descriptor', () => {
    const openSync = vi.fn(() => 42);
    const readSync = vi.fn((_fd, buffer: Buffer) => { buffer.write('service-token'); return 13; });
    const closeSync = vi.fn();
    const fstatSync = vi.fn(() => ({ isFile: () => true, uid: 1000, gid: 1000, mode: 0o100400, nlink: 1, size: 13 }));
    expect(loadScanSciServiceTokenFile('/run/scansci-worker-secrets/scansci_service_token', { openSync, readSync, closeSync, fstatSync })).toBe('service-token');
    expect(openSync).toHaveBeenCalledWith(
      '/run/scansci-worker-secrets/scansci_service_token',
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    expect(fstatSync).toHaveBeenCalledWith(42);
    expect(readSync).toHaveBeenCalledWith(42, expect.any(Buffer), 0, 13, null);
    expect(fstatSync.mock.invocationCallOrder[0]).toBeLessThan(readSync.mock.invocationCallOrder[0]!);
    expect(closeSync).toHaveBeenCalledWith(42);
  });

  it('closes the validated descriptor when its single read fails', () => {
    const closeSync = vi.fn();
    expect(() => loadScanSciServiceTokenFile('/run/scansci-worker-secrets/scansci_service_token', {
      openSync: () => 81,
      fstatSync: () => ({ isFile: () => true, uid: 1000, gid: 1000, mode: 0o100400, nlink: 1, size: 13 }),
      readSync: () => { throw new Error('descriptor read failed'); },
      closeSync,
    })).toThrow(/SCANSCI_SERVICE_TOKEN_FILE/);
    expect(closeSync).toHaveBeenCalledWith(81);
  });

  it('rejects a configured missing token file without closing an unopened descriptor', () => {
    const closeSync = vi.fn();
    expect(() => loadScanSciServiceTokenFile('/run/scansci-worker-secrets/missing', {
      openSync: () => { throw new Error('ENOENT'); },
      fstatSync: vi.fn(),
      readSync: vi.fn(),
      closeSync,
    })).toThrow(/SCANSCI_SERVICE_TOKEN_FILE/);
    expect(closeSync).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only token read from an otherwise valid descriptor', () => {
    const closeSync = vi.fn();
    expect(() => loadScanSciServiceTokenFile('/run/scansci-worker-secrets/scansci_service_token', {
      openSync: () => 82,
      fstatSync: () => ({ isFile: () => true, uid: 1000, gid: 1000, mode: 0o100400, nlink: 1, size: 3 }),
      readSync: (_fd, buffer: Buffer) => { buffer.write(' \n '); return 3; },
      closeSync,
    })).toThrow(/SCANSCI_SERVICE_TOKEN_FILE/);
    expect(closeSync).toHaveBeenCalledWith(82);
  });

  it.each([
    ['symlink', { isFile: () => false, uid: 1000, gid: 1000, mode: 0o120400, nlink: 1, size: 1 }],
    ['directory', { isFile: () => false, uid: 1000, gid: 1000, mode: 0o0400, nlink: 1, size: 1 }],
    ['wrong owner', { isFile: () => true, uid: 0, gid: 1000, mode: 0o100400, nlink: 1, size: 1 }],
    ['wrong group', { isFile: () => true, uid: 1000, gid: 0, mode: 0o100400, nlink: 1, size: 1 }],
    ['wrong mode', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o100440, nlink: 1, size: 1 }],
    ['setuid file', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o104400, nlink: 1, size: 1 }],
    ['setgid file', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o102400, nlink: 1, size: 1 }],
    ['sticky file', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o101400, nlink: 1, size: 1 }],
    ['hardlink', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o100400, nlink: 2, size: 1 }],
    ['empty file', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o100400, nlink: 1, size: 0 }],
    ['oversized file', { isFile: () => true, uid: 1000, gid: 1000, mode: 0o100400, nlink: 1, size: 4097 }],
  ])('rejects a %s ScanSci service-token descriptor', (_label, stat) => {
    expect(() => loadScanSciServiceTokenFile('/run/secrets/scansci_service_token', {
      openSync: () => 42,
      readSync: () => 1,
      closeSync: () => undefined,
      fstatSync: () => stat,
    })).toThrow(/SCANSCI_SERVICE_TOKEN_FILE/);
  });

  it.each([
    ['legacy inline token', { SCANSCI_ENABLED: 'true', SCANSCI_SERVICE_TOKEN: 'inline-token' }, /legacy ScanSci HTTP adapter/],
    ['mixed sources', {
      SCANSCI_ENABLED: 'true',
      SCANSCI_SERVICE_TOKEN: 'inline-token',
      SCANSCI_SERVICE_TOKEN_FILE: '/run/scansci-worker-secrets/scansci_service_token',
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

  it('does not open a stale configured token path while ScanSci is disabled for rollback', () => {
    expect(() => buildSourceRetrieveHandlerFromEnv({
      RETRIEVAL_QUERY_HMAC_SECRET: 'retrieval-query-test-secret-at-least-32-bytes',
      SCANSCI_ENABLED: 'false',
      SCANSCI_SERVICE_TOKEN_FILE: '/run/scansci-worker-secrets/does-not-exist',
    })).not.toThrow();
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

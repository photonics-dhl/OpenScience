import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { AiGateway } from '../src/gateway';
import {
  MutableProviderKillSwitch,
  ocrPromptFor,
  type OcrProvider,
  type OcrProviderPageRequest,
} from '../src/ocr';
import type { Provider, ProviderResult } from '../src/provider';

function textProvider(): Provider {
  return {
    name: 'text-only',
    model: 'text-only',
    complete: async (): Promise<ProviderResult> => ({
      text: 'ok',
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'text-only',
    }),
  };
}

function visionProvider(
  name: string,
  recognize: (request: OcrProviderPageRequest) => Promise<{ text: string }>,
  estimatedCostUsdMicros = 321,
): OcrProvider {
  return {
    name,
    model: `${name}-model`,
    estimate: () => ({
      inputTokens: null,
      outputTokens: null,
      costUsdMicros: estimatedCostUsdMicros,
      currency: 'USD',
      pricingVersion: 'test-v1',
      effectiveDate: '2026-08-27',
      serviceTier: 'test',
    }),
    recognize,
  };
}

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

const page = (pageNumber: number) => ({
  pageNumber,
  mediaType: 'image/png' as const,
  bytes: Uint8Array.from(ONE_PIXEL_PNG),
  width: 1,
  height: 1,
  selectionReason: 'low_confidence' as const,
});

const request = (pages = [page(2)]) => ({
  source: {
    artifactId: 'artifact-1',
    documentSha256: 'a'.repeat(64),
  },
  authorizationContext: { taskId: 'task-1', workspaceId: 'workspace-1', actorId: 'user-1' },
  pages,
});

const allowExternalProcessing = async () => true;

describe('provider-neutral LLM OCR route', () => {
  it('computes hashes, stamps candidate provenance and records no prompt/image/output', async () => {
    const auditEvents: Array<{ metadata?: Record<string, unknown> }> = [];
    const provider = visionProvider('vision-primary', async () => ({ text: 'measured result' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [provider],
      killSwitch: new MutableProviderKillSwitch(),
      externalProcessingPolicy: allowExternalProcessing,
      audit: { record: async (event) => { auditEvents.push(event as never); } } as never,
    });

    const result = await gateway.ocr(request());

    expect(result.status).toBe('succeeded');
    expect(result.inputContentHash).toMatch(/^[a-f0-9]{64}$/);
    const promptHash = createHash('sha256').update(ocrPromptFor('low_confidence')).digest('hex');
    expect(result.pages).toEqual([
      {
        status: 'succeeded',
        pageNumber: 2,
        candidate: expect.objectContaining({
          text: 'measured result',
          source: 'llm_ocr_candidate',
          provider: 'vision-primary',
          model: 'vision-primary-model',
          promptHash,
          documentSha256: 'a'.repeat(64),
          inputContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          selectionReason: 'low_confidence',
          bbox: { x: 0, y: 0, width: 1, height: 1 },
        }),
      },
    ]);

    expect(auditEvents).toHaveLength(1);
    const metadata = auditEvents[0].metadata ?? {};
    expect(metadata).toMatchObject({
      operation: 'ocr',
      provider: 'vision-primary',
      model: 'vision-primary-model',
      pageNumbers: [2],
      pageCount: 1,
      promptHash,
      selectionReason: 'low_confidence',
      estimatedCostUsdMicros: 321,
      actualCostUsdMicros: null,
      pricingVersion: 'test-v1',
    });
    expect(metadata.latencyMs).toBeTypeOf('number');
    const serialized = JSON.stringify(auditEvents);
    expect(serialized).not.toContain(ocrPromptFor('low_confidence'));
    expect(serialized).not.toContain('measured result');
    expect(serialized).not.toContain(Buffer.from(page(2).bytes).toString('base64'));
  });

  it('routes pages independently and never replays a successful page after a later failure', async () => {
    const primaryCalls: number[] = [];
    const fallbackCalls: number[] = [];
    const primary = visionProvider('primary', async (input) => {
      primaryCalls.push(input.pageNumber);
      if (input.pageNumber === 2) throw new Error('page two failed');
      return { text: `primary-${input.pageNumber}` };
    });
    const fallback = visionProvider('fallback', async (input) => {
      fallbackCalls.push(input.pageNumber);
      return { text: `fallback-${input.pageNumber}` };
    });
    const gateway = new AiGateway({ providers: [textProvider()], ocrProviders: [primary, fallback], killSwitch: new MutableProviderKillSwitch(), externalProcessingPolicy: allowExternalProcessing });

    const result = await gateway.ocr(request([page(1), page(2)]));

    expect(result.status).toBe('succeeded');
    expect(primaryCalls).toEqual([1, 2]);
    expect(fallbackCalls).toEqual([2]);
    expect(result.pages.map((entry) => entry.status === 'succeeded' ? entry.candidate.text : entry.code))
      .toEqual(['primary-1', 'fallback-2']);
  });

  it('runtime kill switch immediately prevents the disabled provider from receiving calls', async () => {
    const primary = visionProvider('primary', vi.fn(async () => ({ text: 'primary' })));
    const fallback = visionProvider('fallback', vi.fn(async () => ({ text: 'fallback' })));
    const killSwitch = new MutableProviderKillSwitch();
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [primary, fallback],
      killSwitch,
      externalProcessingPolicy: allowExternalProcessing,
    });

    await gateway.ocr(request());
    killSwitch.disable('primary', 'operator-disabled');
    const second = await gateway.ocr(request());

    expect(primary.recognize).toHaveBeenCalledTimes(1);
    expect(fallback.recognize).toHaveBeenCalledTimes(1);
    expect(second.pages[0]).toMatchObject({
      status: 'succeeded',
      candidate: { provider: 'fallback', fallbackReason: expect.stringContaining('operator-disabled') },
    });
  });

  it('returns bounded per-page failures when all OCR providers are disabled', async () => {
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    const killSwitch = new MutableProviderKillSwitch();
    killSwitch.disable('vision', 'incident-42');
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      killSwitch,
      externalProcessingPolicy: allowExternalProcessing,
    });

    const result = await gateway.ocr(request());

    expect(recognize).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      pages: [{ status: 'failed', pageNumber: 2, code: 'providers_unavailable', retryable: true }],
    });
    expect(JSON.stringify(result)).not.toContain('incident-42');
  });

  it('tracks configured per-page cost exactly and leaves unknown actual billing null', async () => {
    const logs: Array<{ metadata?: Record<string, unknown> }> = [];
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', async (input) => ({ text: `text-${input.pageNumber}` }), 275)],
      killSwitch: new MutableProviderKillSwitch(),
      externalProcessingPolicy: allowExternalProcessing,
      audit: { record: async (event) => { logs.push(event as never); } } as never,
    });

    await gateway.ocr(request([page(3), page(7)]));

    expect(logs.map((event) => event.metadata?.estimatedCostUsdMicros)).toEqual([275, 275]);
    expect(logs.map((event) => event.metadata?.actualCostUsdMicros)).toEqual([null, null]);
  });

  it.each([
    { name: 'empty pages', mutate: () => request([]) },
    { name: 'duplicate pages', mutate: () => request([page(1), page(1)]) },
    { name: 'bad source hash', mutate: () => ({ ...request(), source: { artifactId: 'a', documentSha256: 'bad' } }) },
    { name: 'unsupported media', mutate: () => ({ ...request(), pages: [{ ...page(1), mediaType: 'image/gif' }] }) },
    { name: 'mismatched magic bytes', mutate: () => ({ ...request(), pages: [{ ...page(1), bytes: new Uint8Array([1, 2, 3]) }] }) },
    { name: 'invalid dimensions', mutate: () => ({ ...request(), pages: [{ ...page(1), width: 0 }] }) },
    { name: 'header dimension mismatch', mutate: () => ({ ...request(), pages: [{ ...page(1), width: 2 }] }) },
    { name: 'unsupported selection reason', mutate: () => ({ ...request(), pages: [{ ...page(1), selectionReason: 'caller_choice' }] }) },
    { name: 'caller supplied prompt', mutate: () => ({ ...request(), prompt: 'untrusted prompt' }) },
    { name: 'caller supplied page hash', mutate: () => ({ ...request(), pages: [{ ...page(1), contentHash: 'b'.repeat(64) }] }) },
  ])('rejects $name before provider routing', async ({ mutate }) => {
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      killSwitch: new MutableProviderKillSwitch(),
      externalProcessingPolicy: allowExternalProcessing,
    });

    await expect(gateway.ocr(mutate() as never)).rejects.toThrow();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('fails closed when external-processing policy denies or throws', async () => {
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    for (const externalProcessingPolicy of [async () => false, async () => { throw new Error('policy unavailable'); }]) {
      const gateway = new AiGateway({
        providers: [textProvider()],
        ocrProviders: [visionProvider('vision', recognize)],
        externalProcessingPolicy,
      });
      await expect(gateway.ocr(request())).rejects.toThrow(/external processing/i);
    }
    expect(recognize).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'truthy object', decision: { allowed: false } },
    { label: 'truthy string', decision: 'true' },
    { label: 'thenable resolving object', decision: { then: (resolve: (value: unknown) => void) => resolve({ allowed: false }) } },
  ])('rejects malformed external-processing result: $label', async ({ decision }) => {
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      killSwitch: new MutableProviderKillSwitch(),
      externalProcessingPolicy: async () => decision as never,
    });
    await expect(gateway.ocr(request())).rejects.toThrow(/external processing denied/i);
    expect(recognize).not.toHaveBeenCalled();
  });

  it('fails closed when the asynchronous kill policy cannot be evaluated', async () => {
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      externalProcessingPolicy: allowExternalProcessing,
      killSwitch: { isEnabled: async () => { throw new Error('policy unavailable'); } },
    });
    const result = await gateway.ocr(request());
    expect(result.status).toBe('failed');
    expect(recognize).not.toHaveBeenCalled();
  });

  it('defaults OCR capability to denied when no kill policy is supplied', async () => {
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      externalProcessingPolicy: allowExternalProcessing,
    });
    const result = await gateway.ocr(request());
    expect(result.status).toBe('failed');
    expect(recognize).not.toHaveBeenCalled();
  });

  it('snapshots a getter-backed kill decision exactly once and requires strict true', async () => {
    let reads = 0;
    const recognize = vi.fn(async () => ({ text: 'must-not-run' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      externalProcessingPolicy: allowExternalProcessing,
      killSwitch: {
        isEnabled: async () => ({
          get enabled() {
            reads += 1;
            return reads > 1;
          },
        }),
      },
    });
    const result = await gateway.ocr(request());
    expect(result.status).toBe('failed');
    expect(reads).toBe(1);
    expect(recognize).not.toHaveBeenCalled();
  });

  it('does not replay a paid OCR call when the audit sink fails', async () => {
    const recognize = vi.fn(async () => ({ text: 'accepted candidate' }));
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [visionProvider('vision', recognize)],
      killSwitch: new MutableProviderKillSwitch(),
      externalProcessingPolicy: allowExternalProcessing,
      audit: { record: async () => { throw new Error('audit unavailable'); } } as never,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    const result = await gateway.ocr(request());
    expect(result.status).toBe('succeeded');
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it('rejects a provider result with unknown fields and falls back once', async () => {
    const firstRecognize = vi.fn(async () => ({ text: 'unsafe', raw: { provider: true } } as never));
    const secondRecognize = vi.fn(async () => ({ text: 'safe' }));
    const first = visionProvider('first', firstRecognize);
    const second = visionProvider('second', secondRecognize);
    const gateway = new AiGateway({
      providers: [textProvider()],
      ocrProviders: [first, second],
      killSwitch: new MutableProviderKillSwitch(),
      externalProcessingPolicy: allowExternalProcessing,
    });
    const result = await gateway.ocr(request());
    expect(result.pages[0]).toMatchObject({ status: 'succeeded', candidate: { provider: 'second', text: 'safe' } });
    expect(firstRecognize).toHaveBeenCalledTimes(1);
    expect(secondRecognize).toHaveBeenCalledTimes(1);
  });
});

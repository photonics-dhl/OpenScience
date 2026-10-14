import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGatewayConfig, loadGatewayImageConfig } from '@openscience/config';
import { createConfiguredGateway, createGatewayRecoveryReaders } from '../src/factory';
import { CodexSpoolImageProvider, SynclipSpoolImageProvider } from '../src/codex-image';
import { CodexSolImageReviewProvider } from '../src/codex-sol-review';
import { ImageUsageLimitError } from '../src/image';
import { deflateSync } from 'node:zlib';

afterEach(() => vi.restoreAllMocks());
const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const codex = { AI_ENABLED: 'true', HERMES_SCENE_IMAGE_PROVIDER: 'codex', CODEX_IMAGE_INBOX_DIR: '/codex/inbox', CODEX_IMAGE_RESULTS_DIR: '/codex/results' };
const synclip = { SYNCLIP_IMAGE_ENABLED: 'true', SYNCLIP_IMAGE_INBOX_DIR: '/synclip/inbox', SYNCLIP_IMAGE_RESULTS_DIR: '/synclip/results' };
function imageBytes(): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    return Buffer.concat([size, Buffer.from(name), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1280); ihdr.writeUInt32BE(720, 4); ihdr[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(720 * 1281))), chunk('IEND', Buffer.alloc(0))]);
}

describe('typed Gateway construction', () => {
  it('preserves key-major model order, target identity and injected audit', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>)['x-api-key'];
      if (key === 'sk-cp-primary') return new Response('rate limited', { status: 429 });
      return new Response(JSON.stringify({ model: 'MiniMax-M3', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 3, output_tokens: 1 } }));
    });
    const audit = { record: vi.fn(async () => undefined) };
    const gateway = createConfiguredGateway(loadGatewayConfig({ MINIMAX_API_KEY: 'sk-cp-primary', MINIMAX_API_KEY_2: 'sk-cp-backup',
      AI_FALLBACK_MODELS: ' MiniMax-M3.1-Flash-Preview, ' }), { fetcher: fetcher as typeof fetch, audit, logger: quiet });
    expect(await gateway.complete([{ role: 'user', content: 'source' }])).toMatchObject({ text: 'ok', model: 'MiniMax-M3', provider: 'minimax-key-2-model-1' });
    expect(fetcher.mock.calls.map(([, init]) => [
      (init!.headers as Record<string, string>)['x-api-key'], JSON.parse(String(init!.body)).model,
    ])).toEqual([['sk-cp-primary', 'MiniMax-M3'], ['sk-cp-primary', 'MiniMax-M3.1-Flash-Preview'], ['sk-cp-backup', 'MiniMax-M3']]);
    expect(audit.record).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('sk-cp-primary');
  });

  it.each([{ MINIMAX_MODEL: '' }, { AI_FALLBACK_MODELS: 'invalid model' }])('retains invalid model rejection before any request (%j)', env => {
    const fetcher = vi.fn();
    expect(() => createConfiguredGateway(loadGatewayConfig(env), { fetcher, logger: quiet })).toThrow('invalid or duplicate text provider');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never submits to a spare after the payer reports an uncertain outcome', async () => {
    const paid = vi.spyOn(CodexSpoolImageProvider.prototype, 'generate').mockRejectedValue(new Error('paid outcome unknown'));
    const spare = vi.spyOn(SynclipSpoolImageProvider.prototype, 'generate');
    const gateway = createConfiguredGateway(loadGatewayConfig({ ...codex, ...synclip, HERMES_SCENE_IMAGE_FALLBACK_PROVIDER: 'synclip' }), { logger: quiet });
    await expect(gateway.generateImage({ prompt: 'Reviewed prompt' })).rejects.toThrow('image generation failed');
    expect(paid).toHaveBeenCalledOnce(); expect(spare).not.toHaveBeenCalled();
  });

  it('uses the explicit spare only after a definitive non-submission', async () => {
    vi.spyOn(CodexSpoolImageProvider.prototype, 'generate').mockRejectedValue(new ImageUsageLimitError());
    const spare = vi.spyOn(SynclipSpoolImageProvider.prototype, 'generate').mockResolvedValue({ bytes: imageBytes(), model: 'gpt-image-2.5' });
    const gateway = createConfiguredGateway(loadGatewayConfig({ ...codex, ...synclip, HERMES_SCENE_IMAGE_FALLBACK_PROVIDER: 'synclip' }), { logger: quiet });
    expect(await gateway.generateImage({ prompt: 'Reviewed prompt' })).toMatchObject({ provider: 'synclip', model: 'gpt-image-2.5' });
    expect(spare).toHaveBeenCalledOnce();
  });
});

describe('API read-only Gateway recovery construction', () => {
  it.each(['unsafe', 'before_submission'] as const)('keeps a spare %s verdict from authorizing payer replay', async state => {
    const payer = vi.spyOn(CodexSpoolImageProvider.prototype, 'inspectRecoveryState').mockResolvedValue('unsafe');
    const spare = vi.spyOn(SynclipSpoolImageProvider.prototype, 'inspectRecoveryState').mockResolvedValue(state);
    const before = vi.spyOn(CodexSpoolImageProvider.prototype, 'canResumeBeforeSubmission').mockResolvedValue(false);
    const spareBefore = vi.spyOn(SynclipSpoolImageProvider.prototype, 'canResumeBeforeSubmission');
    const generate = vi.spyOn(CodexSpoolImageProvider.prototype, 'generate');
    const readers = createGatewayRecoveryReaders(loadGatewayImageConfig({ ...codex, ...synclip, HERMES_SCENE_IMAGE_FALLBACK_PROVIDER: 'synclip' }), { logger: quiet });
    expect(await readers.inspectImageRecoveryState!('saved-task')).toBe('unsafe');
    expect(await readers.canResumeImageBeforeSubmission!('saved-task')).toBe(false);
    expect(payer).toHaveBeenCalledOnce(); expect(spare).toHaveBeenCalledOnce(); expect(before).toHaveBeenCalledOnce();
    expect(spareBefore).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
    expect(readers).not.toHaveProperty('generate'); expect(readers).not.toHaveProperty('generateImage');
  });

  it('reads a spare completed result without consulting or submitting to the payer', async () => {
    const payer = vi.spyOn(CodexSpoolImageProvider.prototype, 'inspectRecoveryState');
    const spare = vi.spyOn(SynclipSpoolImageProvider.prototype, 'inspectRecoveryState').mockResolvedValue('completed');
    const generate = vi.spyOn(SynclipSpoolImageProvider.prototype, 'generate');
    const readers = createGatewayRecoveryReaders(loadGatewayImageConfig({ ...codex, ...synclip, HERMES_SCENE_IMAGE_FALLBACK_PROVIDER: 'synclip' }), { logger: quiet });
    expect(await readers.inspectImageRecoveryState!('paid-task')).toBe('completed');
    expect(spare).toHaveBeenCalledOnce(); expect(payer).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  });

  it('does not promote an unused spare when the original MiniMax payer has no spool', () => {
    const readers = createGatewayRecoveryReaders(loadGatewayImageConfig({ ...codex, HERMES_SCENE_IMAGE_PROVIDER: 'minimax',
      MINIMAX_IMAGE_ENABLED: 'true', MINIMAX_API_KEY: 'fixture', HERMES_SCENE_IMAGE_FALLBACK_PROVIDER: 'codex' }), { logger: quiet });
    expect(readers.inspectImageRecoveryState).toBeUndefined(); expect(readers.canResumeImageBeforeSubmission).toBeUndefined();
  });

  it('keeps Codex/Sol completed readers available without an enabled Sol executor', async () => {
    vi.spyOn(CodexSpoolImageProvider.prototype, 'inspectRecoveryState').mockResolvedValue('completed');
    const completed = vi.spyOn(CodexSolImageReviewProvider.prototype, 'canResumeFromCompletedResult').mockResolvedValue(true);
    const submit = vi.spyOn(CodexSolImageReviewProvider.prototype, 'review');
    const readers = createGatewayRecoveryReaders(loadGatewayImageConfig({ ...codex, CODEX_SOL_IMAGE_REVIEW_ENABLED: 'false',
      CODEX_SOL_REVIEW_INBOX_DIR: '/review/inbox', CODEX_SOL_REVIEW_RESULTS_DIR: '/review/results' }), { logger: quiet });
    expect(await readers.inspectImageRecoveryState!('paid-task')).toBe('completed');
    expect(await readers.canResumeImageReviewFromCompletedResult!('paid-review')).toBe(true);
    expect(completed).toHaveBeenCalledOnce(); expect(submit).not.toHaveBeenCalled();
  });

  it('suppresses every legacy spare when Synclip is the primary', async () => {
    const spare = vi.spyOn(CodexSpoolImageProvider.prototype, 'inspectRecoveryState');
    vi.spyOn(SynclipSpoolImageProvider.prototype, 'inspectRecoveryState').mockResolvedValue('unsafe');
    const readers = createGatewayRecoveryReaders(loadGatewayImageConfig({ ...codex, ...synclip,
      HERMES_SCENE_IMAGE_PROVIDER: 'synclip', HERMES_SCENE_IMAGE_FALLBACK_PROVIDER: 'codex' }), { logger: quiet });
    expect(await readers.inspectImageRecoveryState!('paid-task')).toBe('unsafe'); expect(spare).not.toHaveBeenCalled();
  });

  it('treats failed spool inspection as unsafe and preserves disabled primary admission', async () => {
    vi.spyOn(CodexSpoolImageProvider.prototype, 'inspectRecoveryState').mockRejectedValue(new Error('unreadable'));
    const readers = createGatewayRecoveryReaders(loadGatewayImageConfig(codex), { logger: quiet });
    expect(await readers.inspectImageRecoveryState!('paid-task')).toBe('unsafe');
    const disabled = createGatewayRecoveryReaders(loadGatewayImageConfig({ ...codex, AI_DISABLED_PROVIDERS: 'codex-image' }), { logger: quiet });
    expect(disabled.inspectImageRecoveryState).toBeUndefined(); expect(disabled.canResumeImageBeforeSubmission).toBeUndefined();
  });
});

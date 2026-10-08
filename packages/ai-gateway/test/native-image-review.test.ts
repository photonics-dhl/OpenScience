import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AiGateway } from '../src/gateway';
import { AnthropicCompatProvider } from '../src/provider';
import { nativeImageReviewPromptHash } from '../src/native-image-review';
import type { ScienceReviewInput } from '../src/science-review-protocol';

const bytes = readFileSync(resolve(__dirname, 'fixtures/minimax-reference.png'));
const hash = createHash('sha256').update(bytes).digest('hex');
const input = (): ScienceReviewInput => ({ requestId: 'image-task', prompt: 'Inspect the actual axes against the approved evidence.',
  authorizationContext: { taskId: 'image-task', actorId: 'actor', workspaceId: 'ws' },
  illustrationContext: { executionAttempt: 1, claimContent: 'claims', baseIdentity: 'parent', imageReviewMode: 'model-native' },
  source: { kind: 'illustration-image', researchObjectId: 'ro', versionId: 'v', candidateHash: hash, sourceEvidenceIdentity: 'b'.repeat(64) },
  attachments: [{ fileName: 'page-1.png', mediaType: 'image/png', bytes, sha256: hash, pageNumber: 1, width: 1, height: 1 }] });
const guard = (value: unknown): value is { decision: string } => Boolean(value && typeof value === 'object' && (value as { decision?: string }).decision === 'accepted');
function setup(text = '{"decision":"accepted"}', model = 'MiniMax-M3') {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ model, content: [{ type: 'text', text }],
    stop_reason: 'end_turn', usage: { input_tokens: 17, output_tokens: 8 } }), { status: 200 }));
  const provider = new AnthropicCompatProvider('minimax-key-1-model-1', { model, apiKey: 'test', baseUrl: 'https://minimax.example' }, fetcher as never);
  const authorize = vi.fn(async () => undefined);
  const checkpoint = vi.fn(async (_input, _target, submit) => submit());
  const audit = { record: vi.fn(async () => undefined) };
  const gateway = new AiGateway({ providers: [provider], illustrationReviewPolicy: async () => true,
    authorizeIllustrationReview: authorize, nativeImageReviewSubmission: checkpoint, audit });
  return { gateway, provider, fetcher, checkpoint, authorize, audit };
}

describe('server-bound Hermes native pixel review', () => {
  it.each([100000, 100001])('uses the existing native model budget at %i characters without changing the browser protocol', async length => {
    const f = setup(); const request = input(); request.prompt = 'x'.repeat(length);
    if (length === 100000) { await f.gateway.reviewScientific(request, guard); expect(f.fetcher).toHaveBeenCalledOnce(); }
    else {
      await expect(f.gateway.reviewScientific(request, guard)).rejects.toThrow();
      expect(f.authorize).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
    }
  });
  it('uses real native pixels, the actual primary model and an exact durable target before HTTP', async () => {
    const f = setup();
    f.checkpoint.mockImplementation(async (request, target, submit) => {
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(target).toEqual({ provider: f.provider.name, model: f.provider.model, promptHash: nativeImageReviewPromptHash(request) });
      return submit();
    });
    const request = input();
    expect(await f.gateway.reviewScientific(request, guard)).toMatchObject({ provider: f.provider.name, model: 'MiniMax-M3', promptHash: nativeImageReviewPromptHash(request) });
    const body = JSON.parse(String((f.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.max_tokens).toBe(32768);
    expect(body.messages[0].content[1].source.data).toBe(bytes.toString('base64'));
    expect(f.authorize).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
    const log = f.audit.record.mock.calls[0][0] as unknown as { metadata: Record<string, unknown> };
    expect(log.metadata).toMatchObject({ operation: 'scientific_review', inputTokens: 17, pageCount: 1, pricingVersion: null, actualCostUsdMicros: null });
  });

  it('does not mark a call started when deterministic native preflight fails', async () => {
    const f = setup(); vi.spyOn(f.provider, 'preflightNativeImages').mockImplementation(() => { throw new Error('Body too large'); });
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('does not send without fresh authorization or without the private submission owner', async () => {
    const f = setup(); f.authorize.mockRejectedValue(new Error('Revoked'));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled();
    const noOwner = new AiGateway({ providers: [f.provider], illustrationReviewPolicy: async () => true, authorizeIllustrationReview: async () => undefined });
    await expect(noOwner.reviewScientific(input(), guard)).rejects.toThrow(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('never makes a second paid call for malformed output', async () => {
    const f = setup('{"decision":"unknown"}');
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
  });
  it('classifies malformed native JSON as an explicit review-only recovery', async () => {
    const f = setup('{"decision":"accepted"');
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow('Native image review response invalid JSON; explicit review retry required');
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
  });

  it('never accepts valid-looking JSON from an output cut off at the thinking/output ceiling', async () => {
    const f = setup(); f.fetcher.mockImplementation(async () => new Response(JSON.stringify({ model: 'MiniMax-M3',
      content: [{ type: 'text', text: '{"decision":"accepted"}' }], stop_reason: 'max_tokens', usage: { input_tokens: 17, output_tokens: 32768 } }), { status: 200 }));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.checkpoint).toHaveBeenCalledOnce();
  });

  it('blocks another submission when the durable owner reports an uncertain prior call', async () => {
    const f = setup(); f.checkpoint.mockRejectedValue(new Error('Already started'));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('does not audit a saved response as a new provider call', async () => {
    const f = setup(); f.checkpoint.mockImplementation(async () => ({ text: '{"decision":"accepted"}',
      model: 'MiniMax-M3', finishReason: 'stop', usage: { inputTokens: 17, outputTokens: 8 } }));
    await f.gateway.reviewScientific(input(), guard);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('does not audit a checkpoint denial before actual submission', async () => {
    const f = setup(); f.checkpoint.mockRejectedValue(new Error('Already started'));
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('audits the actual completed call even if saving its response fails', async () => {
    const f = setup(); f.checkpoint.mockImplementation(async (_input, _target, submit) => {
      await submit(); throw new Error('Completion transaction failed');
    });
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.audit.record).toHaveBeenCalledOnce();
    expect((f.audit.record.mock.calls[0][0] as unknown as { metadata: object }).metadata).toMatchObject({ outcome: 'succeeded' });
  });

  it('allows only one invocation of an owned submission closure', async () => {
    const f = setup(); f.checkpoint.mockImplementation(async (_input, _target, submit) => { await submit(); return submit(); });
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledOnce(); expect(f.audit.record).toHaveBeenCalledOnce();
  });

  it('does not select a text-only primary or fall back to another native model', async () => {
    const f = setup(undefined, 'MiniMax-M2.7');
    await expect(f.gateway.reviewScientific(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.checkpoint).not.toHaveBeenCalled();
  });

  it('cannot turn completed-only historical recovery into a fresh native request', async () => {
    const f = setup(); await expect(f.gateway.resumeScientificReviewFromCompletedResult(input(), guard)).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});

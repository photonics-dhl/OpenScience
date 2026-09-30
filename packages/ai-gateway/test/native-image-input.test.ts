import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AiGateway } from '../src/gateway';
import { AnthropicCompatProvider, OpenAiCompatProvider, type ChatMessage, type Provider } from '../src/provider';

const data = readFileSync(resolve(__dirname, 'fixtures/minimax-reference.png')).toString('base64');
const image = () => ({ mediaType: 'image/png' as const, data });
const messages = (): ChatMessage[] => [{ role: 'user', content: 'Read the actual axes and arrows.', images: [image()] }];
const response = (model = 'MiniMax-M3', text = '{"accepted":true}') => new Response(JSON.stringify({
  model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 157, output_tokens: 9 },
}), { status: 200 });
function anthropic(model = 'MiniMax-M3') {
  const fetcher = vi.fn(async () => response(model));
  return { fetcher, provider: new AnthropicCompatProvider('minimax-key-1-model-1',
    { baseUrl: 'https://api.minimax.io/anthropic', apiKey: 'test-only', model }, fetcher as never) };
}

describe('Hermes native M3 image input', () => {
  it('sends exact pixels with the original text in the documented native base64 content blocks', async () => {
    const { provider, fetcher } = anthropic();
    await provider.complete({ model: provider.model, messages: messages() });
    const request = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(request.messages).toEqual([{ role: 'user', content: [
      { type: 'text', text: 'Read the actual axes and arrows.' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data } },
    ] }]);
    expect(provider.supportsImageInput).toBe(true);
  });

  it('preserves the existing plain-text provider payload and prompt hash', async () => {
    const { provider, fetcher } = anthropic();
    const input: ChatMessage[] = [{ role: 'system', content: 'Return JSON.' }, { role: 'user', content: 'Review this claim.' }];
    const result = await new AiGateway({ providers: [provider] }).complete(input);
    expect(result.promptHash).toBe(createHash('sha256').update(JSON.stringify(input)).digest('hex'));
    const request = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(request.system).toBe('Return JSON.');
    expect(request.messages).toEqual([input[1]]);
  });

  it.each(['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M3-unverified'])('refuses unsupported %s before any HTTP call', async model => {
    const { provider, fetcher } = anthropic(model);
    await expect(provider.complete({ model, messages: messages() })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not silently discard images in an unverified OpenAI-compatible transport', async () => {
    const fetcher = vi.fn(async () => response());
    const provider = new OpenAiCompatProvider('other', { baseUrl: 'https://api.x', apiKey: 'test', model: 'MiniMax-M3' }, fetcher as never);
    await expect(provider.complete({ model: provider.model, messages: messages() })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { mediaType: 'image/jpeg', data },
    { mediaType: 'image/png', data: 'not-valid-base64!' },
    { mediaType: 'image/png', data: Buffer.from('truncated').toString('base64') },
    { mediaType: 'image/png', data: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') },
  ])('refuses malformed or oversized pixels before HTTP', async invalid => {
    const { provider, fetcher } = anthropic();
    await expect(provider.complete({ model: provider.model,
      messages: [{ role: 'user', content: 'Review', images: [invalid] } as ChatMessage] })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects images attached to system instructions rather than source data', async () => {
    const { provider, fetcher } = anthropic();
    await expect(provider.complete({ model: provider.model, messages: [{ ...messages()[0]!, role: 'system' }] })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the documented decimal MB bound rather than the larger legacy MiB ceiling', async () => {
    const bytes = Buffer.alloc(10_000_001);
    Buffer.from(data, 'base64').copy(bytes);
    const { provider, fetcher } = anthropic();
    await expect(provider.complete({ model: provider.model,
      messages: [{ role: 'user', content: 'Review', images: [{ mediaType: 'image/png', data: bytes.toString('base64') }] }] })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires textual source instructions alongside the images', async () => {
    const { provider, fetcher } = anthropic();
    await expect(provider.complete({ model: provider.model,
      messages: [{ ...messages()[0]!, content: 1 } as unknown as ChatMessage] })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces the actual encoded body limit rather than submitting an oversized request', async () => {
    const { provider, fetcher } = anthropic();
    await expect(provider.complete({ model: provider.model,
      messages: [{ ...messages()[0]!, content: 'x'.repeat(64 * 1024 * 1024) }] })).rejects.toThrow('body limit');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not change the selected primary model to find an image-capable fallback', async () => {
    const primary = { name: 'primary', model: 'text-only', complete: vi.fn() };
    const { provider, fetcher } = anthropic();
    await expect(new AiGateway({ providers: [primary, provider] }).completeStructured(
      (value): value is object => Boolean(value), messages(), { primaryProviderOnly: true, maxRetries: 0 })).rejects.toThrow();
    expect(primary.complete).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks authority again before a repair call and stops when it is revoked', async () => {
    const { provider, fetcher } = anthropic();
    fetcher.mockImplementation(async () => response('MiniMax-M3', '{"accepted":false}'));
    let attempts = 0;
    await expect(new AiGateway({ providers: [provider] }).completeStructured(
      (value): value is { accepted: true } => (value as { accepted?: boolean })?.accepted === true,
      messages(), { maxRetries: 1, beforeEachProviderCall: async () => { if (++attempts === 2) throw new Error('revoked'); } })).rejects.toThrow();
    expect(attempts).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('will not accept a response attributed to a text-only model', async () => {
    const fetcher = vi.fn(async () => response('MiniMax-M2.7'));
    const provider = new AnthropicCompatProvider('m3', { baseUrl: 'https://api.x', apiKey: 'test', model: 'MiniMax-M3' }, fetcher as never);
    await expect(provider.complete({ model: provider.model, messages: messages() })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never falls back to a provider that cannot inspect pixels', async () => {
    const capable = { name: 'm3', model: 'MiniMax-M3', supportsImageInput: true, complete: vi.fn(async () => { throw new Error('unavailable'); }) };
    const blind = { name: 'text-only', model: 'm2', complete: vi.fn(async () => ({ text: 'accepted', usage: { inputTokens: 1, outputTokens: 1 }, model: 'm2' })) };
    await expect(new AiGateway({ providers: [capable, blind] }).complete(messages())).rejects.toThrow();
    expect(capable.complete).toHaveBeenCalledTimes(1);
    expect(blind.complete).not.toHaveBeenCalled();
  });

  it('freezes the same source pixels across initial and repair authorization callbacks', async () => {
    const input = messages();
    const seen: ChatMessage[][] = [];
    const provider: Provider = { name: 'm3', model: 'MiniMax-M3', supportsImageInput: true, complete: async options => {
      seen.push(options.messages);
      return { text: seen.length === 1 ? '{"accepted":false}' : '{"accepted":true}', usage: { inputTokens: 157, outputTokens: 9 }, model: 'MiniMax-M3' };
    } };
    const checkpoint = vi.fn(async () => { input[0]!.images![0]!.data = Buffer.from('changed after authorization').toString('base64'); });
    await new AiGateway({ providers: [provider] }).completeStructured(
      (value): value is { accepted: true } => (value as { accepted?: boolean })?.accepted === true,
      input, { maxRetries: 1, beforeEachProviderCall: checkpoint });
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(2);
    expect(seen.every(attempt => attempt[0]!.images![0]!.data === data)).toBe(true);
    expect(seen.every(attempt => Object.isFrozen(attempt[0]!.images![0]))).toBe(true);
  });

  it('audits the actual usage and image count without recording image bytes', async () => {
    const logs: unknown[] = [];
    const { provider } = anthropic();
    const gateway = new AiGateway({ providers: [provider], audit: { record: async event => { logs.push(event); } } });
    await gateway.complete(messages());
    expect(JSON.stringify(logs)).not.toContain(data);
    expect(JSON.stringify(logs)).toContain('"pageCount":1');
    expect(JSON.stringify(logs)).toContain('"inputTokens":157');
    expect(JSON.stringify(logs)).not.toContain('chatgpt-subscription');
  });
});

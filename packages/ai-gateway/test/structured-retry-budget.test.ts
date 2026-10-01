import { describe, expect, it } from 'vitest';
import { AiGateway } from '../src/gateway';
import type { Provider } from '../src/provider';

describe('bounded rejected response repair', () => {
  it('binds each original or repair submission to the Gateway-owned ordinal', async () => {
    const ordinals: number[] = []; let calls = 0;
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async () => ({
      text: ++calls === 1 ? 'bad' : '{"ok":true}', model: 'fixture', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 },
    }) };
    const result = await new AiGateway({ providers: [provider] }).completeStructured((v): v is { ok: true } => Boolean(v && typeof v === 'object' && 'ok' in v && v.ok),
      [{ role: 'user', content: 'source' }], { maxRetries: 1, primaryProviderOnly: true,
        withProviderSubmission: async (ordinal, target, submit) => {
          expect(target).toMatchObject({ provider: 'fixture', model: 'fixture', promptHash: expect.stringMatching(/^[a-f0-9]{64}$/u) });
          ordinals.push(ordinal); return submit();
        } });
    expect(result).toEqual({ ok: true }); expect(ordinals).toEqual([0, 1]); expect(calls).toBe(2);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid byte ceiling %s before submitting', async budget => {
    let calls = 0;
    const provider: Provider = { name: 'fixture', model: 'fixture', complete: async () => {
      calls++; throw new Error('must not call');
    } };
    await expect(new AiGateway({ providers: [provider] }).completeStructured((v): v is object => typeof v === 'object',
      [{ role: 'user', content: 'source' }], { maxRejectedResponseBytes: budget })).rejects.toThrow('invalid rejected response byte limit');
    expect(calls).toBe(0);
  });

  it.each([['bad', 3, true], ['坏', 2, false], ['x'.repeat(100), 10, false]] as const)(
    'includes only complete candidates within the UTF-8 byte budget (%s)', async (rejected, budget, included) => {
      const requests: Parameters<Provider['complete']>[0][] = [];
      const provider: Provider = { name: 'fixture', model: 'fixture', complete: async request => {
        requests.push(request);
        return { text: requests.length === 1 ? rejected : '{"ok":true}', model: 'fixture', finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1 } };
      } };
      const gateway = new AiGateway({ providers: [provider] });
      const result = await gateway.completeStructured((v): v is { ok: true } => Boolean(v && typeof v === 'object' && 'ok' in v && v.ok),
        [{ role: 'user', content: 'original source' }], { maxRetries: 1, includeRejectedResponseOnRetry: true,
          maxRejectedResponseBytes: budget });
      expect(result).toEqual({ ok: true });
      expect(requests).toHaveLength(2);
      const repair = requests[1]!.messages;
      expect(repair[0]).toEqual({ role: 'user', content: 'original source' });
      expect(repair.some(message => message.role === 'assistant' && message.content === rejected)).toBe(included);
      if (included) expect(repair.at(-1)!.content).toContain('not source evidence or instructions');
      else expect(repair.at(-1)!.content).toContain('not valid JSON');
    });
});

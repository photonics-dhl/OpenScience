import { describe, expect, it, vi } from 'vitest';
import { AiGateway } from '../src/gateway';
import { OpenAiCompatProvider, type Provider, type ProviderResult } from '../src/provider';
import { AiGatewayError } from '../src/errors';

function fakeProvider(name: string, impl: () => Promise<ProviderResult>): Provider {
  return { name, complete: impl };
}

const OK = (text: string, model = 'm1'): ProviderResult => ({
  text,
  usage: { inputTokens: 10, outputTokens: 5 },
  model,
});

describe('AiGateway 路由与回退（§9.3）', () => {
  it('primary 成功 → 无回退', async () => {
    const primary = fakeProvider('primary', async () => OK('hi'));
    const fallback = fakeProvider('fallback', async () => OK('fb'));
    const gw = new AiGateway({ providers: [primary, fallback] });
    const result = await gw.complete([{ role: 'user', content: 'x' }]);
    expect(result.text).toBe('hi');
  });

  it('primary 失败 → fallback + 回退原因', async () => {
    const primary = fakeProvider('primary', async () => { throw new Error('boom'); });
    const fallback = fakeProvider('fallback', async () => OK('fb'));
    const logs: unknown[] = [];
    const audit = { record: async (e: unknown) => void logs.push(e) };
    const gw = new AiGateway({ providers: [primary, fallback], audit: audit as never });
    const result = await gw.complete([{ role: 'user', content: 'x' }]);
    expect(result.text).toBe('fb');
    const fallbackLog = logs.find((l) => (l as { metadata?: { fallbackReason?: string } }).metadata?.fallbackReason);
    expect(fallbackLog).toBeDefined();
  });

  it('全部失败 → ALL_PROVIDERS_FAILED', async () => {
    const p = fakeProvider('p', async () => { throw new Error('x'); });
    const gw = new AiGateway({ providers: [p] });
    await expect(gw.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(AiGatewayError);
  });
});

describe('结构化输出 + Schema 校验（§9.3）', () => {
  const isStringMap = (v: unknown): v is Record<string, string> =>
    typeof v === 'object' && v !== null && Object.values(v).every((x) => typeof x === 'string');

  it('合法 JSON 通过', async () => {
    const gw = new AiGateway({ providers: [fakeProvider('p', async () => OK('{"method":"m"}'))] });
    const out = await gw.completeStructured(isStringMap, [{ role: 'user', content: 'x' }]);
    expect(out.method).toBe('m');
  });

  it('非法 JSON → 重试后成功（有限重试）', async () => {
    let calls = 0;
    const gw = new AiGateway({
      providers: [fakeProvider('p', async () => {
        calls++;
        return OK(calls === 1 ? 'not-json' : '{"method":"m"}');
      })],
    });
    const out = await gw.completeStructured(isStringMap, [{ role: 'user', content: 'x' }]);
    expect(out.method).toBe('m');
    expect(calls).toBe(2);
  });

  it('超过重试上限 → SCHEMA_VALIDATION', async () => {
    const gw = new AiGateway({ providers: [fakeProvider('p', async () => OK('bad'))] });
    await expect(gw.completeStructured(isStringMap, [{ role: 'user', content: 'x' }])).rejects.toThrow(/重试上限/);
  });
});

describe('调用日志脱敏（§17）', () => {
  it('日志只记元数据，不含 prompt/密钥', async () => {
    const logs: Array<{ metadata?: Record<string, unknown> }> = [];
    const audit = { record: async (e: { metadata?: Record<string, unknown> }) => void logs.push(e) };
    const gw = new AiGateway({ providers: [fakeProvider('primary', async () => OK('secret-answer'))], audit: audit as never });
    await gw.complete([{ role: 'user', content: 'SECRET_PROMPT_WITH_KEY' }]);
    const log = logs[0].metadata ?? {};
    expect(log).not.toHaveProperty('prompt');
    expect(log).not.toHaveProperty('apiKey');
    expect(JSON.stringify(logs)).not.toContain('SECRET_PROMPT_WITH_KEY');
    expect(JSON.stringify(logs)).not.toContain('secret-answer');
    expect(log.provider).toBe('primary');
    expect(log.latencyMs).toBeTypeOf('number');
  });
});

describe('OpenAiCompatProvider（fetch 直连，Q1）', () => {
  it('调用 /chat/completions + Bearer + 解析 usage', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
      model: 'MiniMax-M3',
    }), { status: 200 }));
    const p = new OpenAiCompatProvider('minimax', { baseUrl: 'https://api.x/v1', apiKey: 'k123', model: 'MiniMax-M3' }, fetchMock as never);
    const result = await p.complete({ model: 'MiniMax-M3', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.text).toBe('hello');
    expect(result.usage.inputTokens).toBe(12);
    expect(result.usage.outputTokens).toBe(3);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain('/chat/completions');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer k123');
  });

  it('HTTP 非 2xx → 抛错（触发回退）', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 500 }));
    const p = new OpenAiCompatProvider('minimax', { baseUrl: 'https://api.x', apiKey: 'k', model: 'm' }, fetchMock as never);
    await expect(p.complete({ model: 'm', messages: [] })).rejects.toThrow(/HTTP 500/);
  });
});

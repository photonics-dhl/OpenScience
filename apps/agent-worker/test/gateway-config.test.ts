import { describe, expect, it, vi } from 'vitest';
import { buildGateway } from '../src/index';

describe('MiniMax worker gateway config', () => {
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
});

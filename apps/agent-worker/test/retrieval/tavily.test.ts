import { describe, expect, it, vi } from 'vitest';
import { createTavilyAdapter } from '../../src/retrieval/tavily';

describe('Tavily discovery adapter', () => {
  it('fails closed without a configured key and makes no request', async () => {
    const fetchImpl = vi.fn();
    const adapter = createTavilyAdapter({ fetchImpl });
    await expect(adapter.search({ query: 'ultrafast', limit: 5 })).resolves.toEqual({
      status: 'unavailable', provider: 'tavily', code: 'not_configured', retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the bounded basic endpoint and marks results discovery-only', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      results: [{
        title: 'Repository record',
        url: 'https://repository.example/record',
        content: 'Repository metadata.',
        score: 0.91,
      }],
      request_id: 'request-1',
      usage: { credits: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = createTavilyAdapter({ apiKey: 'tvly-test', fetchImpl });

    const result = await adapter.search({ query: 'ultrafast', limit: 4 });

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected success');
    expect(result.sources[0]).toMatchObject({
      provider: 'tavily',
      title: 'Repository record',
      sourceUrl: 'https://repository.example/record',
      access: { kind: 'unknown' },
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tvly-test');
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'ultrafast',
      search_depth: 'basic',
      max_results: 4,
      include_answer: false,
      include_raw_content: false,
    });
  });
});

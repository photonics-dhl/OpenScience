import { createHash } from 'node:crypto';
import {
  boundedLimit,
  boundedQuery,
  externalHttpUrl,
  fetchWithTimeout,
  type NormalizedExternalSource,
  type ProviderSearchResult,
  type RetrievalFetch,
} from './contracts';

const PROVIDER = 'tavily' as const;

interface TavilyConfig {
  apiKey?: string;
  fetchImpl?: RetrievalFetch;
  timeoutMs?: number;
  enabled?: boolean;
}

function normalizeResult(value: unknown): NormalizedExternalSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 1_000
    || typeof item.url !== 'string' || item.url.length > 2_000) return null;
  let sourceUrl: string;
  try {
    sourceUrl = externalHttpUrl(item.url);
  } catch {
    return null;
  }
  return {
    provider: PROVIDER,
    providerRecordId: createHash('sha256').update(sourceUrl).digest('hex'),
    title: item.title.trim(),
    sourceUrl,
    ...(typeof item.content === 'string' && item.content.length <= 10_000 ? { contentSnippet: item.content } : {}),
    authors: [],
    identifiers: {},
    access: { kind: 'unknown' },
  };
}

export function createTavilyAdapter(config: TavilyConfig = {}) {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async search(input: { query: string; limit: number }): Promise<ProviderSearchResult> {
      const query = boundedQuery(input.query);
      const limit = boundedLimit(input.limit);
      if (config.enabled === false) return { status: 'unavailable', provider: PROVIDER, code: 'disabled', retryable: false };
      if (!config.apiKey) return { status: 'unavailable', provider: PROVIDER, code: 'not_configured', retryable: false };
      let response: Response;
      try {
        response = await fetchWithTimeout(fetchImpl, 'https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            query,
            search_depth: 'basic',
            max_results: limit,
            include_answer: false,
            include_raw_content: false,
          }),
        }, config.timeoutMs ?? 10_000);
      } catch (error) {
        return {
          status: 'unavailable', provider: PROVIDER,
          code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'upstream_error',
          retryable: true,
        };
      }
      if (response.status === 429 || response.status === 432) {
        return { status: 'unavailable', provider: PROVIDER, code: 'rate_limited', retryable: true };
      }
      if (!response.ok) return { status: 'unavailable', provider: PROVIDER, code: 'upstream_error', retryable: response.status >= 500 };
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      }
      const results = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).results
        : null;
      if (!Array.isArray(results)) return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
      return { status: 'succeeded', provider: PROVIDER, sources: results.slice(0, limit).map(normalizeResult).filter((item): item is NormalizedExternalSource => item !== null) };
    },
  };
}

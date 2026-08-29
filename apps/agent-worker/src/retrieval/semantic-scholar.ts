import type { SourceAccessEvidence } from '@openscience/domain';
import {
  boundedLimit,
  boundedQuery,
  externalHttpUrl,
  fetchWithTimeout,
  type NormalizedExternalSource,
  type ProviderSearchResult,
  type RetrievalFetch,
} from './contracts';

const PROVIDER = 'semantic_scholar' as const;
const FIELDS = [
  'paperId', 'title', 'abstract', 'year', 'venue', 'citationCount', 'authors',
  'externalIds', 'url', 'isOpenAccess', 'openAccessPdf',
].join(',');

interface SemanticScholarConfig {
  apiKey?: string;
  fetchImpl?: RetrievalFetch;
  timeoutMs?: number;
  minimumIntervalMs?: number;
}

function optionalString(value: unknown, maximum = 20_000): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? value as number : undefined;
}

function normalizePaper(value: unknown): NormalizedExternalSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const paper = value as Record<string, unknown>;
  const paperId = optionalString(paper.paperId, 200);
  const title = optionalString(paper.title, 1_000);
  if (!paperId || !title) return null;
  let sourceUrl: string;
  try {
    sourceUrl = externalHttpUrl(optionalString(paper.url, 2_000) ?? `https://www.semanticscholar.org/paper/${encodeURIComponent(paperId)}`);
  } catch {
    sourceUrl = `https://www.semanticscholar.org/paper/${encodeURIComponent(paperId)}`;
  }
  const authors = Array.isArray(paper.authors)
    ? paper.authors.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
      const name = optionalString((candidate as Record<string, unknown>).name, 300);
      return name ? [name] : [];
    }).slice(0, 100)
    : [];
  const externalIds = paper.externalIds && typeof paper.externalIds === 'object' && !Array.isArray(paper.externalIds)
    ? paper.externalIds as Record<string, unknown>
    : {};
  const identifiers = {
    ...(optionalString(externalIds.DOI, 300) ? { doi: optionalString(externalIds.DOI, 300) } : {}),
    ...(optionalString(externalIds.ArXiv, 300) ? { arxiv: optionalString(externalIds.ArXiv, 300) } : {}),
  };
  let openAccess: NormalizedExternalSource['openAccess'];
  if (paper.openAccessPdf && typeof paper.openAccessPdf === 'object' && !Array.isArray(paper.openAccessPdf)) {
    const pdf = paper.openAccessPdf as Record<string, unknown>;
    const url = optionalString(pdf.url, 2_000);
    if (url) {
      try {
        openAccess = {
          url: externalHttpUrl(url),
          ...(optionalString(pdf.status, 100) ? { status: optionalString(pdf.status, 100) } : {}),
          ...(optionalString(pdf.license, 100) ? { license: optionalString(pdf.license, 100) } : {}),
        };
      } catch {
        openAccess = undefined;
      }
    }
  }
  const access: SourceAccessEvidence = openAccess
    ? { kind: 'open_access', ...(openAccess.license ? { license: openAccess.license } : {}) }
    : { kind: 'unknown' };
  return {
    provider: PROVIDER,
    providerRecordId: paperId,
    title,
    sourceUrl,
    ...(optionalString(paper.abstract) ? { abstract: optionalString(paper.abstract) } : {}),
    authors,
    ...(optionalInteger(paper.year) ? { year: optionalInteger(paper.year) } : {}),
    ...(optionalString(paper.venue, 500) ? { venue: optionalString(paper.venue, 500) } : {}),
    ...(optionalInteger(paper.citationCount) !== undefined ? { citationCount: optionalInteger(paper.citationCount) } : {}),
    identifiers,
    ...(openAccess ? { openAccess } : {}),
    access,
  };
}

export function createSemanticScholarAdapter(config: SemanticScholarConfig = {}) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 8_000;
  const minimumIntervalMs = config.minimumIntervalMs ?? (config.apiKey ? 1_000 : 3_000);
  let tail = Promise.resolve();
  let nextAt = 0;
  const schedule = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release: () => void = () => {};
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const wait = Math.max(0, nextAt - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await operation();
    } finally {
      nextAt = Date.now() + minimumIntervalMs;
      release();
    }
  };
  return {
    async search(input: { query: string; limit: number }): Promise<ProviderSearchResult> {
      const query = boundedQuery(input.query);
      const limit = boundedLimit(input.limit);
      return schedule(async () => {
        const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
        url.searchParams.set('query', query);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('fields', FIELDS);
        let response: Response;
        try {
          response = await fetchWithTimeout(fetchImpl, url, {
            method: 'GET',
            headers: { accept: 'application/json', ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}) },
          }, timeoutMs);
        } catch (error) {
          return {
            status: 'unavailable', provider: PROVIDER,
            code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'upstream_error',
            retryable: true,
          };
        }
        if (response.status === 429) return { status: 'unavailable', provider: PROVIDER, code: 'rate_limited', retryable: true };
        if (!response.ok) return { status: 'unavailable', provider: PROVIDER, code: 'upstream_error', retryable: response.status >= 500 };
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
        }
        const data = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>).data
          : null;
        if (!Array.isArray(data)) return { status: 'unavailable', provider: PROVIDER, code: 'invalid_response', retryable: false };
        return { status: 'succeeded', provider: PROVIDER, sources: data.slice(0, limit).map(normalizePaper).filter((item): item is NormalizedExternalSource => item !== null) };
      });
    },
  };
}

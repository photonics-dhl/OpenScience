import { isIP } from 'node:net';
import type { ExternalSourceProvider, SourceAccessEvidence } from '@openscience/domain';

export type RetrievalUnavailableCode =
  | 'disabled'
  | 'auth_required'
  | 'not_found'
  | 'not_configured'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_error'
  | 'invalid_response';

export interface NormalizedExternalSource {
  provider: ExternalSourceProvider;
  providerRecordId: string;
  title: string;
  sourceUrl: string;
  abstract?: string;
  contentSnippet?: string;
  authors: string[];
  year?: number;
  venue?: string;
  citationCount?: number;
  identifiers: { doi?: string; arxiv?: string };
  openAccess?: { url: string; status?: string; license?: string };
  access: SourceAccessEvidence;
}

export type ProviderSearchResult =
  | { status: 'succeeded'; provider: ExternalSourceProvider; sources: NormalizedExternalSource[] }
  | { status: 'unavailable'; provider: ExternalSourceProvider; code: RetrievalUnavailableCode; retryable: boolean };

export type RetrievalFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

const CREDENTIAL_QUERY_KEY = /(?:^|[_-])(?:access[_-]?token|api[_-]?key|auth|authorization|credential|jwt|password|secret|session|signature|signed|ticket)(?:$|[_-])/i;

function privateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === '::' || normalized === '::1' || /^(?:fc|fd|fe[89ab])/.test(normalized)) return true;
  // WHATWG URL canonicalizes dotted mapped addresses to hex (for example
  // ::ffff:127.0.0.1 -> ::ffff:7f00:1). No mapped literal is a valid public
  // bibliographic hostname for this product, so reject the class outright.
  return normalized.startsWith('::ffff:');
}

export function externalHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('external URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('external URL is invalid');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('external URL is private');
  }
  const ipVersion = isIP(hostname);
  if ((ipVersion === 4 && PRIVATE_V4.some((pattern) => pattern.test(hostname)))
    || (ipVersion === 6 && privateIpv6(hostname))) {
    throw new Error('external URL is private');
  }
  for (const key of url.searchParams.keys()) {
    if (CREDENTIAL_QUERY_KEY.test(key)) throw new Error('external URL contains credentials');
  }
  url.hash = '';
  return url.toString();
}

export function boundedQuery(value: string): string {
  const query = value.trim();
  if (!query || query.length > 500) throw new Error('retrieval query is invalid');
  return query;
}

export function boundedLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error('retrieval limit is invalid');
  return value;
}

export async function fetchWithTimeout(
  fetchImpl: RetrievalFetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

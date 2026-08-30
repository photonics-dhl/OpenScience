import { isSourceRetrieveIdentifier } from './browser-result';
import { EXTERNAL_SOURCE_PROVIDERS, type ExternalSourceProvider } from './types';

export interface SourceRetrievePayload {
  query: string;
  providers: ExternalSourceProvider[];
  limit: number;
  includeFullText: boolean;
  identifier?: string;
}

export function parseSourceRetrievePayload(value: unknown): SourceRetrievePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('source.retrieve payload is invalid');
  const input = value as Record<string, unknown>;
  const allowed = new Set(['query', 'providers', 'limit', 'includeFullText', 'identifier']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('source.retrieve payload contains unknown fields');
  if (typeof input.query !== 'string') throw new Error('source.retrieve query is invalid');
  const query = input.query.trim();
  if (!query || query.length > 500) throw new Error('source.retrieve query is invalid');
  const providers = input.providers === undefined
    ? ['semantic_scholar', 'tavily'] as ExternalSourceProvider[]
    : Array.isArray(input.providers)
      ? input.providers.slice()
      : [];
  if (providers.length < 1 || providers.length > EXTERNAL_SOURCE_PROVIDERS.length
    || providers.some((provider): provider is never => typeof provider !== 'string'
      || !(EXTERNAL_SOURCE_PROVIDERS as readonly string[]).includes(provider))
    || new Set(providers).size !== providers.length) {
    throw new Error('source.retrieve providers are invalid');
  }
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 20) {
    throw new Error('source.retrieve limit is invalid');
  }
  const includeFullText = input.includeFullText ?? false;
  if (typeof includeFullText !== 'boolean') throw new Error('source.retrieve includeFullText is invalid');
  const identifier = typeof input.identifier === 'string' ? input.identifier.trim() : undefined;
  if (input.identifier !== undefined && (!identifier || identifier.length > 300 || !isSourceRetrieveIdentifier(identifier))) {
    throw new Error('source.retrieve identifier is invalid');
  }
  if (includeFullText && (!providers.includes('scansci') || !identifier)) {
    throw new Error('source.retrieve full text requires ScanSci and a DOI/arXiv identifier');
  }
  if (!includeFullText && identifier) throw new Error('source.retrieve identifier requires full text');
  return { query, providers, limit: limit as number, includeFullText, ...(identifier ? { identifier } : {}) };
}

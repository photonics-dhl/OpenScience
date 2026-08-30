import {
  decideSourceRights,
  parseSourceRetrievePayload,
  type SourceRetrievePayload,
  type SourceRightsDecision,
} from '@openscience/domain';
import type { NormalizedExternalSource, ProviderSearchResult } from './contracts';
import type { ScanSciAcquireResult } from './scansci';

export interface PersistedRetrievalSource {
  id: string;
  provider: string;
  title: string;
  sourceUrl: string;
  rights: SourceRightsDecision;
  temporaryDocumentId?: string;
}

export interface RetrievalRuntime {
  semanticScholar: { search(input: { query: string; limit: number }): Promise<ProviderSearchResult> };
  tavily: { search(input: { query: string; limit: number }): Promise<ProviderSearchResult> };
  scansci: { acquire(input: { identifier: string; subjectId: string }): Promise<ScanSciAcquireResult> };
  persist(input: {
    source: NormalizedExternalSource;
    rights: SourceRightsDecision;
    fullText?: Extract<ScanSciAcquireResult, { status: 'succeeded' }>;
  }): Promise<PersistedRetrievalSource>;
  observeScanSci?: (observation: 'auth_required' | 'succeeded') => Promise<void>;
}

export function createScanSciAuthRequiredStateTracker() {
  let authRequired = false;
  return {
    observe(providers: Array<{ provider: string; status: string; code?: string }>): boolean {
      const scansci = providers.find(({ provider }) => provider === 'scansci');
      if (!scansci) return false;
      const nextAuthRequired = scansci.status === 'unavailable' && scansci.code === 'auth_required';
      const transitioned = nextAuthRequired && !authRequired;
      authRequired = nextAuthRequired;
      return transitioned;
    },
  };
}

export async function executeSourceRetrieval(
  rawPayload: unknown,
  runtime: RetrievalRuntime,
  context: { institutionalSubjectId?: string } = {},
): Promise<{ sources: PersistedRetrievalSource[]; providers: Array<{ provider: string; status: string; code?: string }> }> {
  const payload: SourceRetrievePayload = parseSourceRetrievePayload(rawPayload);
  const sources: PersistedRetrievalSource[] = [];
  const providers: Array<{ provider: string; status: string; code?: string }> = [];
  for (const provider of payload.providers) {
    if (provider === 'scansci') continue;
    const result = await runtime[provider === 'semantic_scholar' ? 'semanticScholar' : 'tavily']
      .search({ query: payload.query, limit: payload.limit });
    if (result.status === 'unavailable') {
      providers.push({ provider, status: 'unavailable', code: result.code });
      continue;
    }
    providers.push({ provider, status: 'succeeded' });
    for (const source of result.sources) {
      sources.push(await runtime.persist({
        source,
        rights: decideSourceRights({ provider: source.provider, sourceUrl: source.sourceUrl, access: source.access }),
      }));
    }
  }
  if (payload.providers.includes('scansci')) {
    if (!payload.includeFullText || !payload.identifier) {
      providers.push({ provider: 'scansci', status: 'disabled' });
    } else {
      if (!context.institutionalSubjectId) throw new Error('[blocked] ScanSci subject binding is unavailable');
      const result = await runtime.scansci.acquire({ identifier: payload.identifier, subjectId: context.institutionalSubjectId });
      if (result.status === 'succeeded') await runtime.observeScanSci?.('succeeded');
      else if (result.status === 'unavailable' && result.code === 'auth_required') await runtime.observeScanSci?.('auth_required');
      if (result.status !== 'succeeded') {
        providers.push({ provider: 'scansci', status: result.status, code: result.code });
      } else {
        const source: NormalizedExternalSource = {
          provider: 'scansci',
          providerRecordId: payload.identifier.toLowerCase(),
          title: payload.identifier,
          sourceUrl: result.sourceUrl,
          authors: [],
          identifiers: payload.identifier.toLowerCase().startsWith('10.')
            ? { doi: payload.identifier }
            : { arxiv: payload.identifier.replace(/^arxiv:/i, '') },
          access: result.access,
        };
        const rights = decideSourceRights({ provider: 'scansci', sourceUrl: source.sourceUrl, access: source.access });
        if (!rights.cacheAllowed) {
          providers.push({ provider: 'scansci', status: 'blocked', code: rights.reasonCode });
        } else {
          sources.push(await runtime.persist({ source, rights, fullText: result }));
          providers.push({ provider: 'scansci', status: 'succeeded' });
        }
      }
    }
  }
  return { sources, providers };
}

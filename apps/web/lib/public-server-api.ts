import type { PublicEvidenceSource, PublicResearchVersion } from './api';
import type { EditorialCollectionApi, ResearchIndexPageApi } from './api';
import type { JournalPublic, JournalSummary, PublicJournalArticle } from './journal-api';

export class PublicServerApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function serverApiOrigin() {
  return (process.env.API_ORIGIN ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
}

async function serverRequest<T>(path: string, timeoutMs?: number): Promise<T> {
  const response = await fetch(`${serverApiOrigin()}${path}`, { cache: 'no-store', ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
  if (!response.ok) throw new PublicServerApiError(response.status, `Public API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function getServerPublicResearchVersion(publicId: string, versionNo: number) {
  return serverRequest<{ research: PublicResearchVersion }>(`/research/${encodeURIComponent(publicId)}/v/${versionNo}`);
}

export function getServerPublicEvidenceSource(publicId: string, versionNo: number, evidenceId: string) {
  return serverRequest<PublicEvidenceSource>(
    `/research/${encodeURIComponent(publicId)}/v/${versionNo}/evidence/${encodeURIComponent(evidenceId)}/source`,
  );
}

export function getLatestPublicResearchVersion(publicId: string) {
  return serverRequest<{ research: PublicResearchVersion }>(`/research/${encodeURIComponent(publicId)}`);
}

export function getPublicEditorialCollection(slug: string) {
  return serverRequest<{ collection: EditorialCollectionApi }>(`/editorial/collections/${encodeURIComponent(slug)}`);
}

export function getServerResearchIndex(limit = 20) {
  return serverRequest<ResearchIndexPageApi>(`/explore?limit=${limit}`, 8000);
}

export function getServerPublicJournal(slug: string) {
  return serverRequest<{ journal: JournalPublic }>(`/journals/${encodeURIComponent(slug)}`);
}
export function getServerPublicJournals(cursor?: string, limit = 20) { return serverRequest<{ items: JournalSummary[]; nextCursor: string | null }>(`/journals?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); }
export function getServerPublicJournalArticles(id: string, cursor?: string, limit = 20) { return serverRequest<{ items: PublicJournalArticle[]; nextCursor: string | null }>(`/journals/${encodeURIComponent(id)}/articles?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); }

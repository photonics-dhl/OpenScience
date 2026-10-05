import type { PublicPaperIdentity } from '@openscience/domain';
import { apiRequest } from './api';

export interface WorkspacePaperLookup {
  doi: string;
  existing: { type: 'journal_article' | 'research_object'; id: string; url: string } | null;
  publicPaper: PublicPaperIdentity | null;
}

export function lookupWorkspacePaper(workspaceId: string, doi: string) {
  const params = new URLSearchParams({ workspaceId, doi });
  return apiRequest<WorkspacePaperLookup>(`/api/papers/lookup?${params}`);
}

export function setResearchObjectDoi(id: string, expectedVersion: number, doi: string | null) {
  return apiRequest<{ researchObjectId: string; doi: string | null; version: number }>(`/api/research-objects/${encodeURIComponent(id)}/original-doi`, {
    method: 'PATCH', body: JSON.stringify({ doi, expectedVersion }),
  });
}

export function paperDoiPath(doi: string) {
  return `/papers/doi/${doi.split('/').map(encodeURIComponent).join('/')}`;
}

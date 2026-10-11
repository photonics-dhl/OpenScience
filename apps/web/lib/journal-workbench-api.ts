import { apiRequest } from './api';
import type { JournalArticle } from './journal-api';
import { collectAllPages } from './journal-workbench-model';
export type WorkbenchArticle = JournalArticle & { draftArchived: boolean; processingCompleted: boolean; publicInterpretation: boolean };
export function getJournalAccess() { return apiRequest<{ canReviewJournals: boolean }>('/api/journals/access'); }
export function listWorkbenchArticles(journalId: string, signal?: AbortSignal): Promise<WorkbenchArticle[]> {
  return collectAllPages((cursor) => apiRequest<{ items: WorkbenchArticle[]; nextCursor: string | null }>(
    `/api/journals/${encodeURIComponent(journalId)}/workbench-articles?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal },
  ), { signal });
}
export function deleteWorkingDraft(journalId: string, articleId: string, revision: number) {
  return apiRequest(`/api/journals/${encodeURIComponent(journalId)}/articles/${encodeURIComponent(articleId)}/draft`, { method: 'DELETE', body: JSON.stringify({ revision }) });
}
export function restoreWorkingDraft(journalId: string, articleId: string, revision: number) {
  return apiRequest(`/api/journals/${encodeURIComponent(journalId)}/articles/${encodeURIComponent(articleId)}/draft/restore`, { method: 'POST', body: JSON.stringify({ revision }) });
}

/** UI policy only; server authorization remains authoritative. */
export type WorkbenchView = 'drafts' | 'processing' | 'review' | 'completed' | 'published' | 'archived';
export type AccessFilter = 'all' | 'open' | 'closed' | 'unknown';
export type DirectorySort = 'az' | 'paper_count' | 'citation_count';
export interface DirectoryRecord {
  id: string; nameZh?: string | null; nameEn?: string | null; publisherName?: string | null;
  subjects: string[]; pIssn?: string | null; eIssn?: string | null; publicArticleCount: number;
  openAccess?: boolean | null; citationCount?: number | null;
}
export interface WorkbenchRecord {
  id: string; revision: number; contentState: string; reviewState: string;
  draftArchived?: boolean; processingCompleted?: boolean; publicInterpretation?: boolean;
  jobs: Array<{ state?: string; status?: string }>;
  releases: Array<{ versionNo: number; publishedAt: string; revision?: number }>;
}
export const WORKBENCH_VIEWS: WorkbenchView[] = ['drafts', 'processing', 'review', 'completed', 'published', 'archived'];
export const ACTIVE_JOB_STATES = ['staging', 'pending', 'running'];
export function isProcessing(article: WorkbenchRecord): boolean {
  return article.jobs.some((job) => ACTIVE_JOB_STATES.includes(job.state ?? job.status ?? ''));
}
export function isPublicInterpretation(article: WorkbenchRecord): boolean {
  return article.publicInterpretation ?? (article.contentState === 'active' && article.releases.length > 0);
}
export function isCompleted(article: WorkbenchRecord): boolean {
  return article.processingCompleted ?? article.jobs.some((job) => (job.state ?? job.status) === 'succeeded');
}
export function matchesWorkbenchView(article: WorkbenchRecord, view: WorkbenchView): boolean {
  if (view === 'archived') return article.draftArchived === true;
  if (view === 'published') return isPublicInterpretation(article);
  if (view === 'completed') return isCompleted(article);
  if (article.draftArchived || article.contentState !== 'active') return false;
  if (view === 'processing') return isProcessing(article);
  if (view === 'review') return !isProcessing(article) && ['submitted', 'approved'].includes(article.reviewState) && !article.releases.some((release) => release.revision === article.revision);
  return !isProcessing(article) && !['submitted', 'approved'].includes(article.reviewState) && (!article.releases.length || article.releases.every((release) => release.revision !== undefined && release.revision !== article.revision));
}
export function canDeleteDraft(article: WorkbenchRecord, role: string): boolean {
  return ['owner', 'admin', 'editor'].includes(role) && article.contentState === 'active' &&
    !article.draftArchived && !isProcessing(article) &&
    article.releases.every((release) => release.revision !== undefined && release.revision !== article.revision) &&
    !['submitted', 'approved'].includes(article.reviewState);
}
/** Legacy records may omit either name. The fallback is a label, never saved metadata. */
export function directoryName(journal: DirectoryRecord): string { return journal.nameEn?.trim() || journal.nameZh?.trim() || 'Unnamed journal'; }
export function selectDirectory<T extends DirectoryRecord>(items: T[], input: { query: string; subject: string; access: AccessFilter; sort: DirectorySort }): T[] {
  const term = input.query.trim().toLocaleLowerCase();
  const normalizedIssn = term.replace(/-/g, '');
  const result = items.filter((journal) => {
    if (input.subject && !journal.subjects.includes(input.subject)) return false;
    if (input.access === 'open' && journal.openAccess !== true) return false;
    if (input.access === 'closed' && journal.openAccess !== false) return false;
    if (input.access === 'unknown' && typeof journal.openAccess === 'boolean') return false;
    const text = [journal.nameZh, journal.nameEn, journal.publisherName, ...journal.subjects].filter(Boolean).join(' ').toLocaleLowerCase();
    const issns = [journal.pIssn, journal.eIssn].filter((value): value is string => !!value);
    return !term || text.includes(term) || issns.some((issn) => issn.replace(/-/g, '').toLocaleLowerCase().includes(normalizedIssn));
  });
  return result.sort((left, right) => {
    let metric = 0;
    if (input.sort === 'paper_count') metric = right.publicArticleCount - left.publicArticleCount;
    if (input.sort === 'citation_count') metric = (right.citationCount ?? -1) - (left.citationCount ?? -1);
    return metric || directoryName(left).localeCompare(directoryName(right), ['en', 'zh'], { numeric: true, sensitivity: 'base' }) || left.id.localeCompare(right.id);
  });
}
/** Do not present a partially loaded list as globally filtered or counted. */
export async function collectAllPages<T extends { id: string }>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>, options: { signal?: AbortSignal; maxPages?: number } = {}): Promise<T[]> {
  const collected = new Map<string, T>(); const visited = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < (options.maxPages ?? 100); page += 1) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await fetchPage(cursor);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    result.items.forEach((item) => collected.set(item.id, item));
    if (!result.nextCursor) return [...collected.values()];
    if (visited.has(result.nextCursor)) throw new Error('分页游标重复，未显示不完整的结果。请刷新重试。');
    visited.add(result.nextCursor); cursor = result.nextCursor;
  }
  throw new Error('结果超过当前工作台加载上限，未显示不完整统计。请联系管理员。');
}
export function safePublicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function shouldOfferHomepageActivation(journal: { homepagePublished: boolean; status: string }): boolean { return !journal.homepagePublished && journal.status === 'active'; }

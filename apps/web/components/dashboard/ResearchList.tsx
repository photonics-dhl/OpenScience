'use client';

import Link from 'next/link';
import { ArrowRight, FileText, MoreHorizontal, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { TrashActionButton } from '@/components/research/TrashActionButton';
import { useSession } from '@/components/auth/SessionProvider';
import type { HermesRailTask } from '@/components/hermes/HermesRail';
import { hermesTaskHref, isActionableHermesTask, selectPriorityHermesTask } from '@/components/hermes/hermes-state';
import { listVersions, listMyWorkspaces, searchResearchObjects, type ResearchObjectSearchApi, type VersionSummary, type WorkspaceApi } from '@/lib/api';
import { getDashboardPageCopy } from '@/lib/dashboard-page-copy';
import styles from '@/app/dashboard/dashboard.module.css';

export interface DashboardResearch {
  id: string;
  publicId: string;
  title: string;
  versionNo: number;
  status: string;
  pendingCount: number;
  createdAt?: string;
  updatedAt?: string;
  visibility?: string;
  workspaceId?: string;
}

export interface ResearchListProps {
  researchObjects: DashboardResearch[];
  ownerId?: string;
  onChanged?(): void;
}

export interface DashboardVersionMetadata {
  latest?: VersionSummary;
  privateDraft?: VersionSummary;
  publication?: VersionSummary;
  published?: VersionSummary;
}
type VersionState = { scope: string; metadata?: DashboardVersionMetadata; failed?: boolean };
export type DashboardResearchFilter = 'all' | 'private' | 'published';

export function summarizeDashboardVersions(versions: readonly VersionSummary[]): DashboardVersionMetadata {
  const ordered = versions.filter(version => Number.isInteger(version.versionNo) && version.versionNo > 0)
    .slice().sort((left, right) => right.versionNo - left.versionNo);
  const latest = ordered[0];
  const publication = ordered.filter(version => Number.isInteger(version.publicationNo) && (version.publicationNo ?? 0) > 0)
    .sort((left, right) => right.publicationNo! - left.publicationNo!)[0];
  return {
    latest,
    privateDraft: latest?.status === 'draft' && latest.publicationNo == null ? latest : undefined,
    publication,
    published: publication && ['published', 'revised'].includes(publication.status) ? publication : undefined,
  };
}

export function dashboardPublicationHref(research: Pick<DashboardResearch, 'publicId'>, metadata?: DashboardVersionMetadata): string | undefined {
  const publication = metadata?.published;
  if (!research.publicId || research.publicId.startsWith('DRAFT-') || !publication) return;
  return `/research/${encodeURIComponent(research.publicId)}/v/${publication.publicationNo}`;
}

export function filterDashboardResearch(research: readonly DashboardResearch[], filter: DashboardResearchFilter,
  metadata: Readonly<Record<string, DashboardVersionMetadata | undefined>>): DashboardResearch[] {
  return research.filter(item => {
    if (filter === 'all') return true;
    const version = metadata[item.id];
    if (filter === 'published') return Boolean(version?.published);
    return Boolean(version && (version.privateDraft
      || (!version.latest && item.visibility === 'private' && item.status === 'draft')));
  });
}

export function formatDashboardUpdate(value: string | undefined, locale: string): { dateTime: string; label: string } | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return { dateTime: date.toISOString(), label: new Intl.DateTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en',
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date) };
}

function versionScope(ownerId: string, research: DashboardResearch) {
  // Object revision invalidates metadata; it is never used as a publication number.
  return JSON.stringify([ownerId, research.id, research.versionNo, research.updatedAt ?? '']);
}

export async function loadDashboardVersionMetadata(rows: readonly { id: string; scope: string }[],
  isCurrent: () => boolean, onResult: (id: string, state: VersionState) => void, options: { fresh?: boolean } = {}): Promise<void> {
  let next = 0;
  async function loadNext() {
    while (isCurrent() && next < rows.length) {
      const row = rows[next++]!;
      try {
        const result = await listVersions(row.id, options);
        if (!isCurrent()) return;
        onResult(row.id, { scope: row.scope, metadata: summarizeDashboardVersions(result.versions) });
      } catch {
        if (!isCurrent()) return;
        onResult(row.id, { scope: row.scope, failed: true });
      }
    }
  }
  await Promise.all([loadNext(), loadNext()]);
}

function useDashboardVersions(ownerId: string, research: readonly DashboardResearch[], contextKey: string, retry: number, delay = 0, fresh = false) {
  const rowsKey = JSON.stringify(research.map(item => ({ id: item.id, scope: versionScope(ownerId, item) })));
  const requestKey = JSON.stringify([ownerId, rowsKey, contextKey, retry]);
  const currentRequest = useRef(requestKey); currentRequest.current = requestKey;
  const [states, setStates] = useState<Record<string, VersionState>>({});
  const stateRef = useRef(states); stateRef.current = states;
  const lastRetry = useRef(retry);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const rows = JSON.parse(rowsKey) as Array<{ id: string; scope: string }>;
    const retryFailed = lastRetry.current !== retry;
    lastRetry.current = retry;
    // View state only retains the current result set, bounded by the existing API's 20-row limit.
    const retained: Record<string, VersionState> = {};
    for (const row of rows) {
      const existing = stateRef.current[row.id];
      if (existing?.scope === row.scope && !(retryFailed && existing.failed)) retained[row.id] = existing;
    }
    stateRef.current = retained;
    setStates(retained);
    const pending = rows.filter(row => !retained[row.id]);
    const stillCurrent = () => active && currentRequest.current === requestKey;
    // The current card starts immediately; list enrichment is nonblocking and limited to two reads.
    const timer = window.setTimeout(() => {
      void loadDashboardVersionMetadata(pending, stillCurrent, (id, state) => {
        setStates(current => ({ ...current, [id]: state }));
      }, { fresh: fresh || retryFailed });
    }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [ownerId, rowsKey, requestKey, retry, delay, fresh]);
  return states;
}

function VersionLabels({ state, locale }: { state?: VersionState; locale: string }) {
  const t = useTranslations('dashboard');
  const copy = getDashboardPageCopy(locale);
  if (state?.failed) return <span>{copy.versionUnavailable}</span>;
  if (!state?.metadata) return <span aria-busy="true">{copy.versionLoading}</span>;
  const { latest, privateDraft, published, publication } = state.metadata;
  return <>
    {privateDraft ? <span data-private-draft="true">{publication ? copy.workingDraft : copy.privateDraft}</span> : null}
    {published ? <span>{copy.publishedVersion.replace('{version}', String(published.publicationNo))}</span> : null}
    {publication && !published ? <span>{['withdrawn', 'restricted'].includes(publication.status) ? t(`research.status.${publication.status}`) : copy.versionUnavailable}</span> : null}
    {latest && !privateDraft && !['published', 'revised'].includes(latest.status)
      && latest.versionId !== publication?.versionId
      ? <span>{['withdrawn', 'restricted'].includes(latest.status) ? t(`research.status.${latest.status}`) : copy.versionUnavailable}</span> : null}
    {!latest ? <span>{copy.noSavedVersion}</span> : null}
    {latest && ['published', 'revised'].includes(latest.status) && !published ? <span>{copy.versionUnavailable}</span> : null}
  </>;
}

export function CurrentResearchCard({ research, ownerId, tasks = [], taskLoadState = 'ready' }: {
  research: DashboardResearch;
  ownerId: string;
  tasks?: HermesRailTask[];
  taskLoadState?: 'loading' | 'ready' | 'unavailable';
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const copy = getDashboardPageCopy(locale);
  const session = useSession();
  const authorized = session.status === 'authenticated' && session.user?.userId === ownerId;
  const [retry, setRetry] = useState(0);
  const states = useDashboardVersions(authorized ? ownerId : '', [research], 'current', retry, 0, true);
  if (!authorized) return null;
  const state = states[research.id]?.scope === versionScope(ownerId, research) ? states[research.id] : undefined;
  const publicHref = dashboardPublicationHref(research, state?.metadata);
  const update = formatDashboardUpdate(research.updatedAt, locale);
  const task = selectPriorityHermesTask(tasks.filter(candidate => candidate.researchObjectId === research.id && isActionableHermesTask(candidate)));
  const review = task?.state === 'needs_review';
  const failed = task?.state.startsWith('failed_');
  const processing = task && ['queued', 'uploading', 'parsing', 'stored'].includes(task.state);
  const href = task ? hermesTaskHref(task) : `/research-objects/${encodeURIComponent(research.id)}/${research.pendingCount > 0 ? 'hermes' : 'edit'}`;
  const taskStateKey = review ? 'needsReview' : task?.state === 'failed_retryable' ? 'failedRetryable' : failed ? 'failedBlocked' : task?.state;

  return <article className={styles.currentResearch} aria-labelledby="current-research-title" data-current-research={research.id} data-hermes-protected="true">
    <header className={styles.currentHeader}>
      <p className={styles.currentKicker}>{copy.currentResearch}</p>
      <h2 id="current-research-title" className={styles.currentTitle}>{research.title}</h2>
      <div className={styles.currentMeta} data-version-state={state?.failed ? 'unavailable' : state?.metadata ? 'ready' : 'loading'}>
        <VersionLabels state={state} locale={locale} />
        {state?.failed ? <button type="button" onClick={() => setRetry(value => value + 1)}>{copy.retry}</button> : null}
      </div>
      <p className={styles.currentSummary}>{copy.currentDescription}</p>
      {update ? <p className={styles.currentMeta}>{copy.updated} <time dateTime={update.dateTime}>{update.label}</time></p> : null}
      {taskStateKey ? <p role="status" data-task-state={task?.state}>{t(`hermes.taskStates.${taskStateKey}`)}</p>
        : taskLoadState !== 'ready' ? <p role="status">{t(`hermes.activity.${taskLoadState}`)}</p> : null}
    </header>
    <div className={styles.currentActions}>
      <Link className={styles.currentContinue} href={href} data-action-priority="primary">{review ? t('continue.review') : failed ? t('continue.recover') : processing ? t('continue.progress') : copy.continueEditing}<ArrowRight size={18} aria-hidden="true" /></Link>
      <Link href={`/research-objects/${encodeURIComponent(research.id)}/overview`}>{copy.overview}</Link>
    </div>
    {publicHref ? <Link className={styles.currentPublicLink} href={publicHref}>{copy.publicVersionLink.replace('{version}', String(state!.metadata!.published!.publicationNo))} ↗</Link> : null}
  </article>;
}

export function ResearchList({ researchObjects, ownerId, onChanged }: ResearchListProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const copy = getDashboardPageCopy(locale);
  const session = useSession();
  const authenticatedOwner = session.status === 'authenticated' ? session.user?.userId ?? '' : '';
  const authorized = ownerId === undefined || authenticatedOwner === ownerId;
  const owner = authorized ? authenticatedOwner : '';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DashboardResearchFilter>('all');
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceOwner, setWorkspaceOwner] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceError, setWorkspaceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [versionRetry, setVersionRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: ResearchObjectSearchApi; failed?: boolean }>();
  const normalizedQuery = query.trim();
  const currentWorkspaces = workspaceOwner === owner ? workspaces : [];
  const currentWorkspaceId = workspaceOwner === owner ? workspaceId : '';
  const queryKey = JSON.stringify([owner, currentWorkspaceId, normalizedQuery, retry]);
  const currentQuery = useRef(queryKey); currentQuery.current = queryKey;

  useEffect(() => {
    if (!owner) return;
    let active = true;
    setWorkspaceError(false);
    setWorkspaces([]);
    void listMyWorkspaces().then(rows => {
      if (!active) return;
      setWorkspaceOwner(owner);
      setWorkspaces(rows);
      setWorkspaceError(rows.length === 0);
      setWorkspaceId(current => rows.some(row => row.id === current)
        ? current : (rows.find(row => row.type === 'personal') ?? rows[0])?.id ?? '');
    }).catch(() => { if (active) { setWorkspaceOwner(owner); setWorkspaceError(true); } });
    return () => { active = false; };
  }, [owner, retry]);

  useEffect(() => {
    if (!owner || !normalizedQuery || !currentWorkspaceId) return;
    setResult(undefined);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchResearchObjects({ workspaceId: currentWorkspaceId, query: normalizedQuery }, controller.signal)
        .then(data => { if (!controller.signal.aborted && currentQuery.current === queryKey) setResult({ key: queryKey, data }); })
        .catch(() => { if (!controller.signal.aborted && currentQuery.current === queryKey) setResult({ key: queryKey, failed: true }); });
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [owner, normalizedQuery, currentWorkspaceId, queryKey]);

  const currentResult = result?.key === queryKey ? result : undefined;
  const searchFailed = Boolean(normalizedQuery && ((workspaceOwner === owner && workspaceError) || currentResult?.failed));
  const searching = Boolean(normalizedQuery && !searchFailed && !currentResult?.data);
  const rows: DashboardResearch[] = !authorized ? [] : !normalizedQuery ? researchObjects
    : (currentResult?.data?.researchObjects ?? []).map(item => ({
      id: item.id, publicId: item.publicId ?? `DRAFT-${item.id.slice(0, 8)}`, title: item.title,
      versionNo: item.version, status: item.status, pendingCount: 0,
      createdAt: item.createdAt, updatedAt: item.updatedAt, workspaceId: item.workspaceId, visibility: item.visibility,
    }));
  const states = useDashboardVersions(owner, rows, queryKey, versionRetry, 120);
  const metadata: Record<string, DashboardVersionMetadata | undefined> = {};
  for (const row of rows) {
    const state = states[row.id];
    if (state?.scope === versionScope(owner, row)) metadata[row.id] = state.metadata;
  }
  const visible = filterDashboardResearch(rows, filter, metadata);
  const filterPending = filter !== 'all' && rows.some(row => states[row.id]?.scope !== versionScope(owner, row));
  const filterUnavailable = filter !== 'all' && rows.some(row => states[row.id]?.scope === versionScope(owner, row) && states[row.id]?.failed);

  return <section className={styles.library} aria-labelledby="research-list-title" data-hermes-protected="true"
    data-surface-state={searchFailed ? 'error' : searching ? 'loading' : visible.length === 0 ? 'empty' : 'ready'}>
    <div className={styles.libraryHeader}>
      <h2 id="research-list-title">{copy.myResearch}</h2>
      <div className={styles.searchControls}>
        {currentWorkspaces.length > 1 ? <label className={styles.searchScope}><span>{t('research.searchScope')}</span>
          <select className={styles.scopeSelect} value={currentWorkspaceId} onChange={event => setWorkspaceId(event.target.value)}>
            {currentWorkspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select></label> : null}
        <label className={styles.searchField}><span className="sr-only">{t('research.search')}</span>
          <Search className={styles.searchIcon} size={16} aria-hidden="true" />
          <Input className={styles.searchInput} type="search" placeholder={copy.searchPlaceholder} value={query} maxLength={120}
            aria-describedby={normalizedQuery ? 'research-search-status' : undefined} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className={styles.libraryFilters} role="group" aria-label={copy.filterLabel}>
          {([['all', copy.filterAll], ['private', copy.filterPrivateDraft], ['published', copy.filterPublished]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>
    </div>
    {normalizedQuery ? <p id="research-search-status" role="status" className={styles.searchFeedback}>
      {searchFailed ? t('research.searchUnavailable') : searching ? t('research.searchLoading') : t(`research.searchMode.${currentResult!.data!.search.mode}`)}
      {searchFailed ? <button type="button" className={styles.textAction} onClick={() => setRetry(value => value + 1)}>{t('errors.retry')}</button> : null}
    </p> : null}
    {filterPending || filterUnavailable ? <p role="status" className={styles.searchFeedback}>{filterPending ? copy.versionLoading : copy.versionUnavailable}
      {filterUnavailable ? <button type="button" onClick={() => setVersionRetry(value => value + 1)}>{copy.retry}</button> : null}
    </p> : null}
    {!searching && !searchFailed && visible.length === 0 && !filterPending && !filterUnavailable ? <p className={styles.libraryEmpty} role="status">
      {filter !== 'all' ? copy.noFilterResults : researchObjects.length === 0 ? t('research.empty') : t('research.noResults')}
    </p> : null}
    {visible.length > 0 ? <>
      <div className={styles.researchRow} aria-hidden="true"><span>{copy.researchColumn}</span><span>{copy.statusColumn}</span><span>{copy.updated}</span><span /></div>
      <ul className={styles.researchList} aria-label={copy.myResearch}>{visible.map(research => {
        const state = states[research.id]?.scope === versionScope(owner, research) ? states[research.id] : undefined;
        const update = formatDashboardUpdate(research.updatedAt, locale);
        return <li key={research.id} className={styles.researchRow}>
          <Link className={styles.researchTitle} href={`/research-objects/${encodeURIComponent(research.id)}/edit`}><FileText size={20} aria-hidden="true" />{research.title}</Link>
          <div className={styles.researchStatus}><VersionLabels state={state} locale={locale} />
            {state?.failed ? <button type="button" onClick={() => setVersionRetry(value => value + 1)}>{copy.retry}</button> : null}
          </div>
          <span className={styles.researchDate}>{update ? <time dateTime={update.dateTime}>{update.label}</time> : copy.dateUnavailable}</span>
          <details className={styles.researchEntryAction}><summary aria-label={t('research.actions', { title: research.title })}><MoreHorizontal size={18} aria-hidden="true" /></summary><div>
            <TrashActionButton kind="research_object" resourceId={research.id} title={research.title} published={!research.publicId.startsWith('DRAFT-')} onDone={() => {
              setRetry(value => value + 1); setVersionRetry(value => value + 1); onChanged?.();
            }} />
          </div></details>
        </li>;
      })}</ul>
    </> : null}
  </section>;
}

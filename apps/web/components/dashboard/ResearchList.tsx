'use client';

import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { TrashActionButton } from '@/components/research/TrashActionButton';
import { listMyWorkspaces, searchResearchObjects, type ResearchObjectSearchApi, type WorkspaceApi } from '@/lib/api';
import styles from '@/app/dashboard/dashboard.module.css';

export interface DashboardResearch {
  id: string;
  publicId: string;
  title: string;
  versionNo: number;
  status: string;
  pendingCount: number;
}

export interface ResearchListProps {
  researchObjects: DashboardResearch[];
  onChanged?(): void;
}

export function ResearchList({ researchObjects, onChanged }: ResearchListProps) {
  const t = useTranslations('dashboard');
  const [query, setQuery] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceError, setWorkspaceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: ResearchObjectSearchApi; failed?: boolean }>();
  const normalizedQuery = query.trim();
  const queryKey = JSON.stringify([workspaceId, normalizedQuery, retry]);

  useEffect(() => {
    let active = true;
    setWorkspaceError(false);
    void listMyWorkspaces().then(rows => {
      if (!active) return;
      setWorkspaces(rows);
      setWorkspaceError(rows.length === 0);
      setWorkspaceId(current => rows.some(row => row.id === current)
        ? current : (rows.find(row => row.type === 'personal') ?? rows[0])?.id ?? '');
    }).catch(() => { if (active) setWorkspaceError(true); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!normalizedQuery || !workspaceId) return;
    setResult(undefined);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchResearchObjects({ workspaceId, query: normalizedQuery }, controller.signal)
        .then(data => { if (!controller.signal.aborted) setResult({ key: queryKey, data }); })
        .catch(() => { if (!controller.signal.aborted) setResult({ key: queryKey, failed: true }); });
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalizedQuery, workspaceId, queryKey]);

  const currentResult = result?.key === queryKey ? result : undefined;
  const searchFailed = Boolean(normalizedQuery && (workspaceError || currentResult?.failed));
  const searching = Boolean(normalizedQuery && !searchFailed && !currentResult?.data);
  const visible: DashboardResearch[] = !normalizedQuery ? researchObjects
    : (currentResult?.data?.researchObjects ?? []).map(item => ({
      id: item.id, publicId: item.publicId ?? `DRAFT-${item.id.slice(0, 8)}`, title: item.title,
      versionNo: item.version, status: item.status, pendingCount: 0,
    }));

  return (
    <section
      className={styles.researchLibrary}
      aria-labelledby="research-list-title"
      data-surface-state={searchFailed ? 'error' : searching ? 'loading' : visible.length === 0 ? 'empty' : 'ready'}
    >
      <div className={styles.libraryHeading}>
        <h2 id="research-list-title" className={styles.libraryTitle}>
          {t('research.title')}
        </h2>
        <div className={styles.searchControls}>
          {workspaces.length > 1 ? (
            <label className={styles.searchScope}>
              <span>{t('research.searchScope')}</span>
              <select className={styles.scopeSelect}
                value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
                {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className={styles.searchField}>
            <span className="sr-only">{t('research.search')}</span>
            <Search className={styles.searchIcon} size={16} aria-hidden="true" />
            <Input
              className={styles.searchInput}
              type="search"
              placeholder={t('research.search')}
              value={query}
              maxLength={120}
              aria-describedby={normalizedQuery ? 'research-search-status' : undefined}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </div>

      {normalizedQuery ? (
        <p id="research-search-status" role="status" className={styles.searchFeedback}>
          {searchFailed ? t('research.searchUnavailable')
            : searching ? t('research.searchLoading')
              : t(`research.searchMode.${currentResult!.data!.search.mode}`)}
          {searchFailed ? <button type="button" className={styles.textAction} onClick={() => setRetry(value => value + 1)}>{t('errors.retry')}</button> : null}
        </p>
      ) : null}
      {!searching && !searchFailed && visible.length === 0 ? (
        <p className={styles.libraryEmpty} role="status">
          {researchObjects.length === 0 ? t('research.empty') : t('research.noResults')}
        </p>
      ) : visible.length > 0 ? (
        <ul className={styles.researchEntries} aria-label={t('research.title')}>
          {visible.map((research) => (
            <li key={research.id} className={styles.researchEntry}>
              <Link
                href={`/research-objects/${encodeURIComponent(research.id)}/edit`}
                className={styles.researchLink}
              >
                <span className={styles.researchEntryCopy}>
                  <span className={styles.researchEntryTitle}>
                    {research.title}
                  </span>
                  <span data-reading-role="caption" className={styles.entryMeta}>
                    <span>{t('research.draftRevision')}</span>
                    <span>{t('research.version', { version: research.versionNo })}</span>
                  </span>
                </span>
                <span data-reading-role="caption" className={styles.entryStatus}>{t(`research.status.${research.status}`)}</span>
                <ArrowRight className={styles.entryArrow} size={18} aria-hidden="true" />
              </Link>
              <div className={styles.researchEntryAction} role="group" aria-label={research.title}>
                <TrashActionButton kind="research_object" resourceId={research.id} title={research.title} published={!research.publicId.startsWith('DRAFT-')} onDone={() => {
                  setRetry(value => value + 1);
                  onChanged?.();
                }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

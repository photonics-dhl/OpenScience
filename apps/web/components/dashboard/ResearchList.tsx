'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { TrashActionButton } from '@/components/research/TrashActionButton';
import { listMyWorkspaces, searchResearchObjects, type ResearchObjectSearchApi, type WorkspaceApi } from '@/lib/api';

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
  const trashT = useTranslations('trash');
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
    <section className="border-t border-os-rule-paper pt-5" aria-labelledby="research-list-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="research-list-title" className="mt-2 text-2xl font-medium text-os-ink">
            {t('research.title')}
          </h2>
        </div>
        <div className="flex w-full flex-col gap-2 sm:max-w-xs">
          {workspaces.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-os-muted-paper">
              <span className="shrink-0">{t('research.searchScope')}</span>
              <select className="min-w-0 flex-1 border-b border-os-rule-paper bg-transparent py-1 text-os-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-os-vermilion-ink"
                value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
                {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="relative block w-full border-b border-os-rule-paper sm:max-w-xs">
            <span className="sr-only">{t('research.search')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-os-muted-paper" aria-hidden="true" />
            <Input
              className="rounded-none border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
              type="search"
              placeholder={t('research.search')}
              value={query}
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </div>

      {normalizedQuery ? (
        <p role="status" className="mt-3 text-sm text-os-muted-paper">
          {searchFailed ? t('research.searchUnavailable')
            : searching ? t('research.searchLoading')
              : t(`research.searchMode.${currentResult!.data!.search.mode}`)}
          {searchFailed ? <button type="button" className="ml-2 underline underline-offset-4" onClick={() => setRetry(value => value + 1)}>{t('errors.retry')}</button> : null}
        </p>
      ) : null}
      {!searching && !searchFailed && visible.length === 0 ? (
        <p className="mt-6 border-y border-os-rule-paper px-4 py-7 text-center text-sm text-os-muted-paper">
          {researchObjects.length === 0 ? t('research.empty') : t('research.noResults')}
        </p>
      ) : visible.length > 0 ? (
        <ul className="mt-5 list-none divide-y divide-os-rule-paper border-y border-os-rule-paper p-0" aria-label={t('research.title')}>
          {visible.map((research) => (
            <li key={research.id} className="flex items-center gap-3">
              <Link
                href={`/research-objects/${encodeURIComponent(research.id)}/edit`}
                className="group grid min-h-14 min-w-0 flex-1 gap-2 px-1 py-4 outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-os-ink group-hover:text-os-vermilion-ink">
                    {research.title}
                  </span>
                  <span data-reading-role="caption" className="mt-1 block font-data text-os-muted-paper">
                    {trashT('privateDraft')}
                  </span>
                </span>
                <span data-reading-role="caption" className="font-data text-os-muted-paper">
                  {t(`research.status.${research.status}`)}
                </span>
              </Link>
              <TrashActionButton kind="research_object" resourceId={research.id} title={research.title} published={!research.publicId.startsWith('DRAFT-')} onDone={() => {
                setRetry(value => value + 1);
                onChanged?.();
              }} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

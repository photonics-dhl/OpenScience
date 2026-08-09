'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';

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
}

export function ResearchList({ researchObjects }: ResearchListProps) {
  const t = useTranslations('dashboard');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return researchObjects;
    return researchObjects.filter((research) =>
      `${research.title} ${research.publicId}`.toLocaleLowerCase().includes(normalized),
    );
  }, [query, researchObjects]);

  return (
    <section className="rounded-card border border-white/10 bg-workbench-surface p-5 sm:p-6" aria-labelledby="research-list-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-workbench-muted">
            Research objects
          </p>
          <h2 id="research-list-title" className="mt-1 text-xl font-semibold text-workbench-text">
            {t('research.title')}
          </h2>
        </div>
        {researchObjects.length > 0 ? (
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">{t('research.search')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-workbench-muted" aria-hidden="true" />
            <Input
              className="pl-9"
              type="search"
              placeholder={t('research.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-control border border-dashed border-white/15 bg-workbench-bg px-4 py-7 text-center text-sm text-workbench-muted">
          {researchObjects.length === 0 ? t('research.empty') : t('research.noResults')}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-white/10" aria-label={t('research.title')}>
          {visible.map((research) => (
            <li key={research.id}>
              <Link
                href={`/research-objects/${research.id}/edit`}
                className="group grid gap-2 px-1 py-4 outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-workbench-text group-hover:text-accent-primary">
                    {research.title}
                  </span>
                  <span className="mt-1 block text-xs text-workbench-muted">
                    {research.publicId} · {t('research.version', { version: research.versionNo })}
                  </span>
                </span>
                <span className="text-sm text-workbench-muted">
                  {t(`research.status.${research.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

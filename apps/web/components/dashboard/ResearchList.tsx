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
    <section className="border-t border-os-rule-dark pt-5" aria-labelledby="research-list-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p data-reading-role="caption" className="font-mono uppercase tracking-[0.1em] text-os-muted-dark">
            Index / Research objects
          </p>
          <h2 id="research-list-title" className="mt-2 text-xl font-medium text-os-paper">
            {t('research.title')}
          </h2>
        </div>
        {researchObjects.length > 0 ? (
          <label className="relative block w-full border-b border-os-rule-dark sm:max-w-xs">
            <span className="sr-only">{t('research.search')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-workbench-muted" aria-hidden="true" />
            <Input
              className="rounded-none border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
              type="search"
              placeholder={t('research.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 border-y border-os-rule-dark px-4 py-7 text-center text-sm text-os-muted-dark">
          {researchObjects.length === 0 ? t('research.empty') : t('research.noResults')}
        </p>
      ) : (
        <ul className="mt-5 list-none divide-y divide-os-rule-dark border-y border-os-rule-dark p-0" aria-label={t('research.title')}>
          {visible.map((research) => (
            <li key={research.id}>
              <Link
                href={`/research-objects/${research.id}/edit`}
                className="group grid gap-2 px-1 py-4 outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center focus-visible:ring-2 focus-visible:ring-os-vermilion"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-os-paper group-hover:text-os-vermilion">
                    {research.title}
                  </span>
                  <span data-reading-role="caption" className="mt-1 block font-mono text-os-muted-dark">
                    {research.publicId} · {t('research.version', { version: research.versionNo })}
                  </span>
                </span>
                <span data-reading-role="caption" className="font-mono uppercase tracking-[0.06em] text-os-muted-dark">
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

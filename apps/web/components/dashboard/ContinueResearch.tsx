'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { DashboardResearch } from './ResearchList';
import type { HermesRailTask } from '@/components/hermes/HermesRail';
import { hermesTaskHref } from '@/components/hermes/hermes-state';

export interface ContinueResearchProps {
  research: DashboardResearch | null;
  tasks?: HermesRailTask[];
}

export function ContinueResearch({ research, tasks = [] }: ContinueResearchProps) {
  const t = useTranslations('dashboard');

  if (!research) {
    return (
      <section
        aria-labelledby="continue-title"
        className="surface-folio-sheet border-y border-os-rule-paper px-5 py-6 sm:px-7 sm:py-8"
        data-hermes-protected="true"
      >
        <p data-reading-role="caption" className="text-os-vermilion-ink">00 / {t('continue.title')}</p>
        <h2 id="continue-title" className="mt-4 max-w-2xl text-3xl leading-tight text-os-ink sm:text-4xl">
          {t('continue.emptyTitle')}
        </h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-os-muted-paper">
          {t('continue.emptyBody')}
        </p>
        <Link className="mt-7 inline-flex items-center border-b border-os-vermilion-ink pb-1 text-sm font-semibold text-os-ink outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink" href="/research-objects/new?mode=import">
            {t('import.upload')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const review = tasks.find((task) => task.researchObjectId === research.id && task.state === 'needs_review');
  const href = review ? hermesTaskHref(review)
    : `/research-objects/${encodeURIComponent(research.id)}/${research.pendingCount > 0 ? 'hermes' : 'edit'}`;
  return (
    <section
      className="group surface-folio-sheet border-y border-os-rule-paper px-5 py-6 sm:px-7 sm:py-8"
      aria-labelledby="continue-title"
      data-continuation-priority="primary"
      data-hermes-protected="true"
    >
      <p data-reading-role="caption" className="text-os-vermilion-ink">
        00 / {t('continue.title')}
      </p>
      <h2 id="continue-title" className="mt-4 max-w-3xl text-3xl leading-[1.1] text-os-ink transition-colors group-hover:text-os-vermilion-ink sm:text-4xl">
        {research.title}
      </h2>
      <div data-reading-role="caption" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-data text-os-muted-paper">
        <span>{research.publicId}</span>
        <span>{t('continue.version', { version: research.versionNo })}</span>
        {research.pendingCount > 0 ? (
          <span className="text-os-vermilion-ink">
            {t('continue.pending', { count: research.pendingCount })}
          </span>
        ) : null}
      </div>
      <Link className="mt-7 inline-flex items-center border-b border-os-vermilion-ink pb-1 text-sm font-semibold text-os-ink outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink" href={href}>
          {review ? t('hermes.review') : t('continue.open')}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

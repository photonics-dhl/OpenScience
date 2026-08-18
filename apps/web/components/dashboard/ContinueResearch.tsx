'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { DashboardResearch } from './ResearchList';

export interface ContinueResearchProps {
  research: DashboardResearch | null;
}

export function ContinueResearch({ research }: ContinueResearchProps) {
  const t = useTranslations('dashboard');

  if (!research) {
    return (
      <section className="border-y border-os-rule-dark py-6 sm:py-8" aria-labelledby="continue-title">
        <p data-reading-role="caption" className="font-mono uppercase tracking-[0.1em] text-os-vermilion">00 / {t('continue.title')}</p>
        <h2 id="continue-title" className="mt-5 max-w-2xl font-editorial text-3xl leading-tight text-os-paper sm:text-5xl">
          {t('continue.emptyTitle')}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-os-muted-dark">
          {t('continue.emptyBody')}
        </p>
        <Link className="mt-7 inline-flex items-center border-b border-os-vermilion pb-1 text-sm font-semibold text-os-paper outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion" href="/research-objects/new?mode=import">
            {t('import.upload')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <section
      className="group border-y border-os-rule-dark py-6 sm:py-8"
      aria-labelledby="continue-title"
      data-continuation-priority="primary"
    >
      <p data-reading-role="caption" className="font-mono uppercase tracking-[0.1em] text-os-vermilion">
        00 / {t('continue.title')}
      </p>
      <h2 id="continue-title" className="mt-5 max-w-3xl font-editorial text-3xl leading-[1.04] text-os-paper transition-colors group-hover:text-white sm:text-5xl">
        {research.title}
      </h2>
      <div data-reading-role="caption" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono uppercase tracking-[0.06em] text-os-muted-dark">
        <span>{research.publicId}</span>
        <span>{t('continue.version', { version: research.versionNo })}</span>
        {research.pendingCount > 0 ? (
          <span className="text-os-vermilion">
            {t('continue.pending', { count: research.pendingCount })}
          </span>
        ) : null}
      </div>
      <Link className="mt-7 inline-flex items-center border-b border-os-vermilion pb-1 text-sm font-semibold text-os-paper outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion" href={`/research-objects/${research.id}/edit`}>
          {t('continue.open')}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

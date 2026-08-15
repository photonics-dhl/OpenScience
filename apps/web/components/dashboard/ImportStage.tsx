'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


export interface ImportStageProps {
  compact?: boolean;
}

export function ImportStage({ compact = false }: ImportStageProps) {
  const t = useTranslations('dashboard');

  return (
    <section className="border-t border-os-rule-dark pt-5" aria-labelledby="import-stage-title">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-os-muted-dark">
        {t('import.eyebrow')}
      </p>
      <h2 id="import-stage-title" className="mt-2 text-xl font-medium text-os-paper">
        {t('import.title')}
      </h2>
      {!compact ? (
        <p className="mt-2 max-w-lg text-sm leading-6 text-os-muted-dark">
          {t('import.description')}
        </p>
      ) : null}
      <nav className="mt-5 grid border-y border-os-rule-dark sm:grid-cols-2 sm:divide-x sm:divide-os-rule-dark" aria-label={t('import.title')}>
          <Link className="group flex items-center justify-between px-1 py-4 text-sm font-medium text-os-paper outline-none hover:text-os-vermilion focus-visible:ring-2 focus-visible:ring-os-vermilion sm:pr-5" href="/research-objects/new?mode=import" data-action-priority="primary">
            {t('import.upload')}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
          </Link>
          <Link className="group flex items-center justify-between px-1 py-4 text-sm font-medium text-os-paper outline-none hover:text-os-vermilion focus-visible:ring-2 focus-visible:ring-os-vermilion sm:pl-5" href="/research-objects/new?mode=blank" data-action-priority="primary">
            {t('import.blank')}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
          </Link>
      </nav>
    </section>
  );
}

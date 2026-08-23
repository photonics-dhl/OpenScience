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
    <section
      aria-labelledby="import-stage-title"
      className="border-t border-os-rule-dark pt-5"
      data-hermes-protected="true"
    >
      <p data-reading-role="caption" className="font-mono uppercase tracking-[0.12em] text-os-muted-dark">
        {t('import.eyebrow')}
      </p>
      <h2 id="import-stage-title" className="mt-2 text-xl font-medium text-os-paper">
        {t('import.title')}
      </h2>
      {!compact ? (
        <p data-reading-role="reading" className="mt-2 max-w-lg text-[1.0625rem] leading-[var(--leading-reading)] text-os-muted-dark">
          {t('import.description')}
        </p>
      ) : null}
      <nav className="mt-5 grid border-y border-os-rule-dark sm:grid-cols-2 sm:divide-x sm:divide-os-rule-dark" aria-label={t('import.title')}>
          <Link className="group flex items-center justify-between px-1 py-4 text-sm font-medium text-os-paper outline-none hover:text-os-vermilion focus-visible:ring-2 focus-visible:ring-os-vermilion sm:pr-5" data-reading-role="control" href="/research-objects/new?mode=import" data-action-priority="primary">
            {t('import.upload')}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
          </Link>
          <Link className="group flex items-center justify-between px-1 py-4 text-sm font-medium text-os-paper outline-none hover:text-os-vermilion focus-visible:ring-2 focus-visible:ring-os-vermilion sm:pl-5" data-reading-role="control" href="/research-objects/new?mode=blank" data-action-priority="primary">
            {t('import.blank')}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
          </Link>
      </nav>
    </section>
  );
}

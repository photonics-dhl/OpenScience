'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import type { DashboardResearch } from './ResearchList';

export interface ContinueResearchProps {
  research: DashboardResearch | null;
}

export function ContinueResearch({ research }: ContinueResearchProps) {
  const t = useTranslations('dashboard');

  if (!research) {
    return (
      <section className="rounded-card border border-white/10 bg-workbench-surface p-5 sm:p-7" aria-labelledby="continue-title">
        <BookOpen className="h-6 w-6 text-accent-primary" aria-hidden="true" />
        <h2 id="continue-title" className="mt-5 font-display text-2xl font-semibold text-workbench-text">
          {t('continue.emptyTitle')}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-workbench-muted">
          {t('continue.emptyBody')}
        </p>
        <Button className="mt-6" asChild>
          <Link href="/research-objects/new?mode=import">
            {t('import.upload')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <section
      className="rounded-card border border-accent-primary/30 bg-workbench-surface p-5 shadow-card sm:p-7"
      aria-labelledby="continue-title"
      data-continuation-priority="primary"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">
        {t('continue.title')}
      </p>
      <h2 id="continue-title" className="mt-3 font-display text-2xl font-semibold text-workbench-text sm:text-3xl">
        {research.title}
      </h2>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-workbench-muted">
        <span>{research.publicId}</span>
        <span>{t('continue.version', { version: research.versionNo })}</span>
        {research.pendingCount > 0 ? (
          <span className="text-status-warning-bg">
            {t('continue.pending', { count: research.pendingCount })}
          </span>
        ) : null}
      </div>
      <Button className="mt-6" asChild>
        <Link href={`/research-objects/${research.id}/edit`}>
          {t('continue.open')}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

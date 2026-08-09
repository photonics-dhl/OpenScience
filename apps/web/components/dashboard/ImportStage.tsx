'use client';

import Link from 'next/link';
import { FilePlus2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@/components/ui/button';

export interface ImportStageProps {
  compact?: boolean;
}

export function ImportStage({ compact = false }: ImportStageProps) {
  const t = useTranslations('dashboard');

  return (
    <section className="rounded-card border border-white/10 bg-workbench-elevated p-5 sm:p-6" aria-labelledby="import-stage-title">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-workbench-muted">
        {t('import.eyebrow')}
      </p>
      <h2 id="import-stage-title" className="mt-2 text-xl font-semibold text-workbench-text">
        {t('import.title')}
      </h2>
      {!compact ? (
        <p className="mt-2 max-w-lg text-sm leading-6 text-workbench-muted">
          {t('import.description')}
        </p>
      ) : null}
      <nav className="mt-5 grid gap-3 sm:grid-cols-2" aria-label={t('import.title')}>
        <Button className="w-full" size="lg" asChild>
          <Link href="/research-objects/new?mode=import" data-action-priority="primary">
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('import.upload')}
          </Link>
        </Button>
        <Button className="w-full" size="lg" asChild>
          <Link href="/research-objects/new?mode=blank" data-action-priority="primary">
            <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('import.blank')}
          </Link>
        </Button>
      </nav>
    </section>
  );
}

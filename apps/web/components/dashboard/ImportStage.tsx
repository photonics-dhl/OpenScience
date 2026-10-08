'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import styles from '@/app/dashboard/dashboard.module.css';

export interface ImportStageProps {
  compact?: boolean;
}

export function ImportStage({ compact = false }: ImportStageProps) {
  const t = useTranslations('dashboard');

  return (
    <section
      aria-labelledby="import-stage-title"
      className={styles.importStage}
      data-hermes-protected="true"
    >
      <div className={styles.importCopy}>
        <p data-reading-role="caption" className={styles.sectionLabel}>
          {t('import.eyebrow')}
        </p>
        <h2 id="import-stage-title" className={styles.sectionTitle}>
          {t('import.title')}
        </h2>
        {!compact ? (
          <p data-reading-role="reading" className={styles.importDescription}>
            {t('import.description')}
          </p>
        ) : null}
      </div>
      <nav className={styles.createActions} aria-label={t('import.title')}>
        <Link className={styles.createAction} data-reading-role="control" href="/research-objects/new?mode=import" data-action-priority="primary">
          {t('import.upload')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <Link className={styles.createAction} data-reading-role="control" href="/research-objects/new?mode=blank" data-action-priority="secondary">
          {t('import.blank')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </section>
  );
}

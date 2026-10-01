'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { DashboardResearch } from './ResearchList';
import type { HermesRailTask } from '@/components/hermes/HermesRail';
import { hermesTaskHref, isActionableHermesTask, selectPriorityHermesTask } from '@/components/hermes/hermes-state';
import styles from '@/app/dashboard/dashboard.module.css';

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
        className={styles.continuation}
        data-hermes-protected="true"
      >
        <p data-reading-role="caption" className={styles.sectionLabel}>{t('import.eyebrow')}</p>
        <h2 id="continue-title" className={styles.researchTitle}>
          {t('continue.emptyTitle')}
        </h2>
        <p className={styles.continuationBody}>
          {t('continue.emptyBody')}
        </p>
        <nav className={styles.continuationActions} aria-label={t('import.title')}>
          <Link className={styles.continueAction} href="/research-objects/new?mode=import" data-action-priority="primary">
            {t('import.upload')}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link className={styles.textAction} href="/research-objects/new?mode=blank" data-action-priority="primary">
            {t('import.blank')}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </section>
    );
  }

  const researchTasks = tasks.filter((candidate) => candidate.researchObjectId === research.id && isActionableHermesTask(candidate));
  const task = selectPriorityHermesTask(researchTasks);
  const review = task?.state === 'needs_review';
  const failed = task?.state.startsWith('failed_');
  const processing = task && ['queued', 'uploading', 'parsing', 'stored'].includes(task.state);
  const href = task ? hermesTaskHref(task)
    : `/research-objects/${encodeURIComponent(research.id)}/${research.pendingCount > 0 ? 'hermes' : 'edit'}`;
  return (
    <section
      className={styles.continuation}
      aria-labelledby="continue-title"
      data-continuation-priority="primary"
      data-hermes-protected="true"
    >
      <p data-reading-role="caption" className={styles.sectionLabel}>{t('continue.title')}</p>
      <h2 id="continue-title" className={styles.researchTitle}>
        {research.title}
      </h2>
      <div data-reading-role="caption" className={styles.researchMeta}>
        <span className="sr-only">{research.publicId}</span>
        <span>{t('continue.draftRevision')}</span>
        <span>{t('continue.version', { version: research.versionNo })}</span>
        {research.pendingCount > 0 ? (
          <span className={styles.attention}>
            {t('continue.needsAttention', { count: research.pendingCount })}
          </span>
        ) : processing ? <span>{t('continue.background')}</span> : null}
      </div>
      {task?.logicalPath ? <p className={styles.sourcePath}>{task.logicalPath}</p> : null}
      <div className={styles.continuationActions}>
        <Link className={styles.continueAction} href={href}>
          {review ? t('continue.review') : failed ? t('continue.recover') : processing ? t('continue.progress') : t('continue.open')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

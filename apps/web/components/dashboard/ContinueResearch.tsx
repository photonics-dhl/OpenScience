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
        data-surface-state="empty"
        data-hermes-protected="true"
      >
        <div className={styles.continuationHeading}>
          <p data-reading-role="caption" className={styles.sectionLabel}>{t('import.eyebrow')}</p>
          <h2 id="continue-title" className={styles.researchTitle}>
            {t('continue.emptyTitle')}
          </h2>
          <p className={styles.continuationBody}>
            {t('continue.emptyBody')}
          </p>
        </div>
        <div className={styles.continuationNext}>
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
        </div>
      </section>
    );
  }

  const researchTasks = tasks.filter((candidate) => candidate.researchObjectId === research.id && isActionableHermesTask(candidate));
  const task = selectPriorityHermesTask(researchTasks);
  const review = task?.state === 'needs_review';
  const failed = task?.state.startsWith('failed_');
  const processing = task && ['queued', 'uploading', 'parsing', 'stored'].includes(task.state);
  const taskStateKey = review ? 'needsReview'
    : task?.state === 'failed_retryable' ? 'failedRetryable'
      : failed ? 'failedBlocked' : task?.state;
  const href = task ? hermesTaskHref(task)
    : `/research-objects/${encodeURIComponent(research.id)}/${research.pendingCount > 0 ? 'hermes' : 'edit'}`;
  return (
    <section
      className={styles.continuation}
      aria-labelledby="continue-title"
      data-continuation-priority="primary"
      data-surface-state="ready"
      data-hermes-protected="true"
    >
      <div className={styles.continuationHeading}>
        <p data-reading-role="caption" className={styles.sectionLabel}>{t('continue.title')}</p>
        <h2 id="continue-title" className={styles.researchTitle}>
          {research.title}
        </h2>
        <div data-reading-role="caption" className={styles.researchMeta}>
          <span className="sr-only">{research.publicId}</span>
          <span>{t('continue.draftRevision')}</span>
          <span>{t('continue.version', { version: research.versionNo })}</span>
        </div>
      </div>
      <div className={styles.continuationNext} data-task-state={task?.state}>
        {task || research.pendingCount > 0 ? (
          <div className={styles.continuationTask}>
            {taskStateKey ? <p className={styles.taskStatus} role="status">{t(`hermes.taskStates.${taskStateKey}`)}</p> : null}
            {research.pendingCount > 0 ? <p className={styles.attention}>{t('continue.needsAttention', { count: research.pendingCount })}</p> : null}
            {task?.logicalPath ? <p className={styles.sourcePath}>{task.logicalPath}</p> : null}
          </div>
        ) : null}
        <div className={styles.continuationActions}>
          <Link className={styles.continueAction} href={href}>
            {review ? t('continue.review') : failed ? t('continue.recover') : processing ? t('continue.progress') : t('continue.open')}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { hermesTaskHref } from './hermes-state';

const localizedTaskStates: Record<string, 'queued' | 'uploading' | 'parsing' | 'stored' | 'needsReview' | 'failedRetryable' | 'failedBlocked'> = {
  queued: 'queued',
  uploading: 'uploading',
  parsing: 'parsing',
  stored: 'stored',
  needs_review: 'needsReview',
  failed_retryable: 'failedRetryable',
  failed_blocked: 'failedBlocked',
};

export interface HermesRailTask {
  id: string;
  researchObjectId: string;
  researchTitle: string;
  logicalPath: string;
  state: string;
  retryCount: number;
  error: string | null;
}

export function HermesRail({ historyTasks = [], tasks, loadState = 'ready' }: { historyTasks?: HermesRailTask[]; tasks: HermesRailTask[]; loadState?: 'loading' | 'ready' | 'unavailable' }) {
  const t = useTranslations('dashboard');
  const [expanded, setExpanded] = React.useState(false);
  const attentionTasks = tasks.filter((task) => task.state === 'needs_review' || task.state.startsWith('failed_'));
  const backgroundTasks = tasks.filter((task) => task.state !== 'needs_review' && !task.state.startsWith('failed_'));
  const visibleAttention = expanded ? attentionTasks : attentionTasks.slice(0, 3);
  const visibleBackground = expanded ? backgroundTasks : backgroundTasks.slice(0, 2);
  const hiddenCount = tasks.length - visibleAttention.length - visibleBackground.length;

  const taskRow = (task: HermesRailTask) => {
    const stateKey = localizedTaskStates[task.state];
    return (
      <li key={task.id}>
        <Link
          className="group grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
          href={hermesTaskHref(task)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-os-ink group-hover:text-os-vermilion-ink">{task.researchTitle}</span>
            <span data-reading-role="caption" className="mt-1 block truncate text-os-muted-paper">{task.logicalPath}</span>
          </span>
          <span data-reading-role="caption" className="whitespace-nowrap text-os-muted-paper">
            {stateKey ? t(`hermes.taskStates.${stateKey}`) : t('hermes.taskStates.working')}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <aside
      aria-labelledby="hermes-task-title"
      className="border-t border-os-rule-paper pt-5"
      data-hermes-protected="true"
    >
      <div className="flex items-end justify-between gap-4 border-b border-os-rule-paper pb-3">
        <div>
          <p data-reading-role="caption" className="text-os-muted-paper">{t('hermes.activity.eyebrow')}</p>
          <h2 id="hermes-task-title" className="mt-2 text-xl font-medium text-os-ink">{t('hermes.activity.title')}</h2>
        </div>
      </div>

      {loadState !== 'ready' ? <p role="status" className="py-3 text-sm leading-6 text-os-muted-paper">{t(loadState === 'loading' ? 'hermes.activity.loading' : 'hermes.activity.unavailable')}</p> : null}
      {tasks.length === 0 && loadState === 'ready' ? (
        <p className="py-6 text-sm leading-6 text-os-muted-paper">{t('hermes.empty')}</p>
      ) : <>
        {visibleAttention.length > 0 ? <section className="mt-4" aria-labelledby="hermes-attention-title">
          <h3 id="hermes-attention-title" className="text-xs font-semibold tracking-wide text-os-vermilion-ink">{t('hermes.activity.attention')}</h3>
          <ol className="mt-1 list-none divide-y divide-os-rule-paper p-0">{visibleAttention.map(taskRow)}</ol>
        </section> : null}
        {visibleBackground.length > 0 ? <section className="mt-4" aria-labelledby="hermes-background-title">
          <h3 id="hermes-background-title" className="text-xs font-semibold tracking-wide text-os-muted-paper">{t('hermes.activity.background')}</h3>
          <ol className="mt-1 list-none divide-y divide-os-rule-paper p-0">{visibleBackground.map(taskRow)}</ol>
        </section> : null}
        {hiddenCount > 0 || expanded ? <button
          aria-expanded={expanded}
          className="mt-3 min-h-11 border-b border-os-rule-paper text-sm text-os-ink hover:border-os-vermilion-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >{expanded ? t('hermes.showLess') : t('hermes.showMore', { count: hiddenCount })}</button> : null}
      </>}
      {historyTasks.length > 0 ? <details className="mt-5 border-t border-os-rule-paper pt-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-os-muted-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">
          {t('hermes.activity.history', { count: historyTasks.length })}
        </summary>
        <ol className="list-none divide-y divide-os-rule-paper p-0">{historyTasks.map(taskRow)}</ol>
      </details> : null}
    </aside>
  );
}

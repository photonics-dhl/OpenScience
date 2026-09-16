'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { hermesTaskHref, isProcessingHermesTask } from './hermes-state';

const localizedTaskStates: Record<string, 'queued' | 'uploading' | 'parsing'> = {
  queued: 'queued',
  uploading: 'uploading',
  parsing: 'parsing',
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

export function HermesRail({ tasks, loadState = 'ready' }: { tasks: HermesRailTask[]; loadState?: 'loading' | 'ready' | 'unavailable' }) {
  const t = useTranslations('dashboard');
  const [expanded, setExpanded] = React.useState(false);
  const processingTasks = tasks.filter(isProcessingHermesTask);
  const visibleTasks = expanded ? processingTasks : processingTasks.slice(0, 3);
  const hiddenCount = processingTasks.length - visibleTasks.length;

  if (processingTasks.length === 0 && loadState === 'ready') return null;

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
      <h2 id="hermes-task-title" className="border-b border-os-rule-paper pb-3 text-lg font-medium text-os-ink">{t('hermes.activity.title')}</h2>

      {loadState !== 'ready' ? <p role="status" className="py-3 text-sm leading-6 text-os-muted-paper">{t(loadState === 'loading' ? 'hermes.activity.loading' : 'hermes.activity.unavailable')}</p> : null}
      {visibleTasks.length > 0 ? <ol className="mt-1 list-none divide-y divide-os-rule-paper p-0">{visibleTasks.map(taskRow)}</ol> : null}
      {hiddenCount > 0 || expanded ? <button
        aria-expanded={expanded}
        className="mt-3 min-h-11 border-b border-os-rule-paper text-sm text-os-ink hover:border-os-vermilion-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >{expanded ? t('hermes.showLess') : t('hermes.showMore', { count: hiddenCount })}</button> : null}
    </aside>
  );
}

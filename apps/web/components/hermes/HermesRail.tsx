'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { hermesTaskHref } from './hermes-state';

export interface HermesRailTask {
  id: string;
  researchObjectId: string;
  researchTitle: string;
  logicalPath: string;
  state: string;
  retryCount: number;
  error: string | null;
}

export function HermesRail({ tasks }: { tasks: HermesRailTask[] }) {
  const t = useTranslations('dashboard');

  return (
    <aside
      aria-labelledby="hermes-task-title"
      className="border-t border-os-rule-paper pt-5"
      data-hermes-protected="true"
    >
      <div className="flex items-end justify-between gap-4 border-b border-os-rule-paper pb-3">
        <div>
          <p data-reading-role="caption" className="text-os-vermilion-ink">{t('hermes.liveQueue')}</p>
          <h2 id="hermes-task-title" className="mt-2 text-xl font-medium text-os-ink">{t('hermes.title')}</h2>
        </div>
        <span className="font-data text-xs tabular-nums text-os-muted-paper" aria-label={`${tasks.length}`}>{String(tasks.length).padStart(2, '0')}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="py-6 text-sm leading-6 text-os-muted-paper">{t('hermes.empty')}</p>
      ) : (
        <ol className="list-none divide-y divide-os-rule-paper p-0">
          {tasks.map((task, index) => (
            <li key={task.id}>
              <Link
                className="group grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-start gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
                href={hermesTaskHref(task)}
              >
                <span data-reading-role="caption" className="font-data text-os-muted-paper">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-os-ink group-hover:text-os-vermilion-ink">{task.researchTitle}</span>
                  <span data-reading-role="caption" className="mt-1 block truncate font-data text-os-muted-paper">{task.logicalPath}</span>
                  {task.error ? <span className="mt-1 block text-sm text-os-vermilion-ink">{task.error}</span> : null}
                </span>
                <span data-reading-role="caption" className="font-data text-os-muted-paper">{task.state.replaceAll('_', ' ')}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

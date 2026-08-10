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
    <aside className="border-t border-os-rule-dark pt-5" aria-labelledby="hermes-task-title">
      <div className="flex items-end justify-between gap-4 border-b border-os-rule-dark pb-3">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-os-vermilion">Hermes / live queue</p>
          <h2 id="hermes-task-title" className="mt-2 text-xl font-medium text-os-paper">{t('hermes.title')}</h2>
        </div>
        <span className="font-mono text-xs tabular-nums text-os-muted-dark" aria-label={`${tasks.length}`}>{String(tasks.length).padStart(2, '0')}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="py-6 text-sm leading-6 text-os-muted-dark">{t('hermes.empty')}</p>
      ) : (
        <ol className="list-none divide-y divide-os-rule-dark p-0">
          {tasks.map((task, index) => (
            <li key={task.id}>
              <Link
                className="group grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-start gap-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion"
                href={hermesTaskHref(task)}
              >
                <span className="font-mono text-[0.68rem] text-os-muted-dark">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-os-paper group-hover:text-os-vermilion">{task.researchTitle}</span>
                  <span className="mt-1 block truncate font-mono text-[0.68rem] text-os-muted-dark">{task.logicalPath}</span>
                  {task.error ? <span className="mt-1 block text-xs text-os-vermilion">{task.error}</span> : null}
                </span>
                <span className="font-mono text-[0.64rem] uppercase tracking-[0.12em] text-os-muted-dark">{task.state.replaceAll('_', ' ')}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

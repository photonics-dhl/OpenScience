'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge, type StatusBadgeStatus } from '@/components/ui/status-badge';

export type DashboardTaskStatus =
  | 'queued'
  | 'running'
  | 'needs_review'
  | 'failed_retryable'
  | 'failed_blocked'
  | 'written';

export interface DashboardTask {
  id: string;
  researchObjectId: string;
  title: string;
  status: DashboardTaskStatus;
  current: number;
  total: number;
}

export interface HermesTaskRailProps {
  tasks: DashboardTask[];
}

const badgeStatus: Record<DashboardTaskStatus, StatusBadgeStatus> = {
  queued: 'queued',
  running: 'parsing',
  needs_review: 'needs_review',
  failed_retryable: 'failed_retryable',
  failed_blocked: 'failed_blocked',
  written: 'written',
};

export function HermesTaskRail({ tasks }: HermesTaskRailProps) {
  const t = useTranslations('dashboard');
  const actionable = tasks.filter((task) =>
    ['queued', 'running', 'needs_review', 'failed_retryable', 'failed_blocked'].includes(task.status),
  );

  return (
    <aside className="rounded-card border border-white/10 bg-workbench-surface p-5 sm:p-6" aria-labelledby="hermes-task-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-primary">Hermes</p>
          <h2 id="hermes-task-title" className="mt-1 text-xl font-semibold text-workbench-text">
            {t('hermes.title')}
          </h2>
        </div>
        <span className="rounded-pill bg-workbench-bg px-2.5 py-1 text-xs tabular-nums text-workbench-muted">
          {actionable.length}
        </span>
      </div>

      {actionable.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-workbench-muted">{t('hermes.empty')}</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {actionable.map((task) => {
            const href = task.status === 'needs_review'
              ? `/research-objects/${task.researchObjectId}/hermes?task=${task.id}`
              : `/research-objects/${task.researchObjectId}/ingest?task=${task.id}`;
            const action = task.status === 'needs_review'
              ? t('hermes.review')
              : task.status === 'failed_retryable'
                ? t('hermes.retry')
                : t('hermes.view');

            return (
              <li key={task.id} className="rounded-control border border-white/10 bg-workbench-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-workbench-text">{task.title}</p>
                  <StatusBadge status={badgeStatus[task.status]} />
                </div>
                <p className="mt-2 text-xs tabular-nums text-workbench-muted">
                  {t('hermes.progress', { current: task.current, total: task.total })}
                </p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" href={href}>
                  {action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

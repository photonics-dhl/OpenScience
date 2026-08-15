'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { StatusBadge, type StatusBadgeStatus } from './status-badge';

export type ProgressRailState = Extract<
  StatusBadgeStatus,
  | 'queued'
  | 'uploading'
  | 'stored'
  | 'parsing'
  | 'needs_review'
  | 'confirmed'
  | 'written'
  | 'failed_retryable'
  | 'failed_blocked'
>;

export interface ProgressRailProps extends React.HTMLAttributes<HTMLElement> {
  current: number;
  total: number;
  state: ProgressRailState;
  retry?: () => void;
}

function ProgressRail({ className, current, total, state, retry, ...props }: ProgressRailProps) {
  const t = useTranslations('ingestion');
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal);
  const percentage = safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100);
  const canRetry = state === 'failed_retryable' && retry;

  return (
    <section
      className={cn(
        'grid min-h-32 grid-rows-[auto_0.375rem_auto_2.5rem] gap-3 rounded-card bg-workbench-surface p-4 text-workbench-text shadow-card',
        className,
      )}
      data-progress-rail="true"
      aria-label={t('progress.label')}
      {...props}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <StatusBadge status={state} />
        <span className="shrink-0 text-xs tabular-nums text-workbench-muted">
          {t('progress.count', { current: safeCurrent, total: safeTotal })}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-workbench-bg"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
        aria-valuetext={`${percentage}%`}
      >
        <div
          className="h-full rounded-pill bg-accent-primary transition-[width] duration-(--motion-fast) ease-standard motion-reduce:transition-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="m-0 text-sm text-workbench-muted" aria-live="polite">
        {t(`statusDescription.${state}`)}
      </p>
      <div className="flex h-10 items-end" data-progress-action>
        {canRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={retry}>
            {t('actions.retry')}
          </Button>
        ) : (
          <span className="invisible inline-flex h-9 px-3" aria-hidden="true">
            {t('actions.retry')}
          </span>
        )}
      </div>
    </section>
  );
}

export { ProgressRail };

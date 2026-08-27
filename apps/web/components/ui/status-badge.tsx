'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export type StatusBadgeStatus =
  | 'queued'
  | 'uploading'
  | 'stored'
  | 'parsing'
  | 'needs_review'
  | 'confirmed'
  | 'written'
  | 'failed_retryable'
  | 'failed_blocked'
  | 'missing'
  | 'inferred'
  | 'rejected';

const statusTone: Record<StatusBadgeStatus, string> = {
  queued: 'bg-status-neutral-bg text-status-neutral-text',
  uploading: 'bg-status-info-bg text-status-info-text',
  stored: 'bg-status-info-bg text-status-info-text',
  parsing: 'bg-status-info-bg text-status-info-text',
  needs_review: 'bg-status-warning-bg text-status-warning-text',
  confirmed: 'bg-status-success-bg text-status-success-text',
  written: 'bg-status-success-bg text-status-success-text',
  failed_retryable: 'bg-status-warning-bg text-status-warning-text',
  failed_blocked: 'bg-status-danger-bg text-status-danger-text',
  missing: 'bg-status-danger-bg text-status-danger-text',
  inferred: 'bg-status-info-bg text-status-info-text',
  rejected: 'bg-status-neutral-bg text-status-neutral-text',
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus;
}

function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  const t = useTranslations('ingestion');

  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold leading-none transition-colors duration-(--motion-fast) motion-reduce:transition-none',
        statusTone[status],
        className,
      )}
      data-status={status}
      {...props}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}

export { StatusBadge };

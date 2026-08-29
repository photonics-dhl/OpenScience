'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { StatusBadge, type StatusBadgeStatus } from './status-badge';

type EvidenceStatus = Extract<
  StatusBadgeStatus,
  'needs_review' | 'confirmed' | 'missing' | 'inferred' | 'rejected'
>;
type EvidenceConfidence = 'high' | 'medium' | 'low';

interface EvidenceCardProps extends React.HTMLAttributes<HTMLElement> {
  field: string;
  value: string;
  status: EvidenceStatus;
  confidence: EvidenceConfidence;
  source: string;
  onConfirm: () => void;
  onEdit: () => void;
  onReject: () => void;
}

function EvidenceCard({
  className,
  confidence,
  field,
  onConfirm,
  onEdit,
  onReject,
  source,
  status,
  value,
  ...props
}: EvidenceCardProps) {
  const t = useTranslations('ingestion');
  const titleId = React.useId();

  return (
    <article
      className={cn(
        'rounded-card bg-evidence-paper p-5 text-evidence-ink shadow-evidence ring-1 ring-evidence-border',
        className,
      )}
      data-evidence-card="true"
      aria-labelledby={titleId}
      {...props}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-evidence-muted">
            {t('evidence.field')}
          </p>
          <h3 id={titleId} className="mt-1 text-lg font-semibold leading-snug">
            {field}
          </h3>
        </div>
        <StatusBadge status={status} />
      </header>
      <p className="my-4 text-base leading-7">{value}</p>
      <dl className="grid gap-2 border-t border-evidence-border pt-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-evidence-muted">{t('evidence.confidence')}</dt>
          <dd className="m-0 mt-1">{t(`confidence.${confidence}`)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-evidence-muted">{t('evidence.source')}</dt>
          <dd className="m-0 mt-1 break-words">{source}</dd>
        </div>
      </dl>
      <footer className="mt-5 flex min-h-10 flex-wrap gap-2 border-t border-evidence-border pt-4">
        <Button type="button" size="sm" onClick={onConfirm}>
          {t('actions.confirm')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          {t('actions.edit')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onReject}>
          {t('actions.reject')}
        </Button>
      </footer>
    </article>
  );
}

export { EvidenceCard };

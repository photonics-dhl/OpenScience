'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { PresentationAsset } from '@/lib/api';
import { TrashActionButton } from '@/components/research/TrashActionButton';
import type { PaperFigureReviewOutcome } from './PaperFigureUpload';

interface Props {
  asset: PresentationAsset;
  title: string;
  canWrite: boolean;
  working: boolean;
  showReject?: boolean;
  reviewAction?: ReactNode;
  onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => Promise<PaperFigureReviewOutcome | null> | void;
  onDeleted?: (asset: PresentationAsset, title: string) => void;
}

export function MediaAssetActions({ asset, title, canWrite, working, showReject = false, reviewAction, onTransition, onDeleted }: Props) {
  const t = useTranslations('presentation');
  const writing = useRef(false);
  const [pending, setPending] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState('');
  const disabled = working || pending !== null;
  const reviewable = canWrite && asset.status === 'draft' && asset.canTransition;
  async function review(status: 'approved' | 'rejected') {
    if (writing.current || disabled || !reviewable || (status === 'approved' && !asset.canApprove)) return;
    writing.current = true; setPending(status); setError('');
    try {
      const result = await onTransition(asset, status);
      if (result?.status === 'failed') setError(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('transitionFailed')); }
    finally { writing.current = false; setPending(null); }
  }
  return <div data-media-asset-actions={asset.id}>
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm leading-6 text-os-muted-paper" role="status">{t(asset.status === 'draft' ? 'retainedDraft' : 'retainedAsset')}</span>
      {reviewable && asset.canApprove ? <button type="button" disabled={disabled} onClick={() => void review('approved')}
        className="inline-flex min-h-11 items-center rounded-control bg-accent-primary-strong px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink disabled:opacity-40">{t(pending === 'approved' ? 'retainingAsset' : 'approve')}</button> : null}
      {showReject && reviewable ? <button type="button" disabled={disabled} onClick={() => void review('rejected')} className="min-h-11 rounded-control border border-os-rule-paper px-4 text-sm disabled:opacity-40">{t(pending === 'rejected' ? 'retainingAsset' : 'reject')}</button> : null}
      {asset.canDelete && onDeleted ? <TrashActionButton kind="asset" resourceId={asset.id} title={title} disabled={disabled} onDone={() => onDeleted(asset, title)} /> : null}
    </div>
    {reviewAction}
    {error ? <p className="mb-0 mt-2 text-sm text-state-danger" role="alert">{error}</p> : null}
  </div>;
}

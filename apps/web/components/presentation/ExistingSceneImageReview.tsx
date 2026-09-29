'use client';

import { useTranslations } from 'next-intl';
import type { AgentTaskView, PresentationAsset } from '@/lib/api';

export interface ExistingImageReviewState {
  status: 'submitting' | 'submitted' | 'failed';
  message?: string;
  taskId?: string;
  recoverReceipt?: boolean;
}

export function isSavedSceneReviewCandidate(asset: PresentationAsset): boolean {
  return asset.kind === 'image' && asset.status === 'draft' && !!asset.sceneImage
    && asset.canTransition === true && asset.canApprove === false && /^[a-f0-9]{64}$/u.test(asset.contentHash);
}

// This is a UI candidate filter, not authorization. Only the review endpoint can
// inspect provenance, prior submissions/copies, current sources and provider receipts.
export function canRequestExistingImageReview(asset: PresentationAsset, task?: AgentTaskView, assets: PresentationAsset[] = [asset]): boolean {
  if (!isSavedSceneReviewCandidate(asset) || !task || task.id !== asset.id || task.kind !== 'presentation.generate'
    || task.result?.imageReview !== undefined) return false;
  // The existing list omits reviewSourceAssetId. Conservatively hide recovery
  // when the saved bytes already have another record, including a blocked copy.
  if (assets.some(other => other.id !== asset.id && other.kind === 'image'
    && other.researchObjectId === asset.researchObjectId && other.versionId === asset.versionId
    && other.contentHash === asset.contentHash)) return false;
  if (task.status === 'succeeded') return true;
  if (task.status !== 'failed' || task.result !== null) return false;
  if (task.error === 'scientific review provider failed') return true;
  if (task.retryCount !== 0 || task.executionAttempt !== 1) return false;
  const match = /^\[blocked\] Generated image review exceeds the source input budget(?: \(([1-9][0-9]{0,14}) > ([1-9][0-9]{0,14}) characters\))?$/u.exec(task.error ?? '');
  return !!match && match[0] === task.error && (!match[1] || Number(match[1]) > Number(match[2]));
}

export function ExistingSceneImageReview({ asset, task, assets, state, disabled, onReview }: {
  asset: PresentationAsset; task?: AgentTaskView; state?: ExistingImageReviewState;
  assets?: PresentationAsset[];
  disabled: boolean; onReview: () => void;
}) {
  const t = useTranslations('presentation.existingImageReview');
  const review = task?.result?.imageReview;
  const blocked = review && typeof review === 'object' && 'decision' in review && review.decision === 'blocked';
  if (blocked) return <p className="mb-0 mt-2 text-sm text-state-danger" role="status">{t('blocked')}</p>;
  const candidate = canRequestExistingImageReview(asset, task, assets);
  const recoverReceipt = state?.status === 'failed' && state.recoverReceipt === true;
  if (!candidate && !recoverReceipt && (!state || state.status === 'failed')) return state?.message
    ? <p className="mb-0 mt-2 text-sm text-state-danger" role="alert">{state.message}</p> : null;
  const pending = state?.status === 'submitting';
  return <div className="mt-3" data-existing-image-review={asset.id}>
    {state?.status !== 'submitted' ? <>
      <button type="button" disabled={disabled || pending} aria-busy={pending} onClick={onReview}
        className="inline-flex min-h-11 items-center rounded-control border border-os-rule-paper px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink disabled:opacity-40">{t(pending ? 'submitting' : recoverReceipt ? 'recoverReceipt' : 'action')}</button>
      <p className="mb-0 mt-2 text-sm text-os-muted-paper">{t('description')}</p>
    </> : <><p className="mb-0 text-sm text-os-vermilion-ink" role="status">{t('submitted')}</p>
      <button type="button" className="min-h-11 text-sm font-semibold underline" onClick={onReview}>{t('openTask')}</button></>}
    {state?.status === 'failed' ? <p className="mb-0 mt-2 text-sm text-state-danger" role="alert">{state.message}</p> : null}
  </div>;
}

'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { PresentationAsset } from '@/lib/api';
import { presentationAssetContentUrl } from '@/lib/api';
import { arrangePresentationResults } from '@/lib/presentation/result-gallery';
import { ScientificText } from '../content/ScientificText';
import { MediaAssetActions } from './MediaAssetActions';
import type { PaperFigureReviewOutcome } from './PaperFigureUpload';

interface Props { researchObjectId: string; versionId: string; assets: PresentationAsset[]; allAssets: PresentationAsset[]; canWrite: boolean; working: boolean; renderReviewAction?: (asset: PresentationAsset) => ReactNode; renderStyleChoices?: (asset: PresentationAsset) => ReactNode; onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => Promise<PaperFigureReviewOutcome | null> | void; onAssetDeleted?: (asset: PresentationAsset, title: string) => void; }

export function PresentationResultGallery({ researchObjectId, versionId, assets, allAssets, canWrite, working, renderReviewAction, renderStyleChoices, onTransition, onAssetDeleted }: Props) {
  const t = useTranslations('presentation');
  const { current, history } = arrangePresentationResults(assets, allAssets);
  function renderAsset(asset: PresentationAsset, historical = false) {
    const isVideo = asset.kind === 'video';
    const parent = asset.sceneImage ? allAssets.find((candidate) => candidate.id === asset.sceneImage?.storyboardAssetId)?.storyboard : undefined;
    const scene = parent?.document.scenes[asset.sceneImage?.sceneIndex ?? -1];
    const title = (asset.label !== 'presentation_not_evidence' && asset.label.trim()) || scene?.title || (isVideo ? t('videoTitle') : t('imageNumber', { number: assets.indexOf(asset) + 1 }));
    const sourceUrl = presentationAssetContentUrl(researchObjectId, versionId, asset.id);
    return <article key={asset.id} id={`illustration-${asset.id}`} className="min-w-0 scroll-mt-6 overflow-hidden" data-presentation-result={asset.id} data-presentation-current={historical ? undefined : asset.id}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p data-reading-role="caption" className="m-0 text-os-vermilion-ink">{t(isVideo ? 'videoTitle' : 'imageTitle')}</p><h3 className="m-0 mt-1 text-balance text-base font-semibold leading-6">{title}</h3></div><span className="rounded-control border border-os-rule-paper px-2 py-1 text-xs text-os-muted-paper">{t(asset.status === 'draft' && asset.canApprove ? 'readyToAdoptStatus' : `assetStatus.${asset.status}`)}</span></div>
      <figure className="m-0 min-w-0"><div className="w-full bg-os-paper">{isVideo ? <video className="aspect-video w-full bg-os-ink object-contain" src={sourceUrl} controls preload="metadata" aria-label={title} /> : <img className="block h-auto w-full object-contain outline -outline-offset-1 outline-black/10" src={sourceUrl} alt={title} width={1200} height={720} loading={historical ? 'lazy' : 'eager'} />}</div><figcaption className="mt-3 text-sm">{scene?.narration ? <ScientificText as="p" className="m-0 text-pretty text-base leading-7 text-os-ink" hideSourceMarkers>{scene.narration}</ScientificText> : null}<div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-pretty leading-6 text-os-muted-paper">{t('notEvidence')}</span><a className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={sourceUrl} target="_blank" rel="noreferrer">{t(isVideo ? 'openVideo' : 'viewFullSize')}</a></div></figcaption></figure>
      {!historical && !isVideo && canWrite ? renderStyleChoices?.(asset) : null}
      {asset.status === 'rejected' ? <p className="m-0 border-t border-os-rule-paper py-4 text-sm leading-6 text-os-muted-paper">{t('rejectedMediaNote')}</p> : null}
      <div className="mt-3 border-t border-os-rule-paper py-4"><MediaAssetActions asset={asset} title={title} canWrite={canWrite} working={working} showReject reviewAction={renderReviewAction?.(asset)} onTransition={onTransition} onDeleted={onAssetDeleted} /></div>
    </article>;
  }
  return <div className="grid min-w-0 gap-8">
    {current.map(asset => renderAsset(asset))}
    {history.length ? <details className="min-w-0 border-t border-os-rule-paper" data-presentation-history>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-os-muted-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('resultHistory', { count: history.length })}</summary>
      <div className="grid min-w-0 gap-8 pt-4">{history.map(asset => renderAsset(asset, true))}</div>
    </details> : null}
  </div>;
}

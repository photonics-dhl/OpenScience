'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PresentationAsset } from '@/lib/api';
import { presentationAssetContentUrl } from '@/lib/api';
import { ScientificText } from '../content/ScientificText';

interface Props { researchObjectId: string; versionId: string; assets: PresentationAsset[]; allAssets: PresentationAsset[]; canWrite: boolean; working: boolean; onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => void; }

export function PresentationResultGallery({ researchObjectId, versionId, assets, allAssets, canWrite, working, onTransition }: Props) {
  const t = useTranslations('presentation');
  return <div className={`grid min-w-0 items-start gap-6 ${assets.length > 1 ? '2xl:grid-cols-2' : ''}`}>{assets.map((asset, index) => {
    const isVideo = asset.kind === 'video';
    const parent = asset.sceneImage ? allAssets.find((candidate) => candidate.id === asset.sceneImage?.storyboardAssetId)?.storyboard : undefined;
    const scene = parent?.document.scenes[asset.sceneImage?.sceneIndex ?? -1];
    const title = (asset.label !== 'presentation_not_evidence' && asset.label.trim()) || scene?.title || (isVideo ? t('videoTitle') : t('imageNumber', { number: index + 1 }));
    const sourceUrl = presentationAssetContentUrl(researchObjectId, versionId, asset.id);
    return <article key={asset.id} id={`illustration-${asset.id}`} className="surface-folio-sheet min-w-0 scroll-mt-6 overflow-hidden" data-presentation-result={asset.id}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-os-rule-paper px-5 py-4 sm:px-6"><div className="min-w-0"><p data-reading-role="caption" className="m-0 text-os-vermilion-ink">{t(isVideo ? 'videoTitle' : 'imageTitle')}</p><h3 className="m-0 mt-1 text-balance text-base font-semibold leading-6">{title}</h3></div><span className="rounded-control border border-os-rule-paper px-2 py-1 text-xs text-os-muted-paper">{t(`assetStatus.${asset.status}`)}</span></div>
      <figure className="m-0 bg-os-paper px-4 py-4 sm:px-6 sm:py-5"><div className="relative aspect-video max-h-[32rem] w-full">{isVideo ? <video className="absolute inset-0 h-full w-full bg-os-ink object-contain" src={sourceUrl} controls preload="metadata" aria-label={title} /> : <img className="absolute inset-0 h-full w-full object-contain outline -outline-offset-1 outline-black/10" src={sourceUrl} alt={title} width={1200} height={720} loading="lazy" />}</div><figcaption className="mt-3 text-sm">{scene?.narration ? <ScientificText as="p" className="m-0 text-pretty text-base leading-7 text-os-ink" hideSourceMarkers>{scene.narration}</ScientificText> : null}<div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-pretty leading-6 text-os-muted-paper">{t('notEvidence')}</span><a className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={sourceUrl} target="_blank" rel="noreferrer">{t(isVideo ? 'openVideo' : 'viewFullSize')}</a></div></figcaption></figure>
      {asset.status === 'rejected' ? <p className="m-0 border-t border-os-rule-paper px-5 py-4 text-sm leading-6 text-os-muted-paper sm:px-6">{t('rejectedMediaNote')}</p> : asset.status === 'draft' && canWrite ? <div className="border-t border-os-rule-paper px-5 py-4 sm:px-6">
        <p className="m-0 text-xs leading-5 text-os-muted-paper">{t('mediaAdminApproval')}</p>
        {asset.canTransition ? <div className="mt-3 flex flex-wrap gap-3">
          {asset.canApprove ? <button type="button" disabled={working} onClick={() => onTransition(asset, 'approved')} className="bg-accent-primary-strong inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold transition-transform active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none"><Check className="size-4" aria-hidden="true" />{t('approve')}</button> : null}
          <button type="button" disabled={working} onClick={() => onTransition(asset, 'rejected')} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-dark px-4 text-sm text-os-ink transition-transform active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none"><X className="size-4" aria-hidden="true" />{t('reject')}</button>
        </div> : null}
      </div> : null}
    </article>;
  })}</div>;
}

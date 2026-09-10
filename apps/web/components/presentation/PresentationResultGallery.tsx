'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import type { PresentationAsset, PresentationClaim } from '@/lib/api';
import { presentationAssetContentUrl } from '@/lib/api';

interface Props { researchObjectId: string; versionId: string; assets: PresentationAsset[]; allAssets: PresentationAsset[]; claimsById: Map<string, PresentationClaim>; canWrite: boolean; working: boolean; onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => void; }

export function PresentationResultGallery({ researchObjectId, versionId, assets, allAssets, claimsById, canWrite, working, onTransition }: Props) {
  const t = useTranslations('presentation');
  return <div className={`grid min-w-0 items-start gap-6 ${assets.length > 1 ? '2xl:grid-cols-2' : ''}`}>{assets.map((asset, index) => {
    const linkedClaims = asset.sourceClaimIds.map((id) => claimsById.get(id)?.statement).filter((value): value is string => Boolean(value));
    const parent = asset.sceneImage ? allAssets.find((candidate) => candidate.id === asset.sceneImage?.storyboardAssetId)?.storyboard : undefined;
    const isVideo = asset.kind === 'video';
    const title = asset.label || parent?.document.scenes[asset.sceneImage?.sceneIndex ?? -1]?.title || (isVideo ? t('videoTitle') : t('imageNumber', { number: index + 1 }));
    const sourceUrl = presentationAssetContentUrl(researchObjectId, versionId, asset.id);
    return <article key={asset.id} className="surface-folio-sheet min-w-0 overflow-hidden" data-presentation-result={asset.id} data-presentation-asset={asset.id}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-os-rule-paper px-5 py-4 sm:px-6"><div className="min-w-0"><p data-reading-role="caption" className="m-0 text-os-vermilion-ink">{t(isVideo ? 'videoTitle' : 'imageTitle')}</p><h3 className="m-0 mt-1 text-balance text-lg font-semibold leading-6">{title}</h3></div><span className="rounded-control border border-os-rule-paper px-2 py-1 text-xs text-os-muted-paper">{t(`assetStatus.${asset.status}`)}</span></div>
      <figure className="m-0 bg-os-paper px-4 py-4 sm:px-6 sm:py-5"><div className="relative aspect-video max-h-[32rem] w-full">{isVideo ? <video className="absolute inset-0 h-full w-full rounded-control bg-black object-contain" controls playsInline preload="metadata" aria-label={title} src={sourceUrl} /> : <img className="absolute inset-0 h-full w-full object-contain outline -outline-offset-1 outline-black/10" src={sourceUrl} alt={title} width={1200} height={720} loading="lazy" />}</div><figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-pretty leading-6 text-os-muted-paper">{t('notEvidence')}</span><a className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={sourceUrl} target="_blank" rel="noreferrer">{t(isVideo ? 'openVideo' : 'viewFullSize')}</a></figcaption></figure>
      {asset.status === 'rejected' ? <p className="m-0 border-t border-os-rule-paper px-5 py-4 text-sm leading-6 text-os-muted-paper sm:px-6">{t('rejectedMediaNote')}</p> : asset.status === 'draft' && canWrite ? <div className="border-t border-os-rule-paper px-5 py-4 sm:px-6"><p className="m-0 text-xs leading-5 text-os-muted-paper">{t('mediaAdminApproval')}</p>{(asset.canTransition ?? false) ? <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={working} onClick={() => onTransition(asset, 'approved')} className="bg-accent-primary-strong inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold transition-transform active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none"><Check className="size-4" aria-hidden="true" />{t('approve')}</button><button type="button" disabled={working} onClick={() => onTransition(asset, 'rejected')} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-dark px-4 text-sm text-os-ink transition-transform active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none"><X className="size-4" aria-hidden="true" />{t('reject')}</button></div> : null}</div> : null}
      <details className="border-t border-os-rule-paper px-5 py-3 sm:px-6"><summary className="min-h-11 cursor-pointer rounded-control py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('sourceDetails')}</summary><p className="m-0 mb-3 break-words text-xs leading-5 text-os-muted-paper">{t('generatedBy', { name: asset.generator })}</p><p className="m-0 text-xs font-semibold text-os-muted-paper">{t('linkedClaims')}</p>{linkedClaims.length > 0 ? <ul className="mt-2 grid gap-1 text-sm leading-6">{linkedClaims.map((claim) => <li key={claim}>“{claim}”</li>)}</ul> : <p className="m-0 mt-2 text-sm text-os-muted-paper">{t('linkedClaimsUnavailable')}</p>}</details>
    </article>;
  })}</div>;
}

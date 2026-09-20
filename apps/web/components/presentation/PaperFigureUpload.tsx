'use client';

import { Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { presentationAssetContentUrl, type PresentationAsset, type PresentationClaim } from '@/lib/api';

export interface PaperFigureSelection {
  file: File;
  figureId: string;
  sourceClaimId: string;
  caption?: string;
}

export type PaperFigureUploadOutcome =
  | { status: 'uploaded'; assetId: string; figureId: string; assetsRefreshed: boolean }
  | { status: 'failed'; message: string };

export type PaperFigureReviewOutcome =
  | { status: 'approved' | 'rejected' }
  | { status: 'failed'; message: string };

interface Props {
  researchObjectId: string;
  versionId: string;
  claims: PresentationClaim[];
  originals: PresentationAsset[];
  canWrite: boolean;
  disabled: boolean;
  onUpload?: (input: PaperFigureSelection) => Promise<PaperFigureUploadOutcome | null>;
  onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => Promise<PaperFigureReviewOutcome | null> | void;
  onRetryData?: () => void;
}

const MAX_PNG_BYTES = 32 * 1024 * 1024;
const inputClass = 'min-h-11 min-w-0 w-full rounded-control border border-os-rule-paper bg-os-paper px-3 py-2 font-normal text-os-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink';

export function PaperFigureUpload({ researchObjectId, versionId, claims, originals, canWrite, disabled, onUpload, onTransition, onRetryData }: Props) {
  const t = useTranslations('presentation.paperFigure');
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [figureId, setFigureId] = useState('');
  const [sourceClaimId, setSourceClaimId] = useState('');
  const [caption, setCaption] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<PaperFigureUploadOutcome | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<{ assetId: string; outcome: PaperFigureReviewOutcome } | null>(null);
  const [previewStates, setPreviewStates] = useState<Record<string, 'loading' | 'loaded' | 'failed'>>({});
  const reviewPending = useRef(false);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const eligibleClaims = claims.filter((claim) => claim.researchObjectId === researchObjectId && claim.versionId === versionId && claim.extractionStatus === 'succeeded');
  const selectedClaim = eligibleClaims.find((claim) => claim.id === sourceClaimId);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function selectFile(next: File | null) {
    setOutcome(null);
    if (next && ((next.type ? next.type !== 'image/png' : !next.name.toLowerCase().endsWith('.png')) || next.size === 0 || next.size > MAX_PNG_BYTES)) {
      setFile(null);
      setOutcome({ status: 'failed', message: t('invalidFile') });
      return;
    }
    setFile(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || disabled || pendingRef.current || reviewPending.current || !onUpload || outcome?.status === 'uploaded') return;
    if (!file || !figureId.trim() || !selectedClaim) {
      setOutcome({ status: 'failed', message: t('requiredFields') });
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setOutcome(null);
    try {
      const result = await onUpload({ file, figureId: figureId.trim(), sourceClaimId, ...(caption.trim() ? { caption: caption.trim() } : {}) });
      if (mounted.current) setOutcome(result);
    } catch {
      if (mounted.current) setOutcome({ status: 'failed', message: t('uncertain') });
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function previewFor(asset: PresentationAsset) {
    const url = presentationAssetContentUrl(researchObjectId, versionId, asset.id);
    return { url, key: JSON.stringify([asset.id, asset.contentHash, url]) };
  }

  async function review(asset: PresentationAsset, status: 'approved' | 'rejected') {
    if (!canWrite || disabled || pendingRef.current || reviewPending.current || !asset.canTransition || asset.status !== 'draft') return;
    if (status === 'approved' && previewStates[previewFor(asset).key] !== 'loaded') return;
    reviewPending.current = true;
    setReviewing(asset.id);
    setReviewResult(null);
    try {
      const result = await onTransition(asset, status);
      if (mounted.current && result) setReviewResult({ assetId: asset.id, outcome: result });
    } catch {
      if (mounted.current) setReviewResult({ assetId: asset.id, outcome: { status: 'failed', message: t('reviewUncertain') } });
    } finally {
      reviewPending.current = false;
      if (mounted.current) setReviewing(null);
    }
  }

  return <section className="mt-6 border-t border-os-rule-paper pt-5" aria-labelledby={`${id}-title`} data-paper-figure-upload="true">
    <h3 id={`${id}-title`} className="m-0 text-sm font-semibold">{t('title')}</h3>
    <p className="m-0 mt-2 max-w-3xl text-sm leading-6 text-os-muted-paper">{t('description')}</p>
    {canWrite && onUpload ? <form className="mt-4" onSubmit={(event) => void submit(event)} aria-busy={pending}>
      <fieldset className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2" disabled={disabled || pending}>
        <legend className="sr-only">{t('title')}</legend>
        <label className="grid min-w-0 gap-2 text-sm font-semibold" htmlFor={`${id}-file`}>
          {t('fileLabel')}
          <input id={`${id}-file`} className={`${inputClass} text-sm file:mr-3 file:rounded-control file:border-0 file:bg-os-paper-strong file:px-3 file:py-1 file:text-os-ink`} type="file" accept="image/png,.png" required aria-describedby={`${id}-file-help`} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
          <span id={`${id}-file-help`} className="text-xs font-normal leading-5 text-os-muted-paper">{t('fileHelp')}</span>
        </label>
        <label className="grid content-start gap-2 text-sm font-semibold" htmlFor={`${id}-figure`}>
          {t('figureLabel')}
          <input id={`${id}-figure`} className={inputClass} value={figureId} required maxLength={200} placeholder={t('figurePlaceholder')} aria-describedby={`${id}-figure-help`} onChange={(event) => { setFigureId(event.target.value); setOutcome(null); }} />
          <span id={`${id}-figure-help`} className="text-xs font-normal leading-5 text-os-muted-paper">{t('figureHelp')}</span>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-semibold sm:col-span-2" htmlFor={`${id}-claim`}>
          {t('claimLabel')}
          <select id={`${id}-claim`} className={inputClass} value={selectedClaim?.id ?? ''} required disabled={disabled || pending || eligibleClaims.length === 0} onChange={(event) => { setSourceClaimId(event.target.value); setOutcome(null); }}>
            <option value="">{t('chooseClaim')}</option>
            {eligibleClaims.map((claim) => <option key={claim.id} value={claim.id}>{claim.statement.length > 140 ? `${claim.statement.slice(0, 140)}…` : claim.statement}</option>)}
          </select>
          {selectedClaim ? <span className="break-words text-xs font-normal leading-5 text-os-muted-paper">{selectedClaim.statement}</span> : null}
          {eligibleClaims.length === 0 ? <span className="text-xs font-normal leading-5 text-os-muted-paper">{t('noClaims')}</span> : null}
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2" htmlFor={`${id}-caption`}>
          {t('captionLabel')}
          <textarea id={`${id}-caption`} className={`${inputClass} min-h-20 resize-y leading-6`} value={caption} maxLength={200} onChange={(event) => { setCaption(event.target.value); setOutcome(null); }} />
        </label>
        <button type="submit" disabled={disabled || pending || eligibleClaims.length === 0 || outcome?.status === 'uploaded'} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control border border-os-rule-paper bg-os-paper-strong px-4 text-sm font-semibold transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">
          <Upload className="size-4" aria-hidden="true" />{pending ? t('uploading') : t('upload')}
        </button>
      </fieldset>
      <div className="mt-3 min-h-6 text-sm leading-6" aria-live="polite" aria-atomic="true">
        {pending ? <p className="m-0 text-os-muted-paper" role="status">{t('uploadingNote')}</p> : outcome?.status === 'failed' ? <p className="m-0 break-words text-state-danger" role="alert">{outcome.message}</p> : outcome?.status === 'uploaded' ? <>
          <p className="m-0" role="status">{t('uploaded', { figureId: outcome.figureId })}</p>
          <p className="m-0 mt-1 text-os-muted-paper">{t('nextStep', { figureId: outcome.figureId })}</p>
          {!outcome.assetsRefreshed ? <p className="m-0 mt-1 text-os-muted-paper">{t('refreshFailed')}</p> : null}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <a className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={presentationAssetContentUrl(researchObjectId, versionId, outcome.assetId)} target="_blank" rel="noreferrer">{t('openUploaded')}</a>
            {!outcome.assetsRefreshed && onRetryData ? <button type="button" className="min-h-11 font-semibold text-os-vermilion-ink underline" onClick={onRetryData}>{t('refresh')}</button> : null}
          </div>
        </> : null}
      </div>
    </form> : null}
    {originals.length > 0 ? <div className="mt-4">
      <p className="m-0 text-xs text-os-muted-paper">{t('registeredSources', { count: originals.length })}</p>
      <p className="m-0 mt-2 text-sm leading-6 text-os-muted-paper">{t('reviewInstructions')}</p>
      <a className="inline-flex min-h-11 items-center text-sm font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(researchObjectId)}/files?version=${encodeURIComponent(versionId)}`} target="_blank" rel="noreferrer">{t('openPaperFiles')}</a>
      <ul className="m-0 mt-1 list-none p-0">{originals.map((asset, index) => {
        const recordedLabel = asset.label !== 'presentation_not_evidence' ? asset.label.trim() : '';
        const recordedFigureId = asset.paperOriginal?.figureId.trim() || (outcome?.status === 'uploaded' && outcome.assetId === asset.id ? outcome.figureId : recordedLabel);
        const title = recordedFigureId || t('sourceNumber', { number: index + 1 });
        const linkedClaims = claims.filter((claim) => asset.sourceClaimIds.includes(claim.id));
        const sourceClaimsValid = linkedClaims.length > 0 && linkedClaims.length === asset.sourceClaimIds.length && linkedClaims.every((claim) => claim.extractionStatus === 'succeeded');
        const reviewable = canWrite && asset.status === 'draft' && asset.canTransition;
        const localReview = reviewResult?.assetId === asset.id ? reviewResult.outcome : null;
        const preview = previewFor(asset);
        const previewState = previewStates[preview.key] ?? 'loading';
        return <li key={asset.id} className="mt-4 border-t border-os-rule-paper pt-4" data-paper-figure-source={asset.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h4 className="m-0 break-words text-sm font-semibold">{title}</h4><span className="text-xs text-os-muted-paper">{t(`reviewStatus.${asset.status}`)}</span></div>
          <a href={preview.url} target="_blank" rel="noreferrer" className="mt-3 block rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"><img key={preview.key} className="max-h-64 w-full object-contain" src={preview.url} alt={t('sourcePreview', { title })} loading="lazy"
            onLoad={(event) => {
              if (!mounted.current) return;
              const decoded = event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0;
              setPreviewStates((current) => ({ ...current, [preview.key]: decoded ? 'loaded' : 'failed' }));
            }}
            onError={() => { if (mounted.current) setPreviewStates((current) => ({ ...current, [preview.key]: 'failed' })); }}
          /></a>
          {previewState === 'failed' ? <p className="m-0 mt-2 text-sm leading-6 text-state-danger" role="alert">{t('previewFailed')}</p> : previewState === 'loading' ? <p className="m-0 mt-2 text-sm leading-6 text-os-muted-paper" role="status">{t('previewLoading')}</p> : null}
          {asset.paperOriginal?.caption ? <p className="m-0 mt-2 break-words text-sm leading-6 text-os-muted-paper">{asset.paperOriginal.caption}</p> : null}
          {linkedClaims.length > 0 ? <div className="mt-3 text-sm leading-6"><p className="m-0 text-xs text-os-muted-paper">{t('claimLabel')}</p>{linkedClaims.map((claim) => <p key={claim.id} className="m-0 mt-1 break-words">{claim.statement}</p>)}</div> : <p className="m-0 mt-3 text-sm text-os-muted-paper">{t('sourceChanged')}</p>}
          {linkedClaims.length > 0 && !sourceClaimsValid ? <p className="m-0 mt-2 text-sm leading-6 text-os-muted-paper">{t('sourceChanged')}</p> : null}
          <a className="inline-flex min-h-11 items-center text-sm text-os-vermilion-ink underline" href={presentationAssetContentUrl(researchObjectId, versionId, asset.id)} target="_blank" rel="noreferrer">{t('openSource', { number: index + 1 })}</a>
          {asset.status === 'rejected' ? <p className="m-0 text-sm leading-6 text-os-muted-paper">{t('rejectedNote')}</p> : asset.status === 'approved' ? <p className="m-0 text-sm leading-6 text-os-muted-paper">{t('approvedNote')}</p> : <>
            {!recordedFigureId ? <p className="m-0 text-sm leading-6 text-os-muted-paper">{t('missingFigureId')}</p> : null}
            {reviewable ? <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" disabled={disabled || reviewing !== null || !recordedFigureId || !sourceClaimsValid || previewState !== 'loaded'} onClick={() => void review(asset, 'approved')} className="inline-flex min-h-11 items-center rounded-control border border-os-rule-paper bg-os-paper-strong px-4 text-sm font-semibold transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('approveSource')}</button>
              <button type="button" disabled={disabled || reviewing !== null} onClick={() => void review(asset, 'rejected')} className="inline-flex min-h-11 items-center rounded-control border border-os-rule-paper px-4 text-sm transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('rejectSource')}</button>
            </div> : canWrite ? <p className="m-0 text-sm leading-6 text-os-muted-paper">{t('reviewPermission')}</p> : null}
          </>}
          <div className="mt-2 min-h-6 text-sm leading-6" aria-live="polite" aria-atomic="true">{reviewing === asset.id ? <p className="m-0 text-os-muted-paper" role="status">{t('reviewing')}</p> : localReview?.status === 'failed' ? <p className="m-0 break-words text-state-danger" role="alert">{localReview.message}</p> : localReview ? <p className="m-0" role="status">{t(localReview.status === 'approved' ? 'reviewApproved' : 'reviewRejected')}</p> : null}</div>
          {onRetryData && (previewState === 'failed' || localReview?.status === 'failed' || (asset.status === 'draft' && (!recordedFigureId || !sourceClaimsValid))) ? <button type="button" disabled={disabled || reviewing !== null} className="min-h-11 text-sm font-semibold text-os-vermilion-ink underline disabled:opacity-40" onClick={() => { setPreviewStates((current) => ({ ...current, [preview.key]: 'loading' })); onRetryData(); }}>{t('refresh')}</button> : null}
        </li>;
      })}</ul>
    </div> : null}
  </section>;
}

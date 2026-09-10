'use client';

import { ChevronDown, Image as ImageIcon, Plus, RotateCw, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { PresentationAsset, PresentationClaim, VersionSummary } from '@/lib/api';
import { type SceneImageRequest, type StoryboardRequest } from '@/lib/api';
import { StoryboardPanel } from './StoryboardPanel';
import { MechanismVideoPanel } from './MechanismVideoPanel';
import { PresentationResultGallery } from './PresentationResultGallery';
import type { PresentationVideoRequest } from '@/lib/api';

type PresentationVersion = Pick<VersionSummary, 'versionId' | 'versionNo' | 'status'>;

export interface PresentationTaskState {
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;
  paused: boolean;
}

export interface PresentationWorkbenchProps {
  researchObjectId?: string;
  researchTitle?: string;
  claims: PresentationClaim[];
  assets: PresentationAsset[];
  version: PresentationVersion;
  canWrite: boolean;
  readonlyReason?: string;
  loading?: boolean;
  loadFailed?: boolean;
  task?: PresentationTaskState | null;
  onCreateClaim: (statement: string) => Promise<boolean>;
  onGenerate: (claimIds: string[]) => void;
  onGenerateSceneImage?: (claimIds: string[], request: SceneImageRequest) => void;
  onGenerateVideo?: (claimIds: string[], request: PresentationVideoRequest) => void;
  onGenerateStoryboard?: (claimIds: string[], request: StoryboardRequest) => void;
  onResumeTask?: () => void;
  onRetryData?: () => void;
  onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => void;
  working?: boolean;
  error?: string;
}

const MAX_SELECTED_CLAIMS = 12;

export function PresentationWorkbench({
  researchObjectId = '', researchTitle, claims, assets, version, canWrite, readonlyReason, loading = false, loadFailed = false, task = null,
  onCreateClaim, onGenerate, onGenerateStoryboard, onGenerateSceneImage, onGenerateVideo, onResumeTask, onRetryData, onTransition, working = false, error = '',
}: PresentationWorkbenchProps) {
  const t = useTranslations('presentation');
  const [selected, setSelected] = useState<string[]>([]);
  const [statement, setStatement] = useState('');
  const eligibleIds = useMemo(() => new Set(claims.filter((claim) => claim.extractionStatus === 'succeeded').map((claim) => claim.id)), [claims]);
  const claimsById = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims]);
  const resultAssets = useMemo(() => assets.filter((asset) => !asset.storyboard && (asset.kind === 'image' || asset.kind === 'chart' || asset.kind === 'svg' || asset.kind === 'video')), [assets]);
  const storyboardAssets = useMemo(() => assets.filter((asset) => Boolean(asset.storyboard)), [assets]);

  useEffect(() => {
    setSelected((current) => current.filter((id) => eligibleIds.has(id)));
  }, [eligibleIds, version.versionId]);

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      return current.length < MAX_SELECTED_CLAIMS ? [...current, id] : current;
    });
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = statement.trim();
    if (!value) return;
    if (await onCreateClaim(value)) setStatement('');
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-7 text-os-ink sm:px-8 sm:py-9 lg:px-12" data-presentation-workbench="true">
      <header className="border-b border-os-rule-paper pb-5">
        <p data-reading-role="caption" className="m-0 break-words text-os-vermilion-ink [overflow-wrap:anywhere]">{researchTitle || t('kicker')} <span className="text-os-muted-paper">· {t('versionNumber', { number: version.versionNo })}</span></p>
        <h1 className="m-0 mt-2 max-w-2xl text-balance text-[1.75rem] font-semibold leading-tight tracking-[-0.022em] sm:text-[2rem]">{t('title')}</h1>
        <p className="m-0 mt-3 max-w-2xl text-pretty text-sm leading-6 text-os-muted-paper sm:text-base">{t('description')}</p>
        <p className="m-0 mt-3 flex max-w-4xl items-start gap-2 text-xs leading-5 text-os-muted-paper"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t('provenance')}</p>
      </header>

          <section className="mt-6" aria-labelledby="presentation-preview-heading">
            <div className="flex items-center justify-between gap-4 border-b border-os-rule-paper pb-3">
              <h2 id="presentation-preview-heading" className="m-0 text-xl font-semibold tracking-[-0.012em]">{t('previewTitle')}</h2>
              {assets.length > 0 ? <span className="font-data text-sm tabular-nums text-os-muted-paper">{assets.length}</span> : null}
            </div>
            {loading ? <p className="m-0 py-7 text-sm text-os-muted-paper" role="status">{t('loadingPreviews')}</p> : loadFailed ? <p className="m-0 py-7 text-sm leading-6 text-os-muted-paper">{t('scopeLoadFailed')}</p> : resultAssets.length === 0 ? (
              <div className="mt-5 rounded-control border border-os-rule-paper bg-os-paper-strong p-5 sm:p-6">
                <h3 className="m-0 text-base font-semibold">{t('emptyPreviewTitle')}</h3>
                <p className="m-0 mt-2 max-w-2xl text-pretty text-base leading-7 text-os-muted-paper">{canWrite ? t(eligibleIds.size === 0 ? 'emptyPreviewNeedsSources' : 'emptyPreview') : t('emptyPreviewReadonly')}</p>
                {canWrite && eligibleIds.size === 0 && researchObjectId ? <Link className="mt-4 inline-flex min-h-11 items-center rounded-control border border-os-rule-paper px-4 text-sm font-semibold text-os-vermilion-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink" href={`/research-objects/${encodeURIComponent(researchObjectId)}/hermes`}>{t('openSourceReview')}</Link> : canWrite ? <a className="mt-4 inline-flex min-h-11 items-center rounded-control bg-accent-primary-strong px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink" href="#presentation-source-heading">{t('startVisual')}</a> : null}
              </div>
            ) : (
              <PresentationResultGallery researchObjectId={researchObjectId} versionId={version.versionId} assets={resultAssets} allAssets={assets} claimsById={claimsById} canWrite={canWrite} working={working} onTransition={onTransition} />
            )}
          </section>
            {task && task.status !== 'succeeded' ? (
              <div className="mt-5 border-t border-os-rule-paper pt-5" data-presentation-task={task.status}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-semibold">{task.paused ? t('taskPaused') : t(`taskStatus.${task.status}`)}</span>
                  <span className="font-data tabular-nums text-os-muted-paper">{task.progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-control bg-os-rule-paper" role="progressbar" aria-label={t('taskProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress}>
                  <span className="block h-full bg-os-vermilion-ink transition-[width] motion-reduce:transition-none" style={{ width: `${task.progress}%` }} />
                </div>
                {task.paused && onResumeTask ? <button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-paper px-4 text-sm font-semibold transition-transform active:scale-[0.96] motion-reduce:transform-none" onClick={onResumeTask}><RotateCw className="h-4 w-4" aria-hidden="true" />{t('resumeTask')}</button> : null}
              </div>
            ) : null}

            {error ? <div className="mt-5 border-l-2 border-state-danger pl-4" role="alert"><p className="m-0 text-sm leading-6 text-state-danger">{error}</p><a className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-os-vermilion-ink underline" href="#presentation-source-heading">{t('recoverInSources')}</a></div> : null}
            {loadFailed && onRetryData ? <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-paper px-4 text-sm font-semibold transition-transform active:scale-[0.96] motion-reduce:transform-none" onClick={onRetryData}><RotateCw className="h-4 w-4" aria-hidden="true" />{t('retryScopeLoad')}</button> : null}
          {storyboardAssets.length > 0 ? <details className="surface-folio-sheet mt-8 px-5 py-5 sm:px-6" open>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"><span className="text-base font-semibold">{t('planningHistoryTitle')}</span><ChevronDown className="size-4 shrink-0" aria-hidden="true" /></summary>
            <p className="m-0 mt-2 max-w-3xl text-pretty text-sm leading-6 text-os-muted-paper">{t('planningHistoryBody')}</p>
            {storyboardAssets.map((asset) => <div className="mt-5 border-t border-os-rule-paper pt-4" data-presentation-asset={asset.id} key={asset.id}><StoryboardPanel storyboard={asset.storyboard} parent={assets.find((item) => item.id === asset.storyboard?.baseAssetId)?.storyboard} baseAssetId={asset.id} claims={claims} selectedClaimIds={asset.sourceClaimIds} canGenerate={canWrite && !loading && !loadFailed && !working && asset.status !== 'rejected'} onGenerate={onGenerateStoryboard} canGenerateImage={canWrite && !loading && !loadFailed && !working && asset.status === 'approved' && asset.canGenerateSceneImage === true} onGenerateImage={onGenerateSceneImage} />{canWrite && onGenerateVideo ? <MechanismVideoPanel parent={asset} assets={assets} disabled={working || loading || loadFailed} onGenerate={onGenerateVideo} /> : null}</div>)}
          </details> : null}
          <details className="surface-folio-sheet mt-8 px-5 py-5 sm:px-6" data-source-tools="true" open={resultAssets.length === 0 || loading || loadFailed || Boolean(error) || Boolean(task && task.status !== 'succeeded') || undefined}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">
              <span id="presentation-source-heading" className="text-base font-semibold">{t('sourceTitle')}</span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </summary>
            <p className="m-0 mt-2 max-w-3xl text-sm leading-6 text-os-muted-paper">{t('sourceBody')}</p>

            {canWrite ? (
              <form className="mt-6 border-y border-os-rule-paper py-5" onSubmit={(event) => void submitClaim(event)}>
                <label className="grid gap-2 text-sm font-semibold" htmlFor="presentation-core-claim">
                  {t('claimStatementLabel')}
                  <textarea
                    id="presentation-core-claim"
                    className="min-h-24 w-full resize-y rounded-control border border-os-rule-paper bg-os-paper px-3 py-3 font-normal leading-6 text-os-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
                    maxLength={4000}
                    placeholder={t('claimStatementPlaceholder')}
                    value={statement}
                    disabled={working || loading || loadFailed}
                    onChange={(event) => setStatement(event.target.value)}
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 max-w-xl text-xs leading-5 text-os-muted-paper">{t('claimDraftNote')}</p>
                  <button
                    type="submit"
                    disabled={working || loading || loadFailed || statement.trim().length === 0}
                    className="inline-flex min-h-11 items-center gap-2 rounded-control border border-os-rule-paper bg-os-paper-strong px-4 text-sm font-semibold text-os-ink transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />{t('addClaim')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="m-0 mt-6 border-l-2 border-os-vermilion-ink pl-4 text-sm leading-6 text-os-muted-paper" data-readonly-reason="true">{readonlyReason}</p>
            )}

            {loading ? (
              <p className="m-0 mt-6 text-sm text-os-muted-paper" role="status">{t('loadingSources')}</p>
            ) : loadFailed ? (
              <p className="m-0 mt-6 text-sm leading-6 text-os-muted-paper">{t('scopeLoadFailed')}</p>
            ) : claims.length === 0 ? (
              <p className="m-0 mt-6 text-sm leading-6 text-os-muted-paper">{canWrite ? t('noClaims') : t('noClaimsReadonly')}</p>
            ) : (
              <fieldset className="mt-5 grid min-w-0 gap-1 border-0 p-0" disabled={!canWrite || working || loadFailed}>
                <legend className="sr-only">{t('selectClaims')}</legend>
                {claims.map((claim) => {
                  const available = claim.extractionStatus === 'succeeded';
                  const checked = selected.includes(claim.id);
                  const atLimit = !checked && selected.length >= MAX_SELECTED_CLAIMS;
                  return (
                    <label key={claim.id} className="flex min-h-11 items-start gap-3 border-b border-os-rule-paper py-3 text-sm last:border-b-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!available || atLimit || !canWrite || working}
                        onChange={() => toggle(claim.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-os-vermilion-ink focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
                      />
                      <span className="min-w-0">
                        <span className="block text-pretty leading-6">{claim.statement}</span>
                        <span className="mt-1 block text-xs text-os-muted-paper">{available ? t(`assessment.${claim.assessment}`) : t(`claimStatus.${claim.extractionStatus}`)}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {canWrite ? (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={working || loadFailed || selected.length === 0}
                  onClick={() => onGenerate(selected)}
                  className="bg-accent-primary-strong inline-flex min-h-11 items-center gap-2 rounded-control px-5 text-sm font-semibold transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none"
                >
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />{working && !task ? t('starting') : t('generate')}
                </button>
                <span className="text-sm text-os-muted-paper">{t('selectedLimit', { count: selected.length, max: MAX_SELECTED_CLAIMS })}</span>
              </div>
            ) : null}


            <div className="mt-8 border-t border-os-rule-paper pt-6"><StoryboardPanel claims={claims} selectedClaimIds={selected} canGenerate={canWrite && !loading && !loadFailed && !working} onGenerate={onGenerateStoryboard} /></div>
          </details>
    </div>
  );
}

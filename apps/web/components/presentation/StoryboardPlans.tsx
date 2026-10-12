'use client';

import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PresentationAsset, PresentationClaim, PresentationVideoRequest, SceneImageRequest, StoryboardRequest } from '@/lib/api';
import { StoryboardPanel } from './StoryboardPanel';
import { MechanismVideoPanel } from './MechanismVideoPanel';
import type { StoryboardWriteOutcome } from './PresentationWorkbench';

interface Props {
  assets: PresentationAsset[];
  claims: PresentationClaim[];
  canWrite: boolean;
  unavailable: boolean;
  onGenerateStoryboard?: (claimIds: string[], request: StoryboardRequest) => void | Promise<StoryboardWriteOutcome>;
  onGenerateSceneImage?: (claimIds: string[], request: SceneImageRequest) => void | Promise<StoryboardWriteOutcome>;
  onGenerateVideo?: (claimIds: string[], request: PresentationVideoRequest) => void;
  onTransition: (asset: PresentationAsset, status: 'approved' | 'rejected') => unknown | Promise<unknown>;
}

type Selection = { latestId: string; assetId: string } | null;
type WriteState = 'idle' | 'working' | 'success' | 'error';

function writeStateFromResult(result: unknown): WriteState {
  if (result === null) return 'error';
  if (typeof result === 'object' && result !== null && 'status' in result && (result as { status?: unknown }).status === 'failed') {
    return (result as { silent?: unknown }).silent === true ? 'idle' : 'error';
  }
  return 'success';
}

/** New results take focus; a deliberate older selection lasts until the next new result. */
export function selectStoryboard(assets: PresentationAsset[], selection: Selection) {
  const plans = assets.filter(asset => asset.storyboard).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  const choices = plans.filter(asset => asset.status !== 'rejected');
  const latest = choices[0];
  const active = latest && selection?.latestId === latest.id
    ? choices.find(asset => asset.id === selection.assetId) ?? latest : latest;
  return { active, choices, history: plans.filter(asset => asset.status === 'rejected') };
}

export function StoryboardPlans({ assets, claims, canWrite, unavailable, onGenerateStoryboard, onGenerateSceneImage, onGenerateVideo, onTransition }: Props) {
  const t = useTranslations('presentation');
  const tw = useTranslations('workbench');
  const ts = useTranslations('presentation.storyboard');
  const selectId = useId();
  const [selection, setSelection] = useState<Selection>(null);
  const [sceneSelection, setSceneSelection] = useState<{ assetId: string; index: number } | null>(null);
  const [sceneImageStates, setSceneImageStates] = useState<Record<string, WriteState>>({});
  const sceneImageLocks = useRef(new Set<string>());
  const [transitionStates, setTransitionStates] = useState<Record<string, { state: WriteState; status?: 'approved' | 'rejected' }>>({});
  const transitionLocks = useRef(new Set<string>());
  const { active, choices, history } = selectStoryboard(assets, selection);
  const writable = canWrite && !unavailable;
  const sceneIndex = active && sceneSelection?.assetId === active.id && active.storyboard!.document.scenes[sceneSelection.index]
    ? sceneSelection.index : 0;
  const latestId = choices[0]?.id;
  const feedbackText = (state: WriteState, kind: 'generation' | 'transition', status?: 'approved' | 'rejected') => {
    if (state === 'working') return t('taskStatus.running');
    if (state === 'success') return kind === 'transition' ? t(status === 'approved' ? 'assetStatus.approved' : 'assetStatus.rejected') : t('taskSubmitted');
    if (state === 'error') return t(kind === 'transition' ? 'transitionFailed' : 'generationStartFailed');
    return '';
  };
  function submitSceneImage(asset: PresentationAsset, index: number) {
    if (!writable || !onGenerateSceneImage) return;
    const key = `${asset.id}:${index}`;
    if (sceneImageLocks.current.has(key)) return;
    sceneImageLocks.current.add(key);
    setSceneImageStates((current) => ({ ...current, [key]: 'working' }));
    try {
      Promise.resolve(onGenerateSceneImage(asset.sourceClaimIds, { storyboardAssetId: asset.id, sceneIndex: index })).then((result) => {
        sceneImageLocks.current.delete(key);
        setSceneImageStates((current) => ({ ...current, [key]: writeStateFromResult(result) }));
      }, () => {
        sceneImageLocks.current.delete(key);
        setSceneImageStates((current) => ({ ...current, [key]: 'error' }));
      });
    } catch {
      sceneImageLocks.current.delete(key);
      setSceneImageStates((current) => ({ ...current, [key]: 'error' }));
    }
  }
  function submitTransition(asset: PresentationAsset, status: 'approved' | 'rejected') {
    if (!writable || transitionLocks.current.has(asset.id)) return;
    transitionLocks.current.add(asset.id);
    setTransitionStates((current) => ({ ...current, [asset.id]: { state: 'working', status } }));
    try {
      Promise.resolve(onTransition(asset, status)).then((result) => {
        transitionLocks.current.delete(asset.id);
        setTransitionStates((current) => ({ ...current, [asset.id]: { state: writeStateFromResult(result), status } }));
      }, () => {
        transitionLocks.current.delete(asset.id);
        setTransitionStates((current) => ({ ...current, [asset.id]: { state: 'error', status } }));
      });
    } catch {
      transitionLocks.current.delete(asset.id);
      setTransitionStates((current) => ({ ...current, [asset.id]: { state: 'error', status } }));
    }
  }
  useEffect(() => {
    if (!active) {
      if (!unavailable && selection) setSelection(null);
      return;
    }
    if (selection?.latestId !== latestId || selection.assetId !== active.id)
      setSelection({ latestId: latestId!, assetId: active.id });
  }, [active, latestId, unavailable, selection]);
  useEffect(() => {
    if (!active) {
      if (!unavailable && sceneSelection) setSceneSelection(null);
      return;
    }
    if (sceneSelection?.assetId !== active.id || sceneSelection.index !== sceneIndex)
      setSceneSelection({ assetId: active.id, index: sceneIndex });
  }, [active, sceneIndex, unavailable, sceneSelection]);
  if (!active && !history.length) return null;
  return <div className="mt-7 border-t border-os-rule-paper pt-5">
    {active ? <section data-active-storyboard={active.id} aria-labelledby={`${selectId}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`${selectId}-heading`} className="m-0 text-base font-semibold">{t('currentPlanTitle')}</h2>
          <p className="m-0 mt-1 text-sm text-os-muted-paper">{active.storyboard!.document.title} · {t(`assetStatus.${active.status}`)}</p>
        </div>
        {choices.length > 1 ? <label className="grid gap-1 text-xs font-semibold text-os-muted-paper" htmlFor={selectId}>
          {t('selectPlan')}
          <select id={selectId} value={active.id} disabled={unavailable}
            className="min-h-11 max-w-full rounded-control border border-os-rule-paper bg-os-paper px-3 py-2 text-sm text-os-ink disabled:opacity-50"
            onChange={event => setSelection({ latestId: choices[0].id, assetId: event.target.value })}>
            {choices.map(asset => <option key={asset.id} value={asset.id}>{asset.storyboard!.document.title} · {t(`assetStatus.${asset.status}`)}</option>)}
          </select>
        </label> : null}
      </div>
      <p className="m-0 mt-2 text-sm leading-6 text-os-muted-paper">{t('currentPlanBody')}</p>
      <details key={active.id} open={active.status === 'draft'} data-current-storyboard-details="true" className="mt-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('planningHistoryTitle')}</summary>
        <StoryboardPanel storyboard={active.storyboard}
          parent={assets.find(asset => asset.id === active.storyboard?.baseAssetId)?.storyboard}
          baseAssetId={active.id} claims={claims} selectedClaimIds={active.sourceClaimIds}
          canGenerate={writable} onGenerate={onGenerateStoryboard}
          canGenerateImage={false} />
      </details>
      {writable && active.status === 'draft' && active.canTransition === true ? <div className="mt-4 flex flex-wrap gap-3">
        {active.canApprove === true ? <button type="button" className="min-h-11 rounded-control bg-accent-primary-strong px-4 text-sm font-semibold"
          disabled={transitionStates[active.id]?.state === 'working'} aria-busy={transitionStates[active.id]?.state === 'working'}
          onClick={() => submitTransition(active, 'approved')}>{tw('approvePlan')}</button> : null}
        <button type="button" className="min-h-11 rounded-control border border-os-rule-paper px-4 text-sm"
          disabled={transitionStates[active.id]?.state === 'working'} aria-busy={transitionStates[active.id]?.state === 'working'}
          onClick={() => submitTransition(active, 'rejected')}>{t('reject')}</button>
      </div> : null}
      {active && transitionStates[active.id] && transitionStates[active.id].state !== 'idle' ? <p className="mt-3 text-sm leading-5 text-os-muted-paper" role={transitionStates[active.id].state === 'error' ? 'alert' : 'status'} data-storyboard-transition-feedback="true" data-write-state={transitionStates[active.id].state}>{feedbackText(transitionStates[active.id].state, 'transition', transitionStates[active.id].status)}</p> : null}
      {writable && active.status === 'approved' && active.canGenerateSceneImage === true && onGenerateSceneImage && active.storyboard!.document.scenes.length > 0 ? <div className="mt-4 flex flex-wrap items-end gap-3">
        {active.storyboard!.document.scenes.length > 1 ? <label className="grid gap-1 text-xs font-semibold text-os-muted-paper">
          {t('selectScene')}
          <select value={sceneIndex} className="min-h-11 max-w-full rounded-control border border-os-rule-paper bg-os-paper px-3 py-2 text-sm text-os-ink"
            onChange={event => setSceneSelection({ assetId: active.id, index: Number(event.target.value) })}>
            {active.storyboard!.document.scenes.map((scene, index) => <option key={index} value={index}>{ts('scene', { number: index + 1 })} · {scene.title}</option>)}
          </select>
        </label> : null}
        <button type="button" data-scene-image={sceneIndex} data-image-storyboard={active.id}
          disabled={sceneImageStates[`${active.id}:${sceneIndex}`] === 'working'} aria-busy={sceneImageStates[`${active.id}:${sceneIndex}`] === 'working'}
          className="min-h-11 rounded-control bg-accent-primary-strong px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink disabled:opacity-40"
          onClick={() => submitSceneImage(active, sceneIndex)}>{ts('generateImage')}</button>
        <p className="m-0 text-xs leading-5 text-os-muted-paper">{ts('imageCharge')}</p>
        {sceneImageStates[`${active.id}:${sceneIndex}`] && sceneImageStates[`${active.id}:${sceneIndex}`] !== 'idle' ? <p className="m-0 text-sm leading-5 text-os-muted-paper" role={sceneImageStates[`${active.id}:${sceneIndex}`] === 'error' ? 'alert' : 'status'} data-scene-image-feedback={sceneIndex} data-write-state={sceneImageStates[`${active.id}:${sceneIndex}`]}>{feedbackText(sceneImageStates[`${active.id}:${sceneIndex}`], 'generation')}</p> : null}
      </div> : null}
      {canWrite && onGenerateVideo ? <MechanismVideoPanel key={active.id} parent={active} assets={assets} disabled={unavailable} onGenerate={onGenerateVideo} /> : null}
    </section> : null}
    {history.length ? <details className="mt-4 border-t border-os-rule-paper pt-2" data-storyboard-history="true">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('rejectedPlanHistory')}</summary>
      {history.map(asset => <div key={asset.id} className="border-t border-os-rule-paper py-4">
        <p className="m-0 mb-3 text-xs text-os-muted-paper">{t('assetStatus.rejected')}</p>
        <StoryboardPanel storyboard={asset.storyboard} claims={claims} canGenerate={false} canGenerateImage={false} />
      </div>)}
    </details> : null}
  </div>;
}

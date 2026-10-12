'use client';

import * as React from 'react';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { visibleStoryboardAction } from '@openscience/domain/storyboard-visible-action';
import type { PresentationClaim, StoryboardRequest, StoryboardView, SceneImageRequest } from '@/lib/api';
import { hasCurrentPresentationSources, hasSingleReviewedPaperSource } from '@/lib/hermes/presentation-action';

interface Props {
  storyboard?: StoryboardView;
  parent?: StoryboardView;
  baseAssetId?: string;
  claims: PresentationClaim[];
  selectedClaimIds?: string[];
  canGenerate: boolean;
  canGenerateImage?: boolean;
  onGenerateImage?: (claimIds: string[], request: SceneImageRequest) => void | Promise<unknown>;
  onGenerate?: (claimIds: string[], request: StoryboardRequest) => void | Promise<unknown>;
}
type WriteState = 'idle' | 'working' | 'success' | 'error';

function failedWriteResult(result: unknown): boolean {
  return result === null || (typeof result === 'object' && 'status' in result && (result as { status?: unknown }).status === 'failed');
}

const control = 'min-h-11 w-full rounded-control border border-os-rule-paper bg-os-paper px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink';

export function buildStoryboardRequest(input: {
  locale: StoryboardRequest['locale'];
  style: StoryboardRequest['style'];
  output: StoryboardRequest['output'];
  instruction: string;
  baseAssetId?: string;
  artOnly: boolean;
  storyboard?: Pick<StoryboardView, 'narrative'>;
  singlePaperImage?: boolean;
}): StoryboardRequest {
  return {
    locale: input.locale,
    style: input.style,
    output: input.output,
    instruction: input.instruction.trim(),
    ...(input.singlePaperImage && !input.baseAssetId && input.output === 'image'
      ? { narrative: true as const, narrativeSceneLimit: 1 } : {}),
    ...(input.baseAssetId ? {
      baseAssetId: input.baseAssetId,
      ...(input.artOnly ? { revisionMode: 'art' as const, artSceneIndex: 0,
        ...(input.storyboard?.narrative ? { narrative: true as const } : {}) } : {}),
    } : {}),
  };
}

export function StoryboardPanel({ storyboard, parent, baseAssetId, claims, selectedClaimIds = [], canGenerate, onGenerate, canGenerateImage = false, onGenerateImage }: Props) {
  const t = useTranslations('presentation.storyboard');
  const tp = useTranslations('presentation');
  const tw = useTranslations('workbench');
  const currentLocale = useLocale();
  const [locale, setLocale] = useState<'zh' | 'en'>(storyboard?.locale ?? (currentLocale === 'zh' ? 'zh' : 'en'));
  const [style, setStyle] = useState<StoryboardRequest['style']>(storyboard?.style ?? 'auto');
  const [artOnly, setArtOnly] = useState(false);
  const [generationState, setGenerationState] = useState<WriteState>('idle');
  const generationLock = useRef(false);
  const [sceneImageStates, setSceneImageStates] = useState<Record<number, WriteState>>({});
  const sceneImageLocks = useRef(new Set<number>());
  const output: StoryboardRequest['output'] = storyboard?.output ?? 'image';
  const [instruction, setInstruction] = useState(baseAssetId ? '' : tw('coreImageInstruction'));
  const names = new Map(claims.map((claim) => [claim.id, claim.statement]));
  const sourcesCurrent = hasCurrentPresentationSources(selectedClaimIds, claims);
  const singlePaperImage = !storyboard && !baseAssetId && output === 'image'
    && hasSingleReviewedPaperSource(selectedClaimIds, claims);
  const feedbackText = (state: WriteState, failureKey: 'generationStartFailed' | 'transitionFailed' = 'generationStartFailed') => {
    if (state === 'working') return tp('taskStatus.running');
    if (state === 'success') return tp('taskSubmitted');
    if (state === 'error') return tp(failureKey);
    return '';
  };
  function submitGeneration(request: StoryboardRequest) {
    if (!onGenerate || generationLock.current) return;
    generationLock.current = true;
    setGenerationState('working');
    try {
      Promise.resolve(onGenerate(selectedClaimIds, request)).then((result) => {
        generationLock.current = false;
        setGenerationState(failedWriteResult(result) ? 'error' : 'success');
      }, () => {
        generationLock.current = false;
        setGenerationState('error');
      });
    } catch {
      generationLock.current = false;
      setGenerationState('error');
    }
  }
  function submitSceneImage(index: number) {
    if (!onGenerateImage || !baseAssetId || sceneImageLocks.current.has(index)) return;
    sceneImageLocks.current.add(index);
    setSceneImageStates((current) => ({ ...current, [index]: 'working' }));
    try {
      Promise.resolve(onGenerateImage(selectedClaimIds, { storyboardAssetId: baseAssetId, sceneIndex: index })).then((result) => {
        sceneImageLocks.current.delete(index);
        setSceneImageStates((current) => ({ ...current, [index]: failedWriteResult(result) ? 'error' : 'success' }));
      }, () => {
        sceneImageLocks.current.delete(index);
        setSceneImageStates((current) => ({ ...current, [index]: 'error' }));
      });
    } catch {
      sceneImageLocks.current.delete(index);
      setSceneImageStates((current) => ({ ...current, [index]: 'error' }));
    }
  }
  function sceneContent(scene: StoryboardView['document']['scenes'][number] | undefined) {
    return scene ? <div className="min-w-0 space-y-3 break-words [overflow-wrap:anywhere]">
      <h4 className="m-0 font-semibold">{scene.title}</h4>
      {scene.durationSeconds === undefined ? null : <p className="m-0 text-xs text-os-muted-paper">{t('seconds', { count: scene.durationSeconds })}</p>}
      <div><p className="m-0 text-xs font-semibold text-os-muted-paper">{t('narration')}</p><p className="m-0 mt-1 text-sm leading-6">{scene.narration}</p></div>
      <details className="rounded-control border border-os-rule-paper px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-os-vermilion-ink">{t('aiDrawingDetails')}</summary><p className="m-0 pb-3 text-sm leading-6 text-os-muted-paper">{visibleStoryboardAction(scene.visualAction)}</p></details>
      {scene.animation ? <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">{t('animationPlan')}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-control bg-os-ink p-3 font-data text-xs leading-5 text-os-paper">{JSON.stringify(scene.animation, null, 2)}</pre></details> : null}
      <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">{t('sources')}</summary><ul className="space-y-2 text-sm leading-6">{scene.sourceClaimIds.map((id) => <li key={id}>{names.get(id) ?? t('sourceUnavailable')}</li>)}</ul></details>
    </div> : <p className="text-sm text-os-muted-paper">{t('noScene')}</p>;
  }
  return <section className="min-w-0" data-storyboard-panel="true">
    <h3 className="m-0 text-lg font-semibold">{storyboard?.document.title ?? t('title')}</h3>
    <p className="m-0 mt-2 text-sm leading-6 text-os-muted-paper">{t('planOnly')}</p>
    {storyboard ? <ol className="m-0 mt-5 list-none p-0">{Array.from({ length: Math.max(storyboard.document.scenes.length, parent?.document.scenes.length ?? 0) }, (_, index) => <li key={index} className="border-t border-os-rule-paper py-5">
      <p className="m-0 mb-3 font-data text-xs text-os-vermilion-ink">{t('scene', { number: index + 1 })}</p>
      <div className={parent ? 'grid min-w-0 gap-5 md:grid-cols-2' : ''}>
        {parent ? <div className="min-w-0"><p className="m-0 mb-3 text-xs font-semibold text-os-muted-paper">{t('previous')}</p>{sceneContent(parent.document.scenes[index])}</div> : null}
        <div className="min-w-0">{parent ? <p className="m-0 mb-3 text-xs font-semibold text-os-vermilion-ink">{t('current')}</p> : null}{sceneContent(storyboard.document.scenes[index])}</div>
      </div>
      {canGenerateImage && onGenerateImage && baseAssetId && storyboard.document.scenes[index] ? <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" data-scene-image={index} disabled={sceneImageStates[index] === 'working'} aria-busy={sceneImageStates[index] === 'working'} className="min-h-11 rounded-control border border-os-vermilion-ink px-4 text-sm font-semibold text-os-vermilion-ink transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink disabled:opacity-40 motion-reduce:transform-none" onClick={() => submitSceneImage(index)}>{t('generateImage')}</button>
        <p className="m-0 text-xs leading-5 text-os-muted-paper">{t('imageCharge')}</p>
        {sceneImageStates[index] && sceneImageStates[index] !== 'idle' ? <p className="m-0 text-sm leading-5 text-os-muted-paper" role={sceneImageStates[index] === 'error' ? 'alert' : 'status'} data-scene-image-feedback={index} data-write-state={sceneImageStates[index]}>{feedbackText(sceneImageStates[index])}</p> : null}
      </div> : null}
    </li>)}</ol> : null}
    {storyboard?.baseAssetId && !parent ? <p className="text-sm text-os-muted-paper">{t('parentUnavailable')}</p> : null}
    {canGenerate && onGenerate ? <form className="mt-5 space-y-4 border-t border-os-rule-paper pt-5" onSubmit={(event) => {
      event.preventDefault();
      if (!selectedClaimIds.length || !instruction.trim()) return;
      if (!sourcesCurrent) return;
      submitGeneration(buildStoryboardRequest({ locale, style, output, instruction, baseAssetId, artOnly, storyboard, singlePaperImage }));
    }}>
      <p className="m-0 text-sm font-semibold">{t(baseAssetId ? 'reviseTitle' : 'createTitle')}</p>
      <fieldset className="border-0 p-0">
        <legend className="mb-2 text-xs font-semibold text-os-muted-paper">{t('style')}</legend>
        <div className="grid gap-2 sm:grid-cols-4">{(['auto', 'watercolor', 'technical', 'ink'] as const).map((value) => <label key={value} className={`cursor-pointer rounded-control border px-3 py-3 text-sm ${style === value ? 'border-os-vermilion-ink bg-os-paper-strong' : 'border-os-rule-paper bg-os-paper'}`}><input className="sr-only" type="radio" name={`storyboard-style-${baseAssetId ?? 'new'}`} value={value} checked={style === value} onChange={() => setStyle(value)} /><span className="block font-semibold">{t(value)}</span><span className="mt-1 block text-xs leading-5 text-os-muted-paper">{t(`styleDescription.${value}`)}</span></label>)}</div>
      </fieldset>
      <details className="rounded-control border border-os-rule-paper px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink">{t('manualDetails')}</summary>
        <div className="grid gap-4 pb-4">
          <label className="grid gap-2 text-sm">{t('language')}<select className={control} value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'zh')}><option value="zh">中文</option><option value="en">English</option></select></label>
          <label className="grid gap-2 text-sm">{t(baseAssetId ? 'feedback' : 'instruction')}<textarea className={`${control} min-h-24 resize-y`} maxLength={1000} required value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
        </div>
      </details>
      {baseAssetId ? <label className="flex items-start gap-3 rounded-control border border-os-rule-paper bg-os-paper px-3 py-3 text-sm"><input className="mt-1 size-4 accent-os-vermilion-ink" type="checkbox" checked={artOnly} onChange={(event) => setArtOnly(event.target.checked)} /><span><span className="block font-semibold">{t('artOnly')}</span><span className="mt-1 block text-xs leading-5 text-os-muted-paper">{t('artOnlyHint')}</span></span></label> : null}
      <p className="m-0 text-xs leading-5 text-os-muted-paper">{t('charge')}</p>
      {!sourcesCurrent ? <p className="m-0 text-sm leading-6 text-os-muted-paper" role="status">{t('needsSources')}</p> : null}
      {baseAssetId ? <p className="m-0 text-xs leading-5 text-os-muted-paper">{t('retained')}</p> : null}
      <button className="min-h-11 rounded-control bg-accent-primary-strong px-4 text-sm font-semibold transition-transform active:scale-[0.96] disabled:opacity-40 motion-reduce:transform-none" type="submit" disabled={!sourcesCurrent || !instruction.trim() || generationState === 'working'} aria-busy={generationState === 'working'}>{t(baseAssetId ? 'revise' : singlePaperImage ? 'planOneImage' : 'generate')}</button>
      {generationState !== 'idle' ? <p className="m-0 text-sm leading-5 text-os-muted-paper" role={generationState === 'error' ? 'alert' : 'status'} data-storyboard-feedback="true" data-write-state={generationState}>{feedbackText(generationState)}</p> : null}
    </form> : null}
  </section>;
}

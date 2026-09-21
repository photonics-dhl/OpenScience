'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  ApiClientError,
  authorizeHermesGenerationGrant,
  createHermesResearchRun,
  getAgentTask,
  getCurrentUser,
  getExistingHermesResearchRun,
  getHermesResearchRun,
  retryHermesGeneration,
  SESSION_CHANGED_EVENT,
  SESSION_INVALIDATED_EVENT,
  type DashboardTaskApi,
  type HermesResearchRun,
  type HermesNarrativeGeneration,
  type WorkspaceGuideResult,
} from '@/lib/api';
import { clearPendingHermesRunStart, getHermesDraftStorage, loadPendingHermesRunStart, readHermesResearchRunDraft, savePendingHermesRunStart, type PendingHermesRunStart } from '@/lib/hermes/draft-state';

function isEligible(task: DashboardTaskApi): boolean {
  return !task.state.startsWith('failed_');
}

function runHref(researchObjectId: string, runId: string): string {
  return `/research-objects/${encodeURIComponent(researchObjectId)}/hermes?run=${encodeURIComponent(runId)}`;
}

function reviewHref(researchObjectId: string, run: HermesResearchRun): string {
  const taskId = run.steps.find((step) => step.stage === 'source_ingestion' && step.status === 'succeeded')?.ingestionTaskId;
  const query = new URLSearchParams({ run: run.id });
  if (taskId) query.set('task', taskId);
  return `/research-objects/${encodeURIComponent(researchObjectId)}/hermes?${query.toString()}`;
}

export function HermesResearchRunPanel({ researchObjectId, tasks, runId, guideTaskId = '', activeTaskId, onRunCreated, onRunUpdated }: {
  researchObjectId: string;
  tasks: DashboardTaskApi[];
  runId: string;
  guideTaskId?: string;
  activeTaskId?: string;
  onRunCreated(run: HermesResearchRun): void;
  onRunUpdated?(run: HermesResearchRun): void;
}) {
  const t = useTranslations('hermesRun');
  const sourceStatus = useTranslations('ingestion.status');
  const locale = useLocale().startsWith('zh') ? 'zh' : 'en';
  const [run, setRun] = React.useState<HermesResearchRun | null>(null);
  const [instruction, setInstruction] = React.useState('');
  const [generationLocale, setGenerationLocale] = React.useState<'zh' | 'en'>(locale);
  const [style, setStyle] = React.useState('scientific');
  const [actorId, setActorId] = React.useState('');
  const actorRef = React.useRef('');
  const [restoredOwner, setRestoredOwner] = React.useState('');
  const [pendingRestored, setPendingRestored] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [resolvedSource, setResolvedSource] = React.useState('');
  const [resolveRetry, setResolveRetry] = React.useState(0);
  const [resolving, setResolving] = React.useState(false);
  React.useEffect(() => { if (!pendingRestored && !starting) setGenerationLocale(locale); }, [locale, pendingRestored, starting]);
  const startInFlight = React.useRef(false);
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [granting, setGranting] = React.useState(false);
  const grantInFlight = React.useRef(false);
  const grantRequest = React.useRef<{ actorId: string; runId: string; version: number; key: string } | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  const retryRequest = React.useRef<{ actorId: string; runId: string; version: number; key: string } | null>(null);
  const retryInFlight = React.useRef(false);
  const visibleRun = React.useRef(run);
  visibleRun.current = run;
  const [loading, setLoading] = React.useState(Boolean(runId));
  const [error, setError] = React.useState('');
  const [guideDraft, setGuideDraft] = React.useState<{ actorId: string; value: NonNullable<WorkspaceGuideResult['researchRunDraft']> } | null>(null);
  const [guideLoading, setGuideLoading] = React.useState(Boolean(guideTaskId));
  const [guideRetry, setGuideRetry] = React.useState(0);
  const guided = guideDraft?.actorId === actorId ? guideDraft.value : null;
  React.useEffect(() => {
    let active = true;
    let revision = 0;
    const clearViewer = () => {
      revision += 1; actorRef.current = ''; setActorId(''); setRestoredOwner('');
      setInstruction(''); setRun(null); setPendingRestored(false);
    };
    const refreshViewer = async () => {
      const requested = ++revision;
      try {
        const user = await getCurrentUser({ fresh: true });
        if (!active || revision !== requested) return;
        if (actorRef.current !== user.userId) {
          clearViewer(); actorRef.current = user.userId; setActorId(user.userId);
        }
      } catch {
        if (active && revision === requested) { clearViewer(); setError(t('narrative.identityError')); setLoading(false); }
      }
    };
    const changed = () => { clearViewer(); void refreshViewer(); };
    const focused = () => { void refreshViewer(); };
    void refreshViewer();
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    window.addEventListener(SESSION_INVALIDATED_EVENT, clearViewer);
    window.addEventListener('focus', focused);
    return () => {
      active = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, changed);
      window.removeEventListener(SESSION_INVALIDATED_EVENT, clearViewer);
      window.removeEventListener('focus', focused);
    };
  }, [t]);
  React.useEffect(() => {
    if (!guideTaskId || !actorId || runId) return;
    let active = true;
    setGuideLoading(true); setGuideDraft(null); setRestoredOwner('');
    // getAgentTask authorizes the stored session owner; URL/model data alone grants no authority.
    void getAgentTask('', guideTaskId).then(({ task }) => {
      if (!active || actorRef.current !== actorId) return;
      const draft = readHermesResearchRunDraft(task.result?.researchRunDraft);
      if (task.id !== guideTaskId || task.kind !== 'workspace.guide' || task.status !== 'succeeded'
        || task.researchObjectId !== researchObjectId || !draft || draft.researchObjectId !== researchObjectId
        || task.result?.needsMoreInformation !== false || task.result?.presentationDraft || task.result?.draftEdit
        || task.result?.writingDraft || !Array.isArray(task.result?.nextSteps) || task.result.nextSteps.length) throw new Error(t('narrative.guideUnavailable'));
      setGuideDraft({ actorId, value: draft }); setError('');
    }).catch(cause => { if (active && actorRef.current === actorId) setError(cause instanceof Error ? cause.message : t('narrative.guideUnavailable')); })
      .finally(() => { if (active && actorRef.current === actorId) setGuideLoading(false); });
    return () => { active = false; };
  }, [actorId, guideTaskId, guideRetry, researchObjectId, runId, t]);
  const eligibleTasks = React.useMemo(
    () => tasks.filter((task) => task.researchObjectId === researchObjectId && /\.pdf$/iu.test(task.logicalPath)
      && (isEligible(task) || (actorId && loadPendingHermesRunStart(getHermesDraftStorage(), {
        userId: actorId, researchObjectId, ingestionTaskId: task.id,
      })))),
    [actorId, researchObjectId, tasks],
  );
  const [selectedTaskId, setSelectedTaskId] = React.useState('');
  const restoreTask = React.useCallback((taskId: string) => {
    const pending = actorId ? loadPendingHermesRunStart(getHermesDraftStorage(), { userId: actorId, researchObjectId, ingestionTaskId: taskId }) : null;
    setSelectedTaskId(taskId);
    setInstruction(guided?.instruction ?? pending?.generation.instruction ?? '');
    setGenerationLocale(guided?.locale ?? pending?.generation.locale ?? locale);
    setStyle(guided?.style ?? pending?.generation.style ?? 'scientific');
    setPendingRestored(Boolean(pending && (!guided || (pending.generation.instruction === guided.instruction
      && pending.generation.locale === guided.locale && pending.generation.style === guided.style))));
  }, [actorId, researchObjectId, locale, guided]);
  const owner = `${actorId}:${researchObjectId}`;
  React.useEffect(() => {
    if (!actorId || !eligibleTasks.length || runId || (guideTaskId && (!guided || guideLoading))) return;
    if (restoredOwner === owner && (eligibleTasks.some(task => task.id === selectedTaskId) || (guided && !guided.ingestionTaskId && !selectedTaskId))) return;
    const pending = eligibleTasks.map(task => ({ task, request: loadPendingHermesRunStart(getHermesDraftStorage(), {
      userId: actorId, researchObjectId, ingestionTaskId: task.id,
    }) })).filter(item => item.request).sort((left, right) => right.request!.savedAt - left.request!.savedAt);
    const task = guided ? eligibleTasks.find(item => item.id === guided.ingestionTaskId)
      : eligibleTasks.find(item => item.id === activeTaskId) ?? pending[0]?.task ?? eligibleTasks[0]!;
    restoreTask(task?.id ?? ''); setRestoredOwner(owner);
    if (guided?.ingestionTaskId && !task) setError(t('narrative.guideSourceUnavailable'));
  }, [activeTaskId, actorId, eligibleTasks, owner, researchObjectId, restoreTask, restoredOwner, runId, selectedTaskId, guided, guideLoading, guideTaskId, t]);
  const selectedTask = eligibleTasks.find((task) => task.id === selectedTaskId)
    ?? (!guideTaskId ? eligibleTasks.find((task) => task.id === activeTaskId) ?? eligibleTasks[0] : null)
    ?? null;
  const sourceScope = `${owner}:${selectedTask?.id ?? ''}`;
  React.useEffect(() => {
    if (runId || !actorId || restoredOwner !== owner || !selectedTask) return;
    const controller = new AbortController();
    setResolving(true); setResolvedSource(''); setError('');
    void getExistingHermesResearchRun(researchObjectId, selectedTask.id, controller.signal).then(({ run: existing }) => {
      if (controller.signal.aborted || actorRef.current !== actorId) return;
      if (existing) {
        if (existing.actorId !== actorId || existing.researchObjectId !== researchObjectId
          || !existing.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === selectedTask.id)) {
          throw new Error(t('narrative.identityChanged'));
        }
        onRunCreated(existing);
      } else setResolvedSource(sourceScope);
    }).catch(cause => {
      if (!controller.signal.aborted && actorRef.current === actorId) setError(cause instanceof Error ? cause.message : t('loadError'));
    }).finally(() => {
      if (!controller.signal.aborted && actorRef.current === actorId) setResolving(false);
    });
    return () => controller.abort();
  }, [actorId, owner, restoredOwner, selectedTask?.id, researchObjectId, runId, sourceScope, resolveRetry, onRunCreated, t]);
  const sourceLabel = (task: DashboardTaskApi) => {
    const shortId = task.id.slice(0, 8);
    const id = eligibleTasks.some(other => other.id !== task.id && other.logicalPath === task.logicalPath && other.id.startsWith(shortId)) ? task.id : shortId;
    return `${task.logicalPath} · ${sourceStatus(task.state)} · ${id}`;
  };

  const loadRun = React.useCallback(async (signal?: AbortSignal, background = false) => {
    if (!runId || !actorId) return;
    if (!background) setLoading(true);
    try {
      const result = await getHermesResearchRun(researchObjectId, runId, signal);
      if (signal?.aborted || actorRef.current !== actorId) return;
      setRun(result.run);
      onRunUpdated?.(result.run);
      setError('');
    } catch (cause) {
      if (signal?.aborted || actorRef.current !== actorId) return;
      setError(cause instanceof ApiClientError ? cause.message : t('loadError'));
    } finally {
      if (!signal?.aborted && !background && actorRef.current === actorId) setLoading(false);
    }
  }, [actorId, researchObjectId, runId, t, onRunUpdated]);

  React.useEffect(() => {
    if (!runId || run?.id !== runId || run.actorId !== actorId || run.researchObjectId !== researchObjectId) return;
    for (const step of run.steps) {
      if (step.stage === 'source_ingestion' && step.ingestionTaskId) clearPendingHermesRunStart(getHermesDraftStorage(), {
        userId: actorId, researchObjectId, ingestionTaskId: step.ingestionTaskId,
      }, runId);
    }
  }, [actorId, researchObjectId, run, runId]);

  React.useEffect(() => {
    if (!runId) { setRun(null); setLoading(false); return undefined; }
    const controller = new AbortController();
    setRun(null);
    void loadRun(controller.signal);
    return () => controller.abort();
  }, [loadRun, runId]);

  React.useEffect(() => {
    if (!runId || !run || ['succeeded', 'failed', 'stopped'].includes(run.status)) return undefined;
    const controller = new AbortController();
    let timer: number;
    const refresh = async () => {
      await loadRun(controller.signal, true);
      if (!controller.signal.aborted) timer = window.setTimeout(() => { void refresh(); }, 5_000);
    };
    timer = window.setTimeout(() => { void refresh(); }, 5_000);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [loadRun, run?.status, runId]);

  const start = React.useCallback(async () => {
    if (!selectedTask || !actorId || restoredOwner !== owner || resolvedSource !== sourceScope || startInFlight.current || (guideTaskId && (!guided || guideLoading))) return;
    startInFlight.current = true;
    setStarting(true); setError('');
    try {
      const viewer = await getCurrentUser({ fresh: true });
      if (!mounted.current || actorRef.current !== actorId) return;
      if (viewer.userId !== actorId) {
        actorRef.current = viewer.userId; setActorId(viewer.userId); setRestoredOwner(''); setInstruction('');
        setError(t('narrative.identityChanged')); return;
      }
      const existing = await getExistingHermesResearchRun(researchObjectId, selectedTask.id);
      if (!mounted.current || actorRef.current !== actorId) return;
      if (existing.run) { onRunCreated(existing.run); return; }
      const generation: HermesNarrativeGeneration = { profile: 'visual-narrative-v1', maxAgentTasks: 9,
        locale: guided?.locale ?? generationLocale, style: guided?.style ?? style, instruction: guided?.instruction ?? (instruction.trim() || t('narrative.defaultGoal')) };
      const scope = { userId: actorId, researchObjectId, ingestionTaskId: selectedTask.id };
      const storage = getHermesDraftStorage();
      const pending = loadPendingHermesRunStart(storage, scope);
      const guideKey = guided ? `hermes-guide-run:${actorId}:${guideTaskId}:${selectedTask.id}` : null;
      const request: PendingHermesRunStart = pending && (!guideKey || pending.key === guideKey) && JSON.stringify(pending.generation) === JSON.stringify(generation)
        ? pending : { key: guideKey ?? crypto.randomUUID(), generation, savedAt: Date.now() };
      // Persist before the paid mutation; all unknown outcomes retain this exact request.
      if (!savePendingHermesRunStart(storage, scope, request)) throw new Error(t('narrative.storageError'));
      setPendingRestored(true);
      const result = request.runId ? await getHermesResearchRun(researchObjectId, request.runId)
        : await createHermesResearchRun(researchObjectId, [selectedTask.id], request.key, request.generation);
      if (!mounted.current || actorRef.current !== actorId) return;
      if (result.run.actorId !== actorId || result.run.researchObjectId !== researchObjectId
        || !result.run.steps.some(step => step.stage === 'source_ingestion' && step.ingestionTaskId === selectedTask.id)) {
        throw new Error(t('narrative.identityChanged'));
      }
      savePendingHermesRunStart(storage, scope, { ...request, runId: result.run.id });
      setRun(result.run);
      onRunCreated(result.run);
    } catch (cause) {
      if (mounted.current && actorRef.current === actorId) setError(cause instanceof Error ? cause.message : t('startError'));
    } finally {
      startInFlight.current = false;
      if (mounted.current) setStarting(false);
    }
  }, [selectedTask, actorId, restoredOwner, owner, resolvedSource, sourceScope, guideTaskId, guided, guideLoading, generationLocale, style, instruction, researchObjectId, onRunCreated, t]);

  async function upgradeGenerationGrant() {
    if (!run || grantInFlight.current || !actorId || run.actorId !== actorId) return;
    const requestedActor = actorId;
    const requestedRun = run;
    const previous = grantRequest.current;
    const current = previous?.actorId === actorId && previous.runId === run.id && previous.version === run.version
      ? previous : { actorId, runId: run.id, version: run.version, key: crypto.randomUUID() };
    grantRequest.current = current;
    grantInFlight.current = true;
    setGranting(true); setError('');
    try {
      const viewer = await getCurrentUser({ fresh: true });
      if (!mounted.current || viewer.userId !== requestedActor || actorRef.current !== requestedActor
        || visibleRun.current?.id !== requestedRun.id || visibleRun.current.version !== requestedRun.version)
        throw new Error(t('narrative.identityChanged'));
      const result = await authorizeHermesGenerationGrant(researchObjectId, requestedRun.id, requestedRun.version,
        requestedRun.canAuthorizeNarrativeCorrection ? { profile: 'visual-narrative-v1', maxAgentTasks: requestedRun.maxAgentTasks === 11 ? 13 : 11, idempotencyKey: current.key } : undefined);
      if (!mounted.current || actorRef.current !== requestedActor || visibleRun.current?.id !== requestedRun.id) return;
      setRun(result.run);
      onRunUpdated?.(result.run);
    } catch (cause) {
      if (mounted.current && actorRef.current === requestedActor && visibleRun.current?.id === requestedRun.id)
        setError(cause instanceof Error ? cause.message : t('grantError'));
    } finally {
      grantInFlight.current = false;
      if (mounted.current) setGranting(false);
    }
  }

  async function retryGeneration() {
    if (!run?.canRetryGeneration || retryInFlight.current || !actorId || run.actorId !== actorId) return;
    const requestedActor = actorId;
    const requestedRun = run;
    const previous = retryRequest.current;
    const current = previous?.actorId === actorId && previous.runId === run.id && previous.version === run.version
      ? previous : { actorId, runId: run.id, version: run.version, key: crypto.randomUUID() };
    retryRequest.current = current;
    retryInFlight.current = true;
    setRetrying(true); setError('');
    try {
      const viewer = await getCurrentUser({ fresh: true });
      if (!mounted.current || viewer.userId !== requestedActor || actorRef.current !== requestedActor
        || visibleRun.current?.id !== requestedRun.id || visibleRun.current.version !== requestedRun.version)
        throw new Error(t('narrative.identityChanged'));
      const result = await retryHermesGeneration(researchObjectId, requestedRun.id, requestedRun.version, current.key);
      if (!mounted.current || actorRef.current !== requestedActor || visibleRun.current?.id !== requestedRun.id) return;
      setRun(result.run);
      onRunUpdated?.(result.run);
    } catch (cause) {
      if (mounted.current && actorRef.current === requestedActor && visibleRun.current?.id === requestedRun.id)
        setError(cause instanceof ApiClientError ? cause.message : t('retryError'));
    } finally {
      retryInFlight.current = false;
      if (mounted.current) setRetrying(false);
    }
  }

  const narrative = run?.profile === 'visual-narrative-v1';
  const sourceReady = run?.status === 'awaiting_source_review';
  const claimReviewReady = run?.status === 'awaiting_claim_review' && Boolean(run.versionId);
  const terminal = run?.status === 'failed' || run?.status === 'stopped';
  const presentationReady = Boolean(run?.versionId && (run.steps.some(step => ['storyboard', 'scene_image', 'video'].includes(step.stage)) || [
    'generating_storyboard', 'awaiting_storyboard_review',
    'generating_scene_images', 'awaiting_scene_images_review', 'generating_video', 'awaiting_video_review', 'succeeded',
  ].includes(run.status)));
  const imageSteps = run?.steps.filter(step => step.stage === 'scene_image') ?? [];
  const legacyGrantNeedsUpgrade = Boolean(run
    && ['awaiting_claim_review', 'awaiting_storyboard_review'].includes(run.status)
    && run.profile === 'onchip-field-sampling-v1' && run.maxAgentTasks === 7);
  const narrativeStage = terminal ? 'incomplete' : run?.status === 'succeeded' ? 'complete'
    : ['generating_storyboard', 'awaiting_storyboard_review'].includes(run?.status ?? '') ? 'planning'
      : run?.status === 'generating_scene_images' ? 'illustrating'
        : ['awaiting_scene_images_review', 'generating_video', 'awaiting_video_review'].includes(run?.status ?? '') ? 'reviewing' : 'understanding';
  const steps = run ? <ol className="mt-4 divide-y divide-os-rule-paper border-y border-os-rule-paper">
    {run.steps.map((step) => <li key={step.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{t(`stage.${step.stage}`, { number: step.ordinal + 1 })}</span><span className="font-data text-os-muted-paper">{narrative && (step.status === 'awaiting_approval' || (step.availableAssetId && step.availableAssetStatus !== 'approved')) ? t('narrative.internalReview') : step.availableAssetId ? t(step.availableAssetStatus === 'approved' ? 'step.succeeded' : 'step.awaiting_approval') : t(`step.${step.status}`)}</span></li>)}
  </ol> : null;
  return <section className="surface-folio-sheet mt-7 max-w-3xl border-y border-os-rule-paper px-5 py-6 sm:px-7" aria-labelledby="hermes-run-title" data-hermes-research-run={run?.status ?? 'new'}>
    <p data-reading-role="caption" className="text-os-vermilion-ink">Hermes</p>
    <h2 id="hermes-run-title" className="mt-2 text-2xl font-medium text-os-ink">{t('title')}</h2>
    {!runId && !run && !loading && !resolving && (!selectedTask || resolvedSource === sourceScope) && (!guideTaskId || (guided && !guideLoading)) ? <>
      <p className="mt-3 max-w-[66ch] leading-7 text-os-muted-paper">{t(eligibleTasks.length ? 'narrative.startDescription' : 'narrative.unavailableDescription')}</p>
      {guided ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-os-ink">{guided.instruction}</p> : null}
      {(!guided && eligibleTasks.length > 1) || (guided && !guided.ingestionTaskId && eligibleTasks.length > 0) ? <label className="mt-4 grid max-w-lg gap-2 text-sm font-semibold text-os-ink">{t('sourceLabel')}<select disabled={starting || !actorId || restoredOwner !== owner} value={selectedTask?.id ?? ''} onChange={(event) => restoreTask(event.target.value)} className="min-h-11 rounded-panel border border-os-rule-paper bg-os-paper px-3 font-normal disabled:opacity-50">{guided ? <option value="" disabled>{t('narrative.chooseSource')}</option> : null}{eligibleTasks.map((task) => <option key={task.id} value={task.id}>{sourceLabel(task)}</option>)}</select></label> : null}
      {selectedTask ? <>
        {!guided ? <label className="mt-5 grid gap-2 text-sm font-semibold text-os-ink">{t('narrative.goalLabel')}<textarea value={instruction} onChange={(event) => { setInstruction(event.target.value); setGenerationLocale(locale); setPendingRestored(false); }} maxLength={1000} rows={3} disabled={starting || !actorId || restoredOwner !== owner} placeholder={t('narrative.goalPlaceholder')} className="w-full resize-y rounded-panel border border-os-rule-paper bg-os-paper p-3 font-normal leading-6 disabled:opacity-50" /></label> : null}
        {pendingRestored ? <p className="mt-3 text-sm leading-6 text-os-muted-paper" role="status">{t('narrative.pendingRestored')}</p> : null}
        <button type="button" onClick={() => void start()} disabled={starting || !actorId || restoredOwner !== owner} className="mt-5 min-h-11 rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white disabled:opacity-40">{t(starting ? 'starting' : pendingRestored ? 'narrative.resumePending' : 'narrative.startFor', { source: sourceLabel(selectedTask) })}</button>
      </> : null}
    </> : null}
    {loading || resolving || (guideTaskId && guideLoading) ? <p role="status" className="mt-4 text-os-muted-paper">{t('loading')}</p> : null}
    {error ? <div className="mt-4 border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{error}</div> : null}
    {!runId && !resolving && error ? <button type="button" onClick={() => setResolveRetry(value => value + 1)} className="mt-3 min-h-11 font-semibold text-os-vermilion-ink underline">{t('narrative.refreshStatus')}</button> : null}
    {runId && !run && !loading && error ? <button type="button" onClick={() => void loadRun()} className="mt-3 min-h-11 font-semibold text-os-vermilion-ink underline">{t('narrative.refreshStatus')}</button> : null}
    {guideTaskId && !guided && !guideLoading && error ? <button type="button" onClick={() => setGuideRetry(value => value + 1)} className="mt-3 min-h-11 font-semibold text-os-vermilion-ink underline">{t('narrative.refreshStatus')}</button> : null}
    {run && narrative ? <div className="mt-4 border-t border-os-rule-paper pt-4">
      <p className="font-semibold text-os-ink" role="status">{t(`narrative.status.${narrativeStage}`)}</p>
      <p className="mt-2 text-sm leading-6 text-os-muted-paper">{t(terminal ? 'narrative.incompleteDescription' : run.status === 'succeeded' ? 'narrative.completeDescription' : 'narrative.runningDescription')}</p>
      {imageSteps.length ? <p className="mt-3 text-sm font-semibold text-os-vermilion-ink" role="status">{t('narrative.imageProgress', { current: run.availableImageCount ?? 0, total: imageSteps.length })}</p> : null}
      {run.canAuthorizeNarrativeCorrection ? <div className="mt-4">
        <p className="text-sm leading-6 text-os-muted-paper">{t(run.maxAgentTasks === 11 ? 'narrative.finalCorrectionGrantDescription' : 'narrative.correctionGrantDescription')}</p>
        <button type="button" disabled={granting || retrying} onClick={() => void upgradeGenerationGrant()} className="mt-3 min-h-11 rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white disabled:opacity-40">{t(granting ? 'granting' : 'narrative.authorizeCorrection', { count: run.maxAgentTasks === 11 ? 2 : 3 })}</button>
      </div> : null}
      {run.canRetryGeneration ? <div className="mt-4">
        <p className="text-sm leading-6 text-os-muted-paper">{t(run.generationRecovery === 'storyboard-art' ? run.chargeableAttempts === 0 ? 'narrative.resumeArtInterruptedDescription' : 'narrative.resumeArtDescription' : run.generationRecovery === 'storyboard-planning' ? 'narrative.resumePlanningDescription' : run.generationRecovery === 'storyboard-review' ? 'narrative.resumeMediaDescription' : (run.maxAgentTasks ?? 0) >= 11 ? 'narrative.resumeCorrectionDescription' : run.versionId ? 'narrative.resumeMediaDescription' : 'narrative.resumeDescription', { count: run.chargeableAttempts ?? 0 })}</p>
        <button type="button" disabled={retrying} onClick={() => void retryGeneration()} className="mt-3 min-h-11 rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white disabled:opacity-40">{t(retrying ? 'retrying' : 'narrative.resume')}</button>
      </div> : null}
      <details className="mt-4 text-sm text-os-muted-paper"><summary className="min-h-11 cursor-pointer py-3">{t('narrative.details')}</summary>{steps}</details>
      {run.status === 'succeeded' && run.versionId ? <Link className="mt-5 inline-flex min-h-11 items-center rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white" href={`/research-objects/${encodeURIComponent(researchObjectId)}/overview?version=${encodeURIComponent(run.versionId)}`}>{t('narrative.viewResult')}</Link> : null}
    </div> : run ? <div className="mt-4 border-t border-os-rule-paper pt-4">
      <p className="font-semibold text-os-ink">{t(`status.${run.status}`)}</p>
      <p className="mt-2 text-sm leading-6 text-os-muted-paper">{run.imageUsageLimited ? t('usageLimited') : run.profile === 'content-driven-image-v1' && run.status === 'awaiting_scene_images_review' ? t('imageReviewDescription') : t(`description.${run.status}`)}</p>
      {imageSteps.length ? <p className="mt-3 text-sm font-semibold text-os-vermilion-ink" role="status">{t('imageProgress', { current: run.availableImageCount ?? 0, total: imageSteps.length })}</p> : null}
      {steps}
      {run.error && !run.imageUsageLimited ? <p className="mt-3 text-sm text-os-vermilion-ink">{t(/write conflict|deadlock|P2034/i.test(run.error) ? 'saveConflict' : 'stepFailed')}</p> : null}
      {run.canRetryGeneration && run.chargeableAttempts !== undefined ? <p className="mt-3 text-sm leading-6 text-os-muted-paper">{t('retryDescription', { count: run.chargeableAttempts })}</p> : null}
      <nav className="mt-5 flex flex-wrap gap-4" aria-label={t('actions')}>
        {run.canRetryGeneration ? <button type="button" disabled={retrying} onClick={() => void retryGeneration()} className="inline-flex min-h-11 items-center rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white disabled:opacity-40">{t(retrying ? 'retrying' : 'retryGeneration')}</button> : null}
        {sourceReady ? <Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={reviewHref(researchObjectId, run)}>{t('reviewSource')}</Link> : null}
        {claimReviewReady && run?.versionId ? <Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`${runHref(researchObjectId, run.id)}&claimReview=1`}>{t('reviewClaims')}</Link> : null}
        {presentationReady && run?.versionId ? <Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(researchObjectId)}/presentation?version=${encodeURIComponent(run.versionId)}`}>{t('reviewPresentation')}</Link> : null}
        {legacyGrantNeedsUpgrade ? <button type="button" disabled={granting} onClick={() => void upgradeGenerationGrant()} className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline disabled:opacity-40">{t(granting ? 'granting' : 'upgradeGrant')}</button> : null}
        <Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={runHref(researchObjectId, run.id)}>{t('reopen')}</Link>
        {terminal ? <Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(researchObjectId)}/files`}>{t('openFiles')}</Link> : null}
      </nav>
    </div> : null}
  </section>;
}

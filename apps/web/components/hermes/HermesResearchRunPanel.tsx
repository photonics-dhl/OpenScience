'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  ApiClientError,
  authorizeHermesGenerationGrant,
  createHermesResearchRun,
  getHermesResearchRun,
  retryHermesGeneration,
  type DashboardTaskApi,
  type HermesResearchRun,
} from '@/lib/api';

function isEligible(task: DashboardTaskApi): boolean {
  return !task.state.startsWith('failed_');
}

function runHref(researchObjectId: string, runId: string): string {
  return `/research-objects/${encodeURIComponent(researchObjectId)}/hermes?run=${encodeURIComponent(runId)}`;
}

function reviewHref(researchObjectId: string, run: HermesResearchRun): string {
  const taskId = run.steps.find((step) => step.status === 'succeeded')?.ingestionTaskId;
  const query = new URLSearchParams({ run: run.id });
  if (taskId) query.set('task', taskId);
  return `/research-objects/${encodeURIComponent(researchObjectId)}/hermes?${query.toString()}`;
}

export function HermesResearchRunPanel({ researchObjectId, tasks, runId, activeTaskId, onRunCreated }: {
  researchObjectId: string;
  tasks: DashboardTaskApi[];
  runId: string;
  activeTaskId?: string;
  onRunCreated(run: HermesResearchRun): void;
}) {
  const t = useTranslations('hermesRun');
  const [run, setRun] = React.useState<HermesResearchRun | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [granting, setGranting] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const retryRequest = React.useRef<{ runId: string; version: number; key: string } | null>(null);
  const [loading, setLoading] = React.useState(Boolean(runId));
  const [error, setError] = React.useState('');
  const eligibleTasks = React.useMemo(
    () => tasks.filter((task) => task.researchObjectId === researchObjectId && isEligible(task)),
    [researchObjectId, tasks],
  );
  const [selectedTaskId, setSelectedTaskId] = React.useState('');
  React.useEffect(() => {
    const active = eligibleTasks.find((task) => task.id === activeTaskId);
    setSelectedTaskId((current) => active?.id ?? (eligibleTasks.some((task) => task.id === current) ? current : eligibleTasks[0]?.id ?? ''));
  }, [activeTaskId, eligibleTasks]);
  const selectedTask = eligibleTasks.find((task) => task.id === selectedTaskId)
    ?? eligibleTasks.find((task) => task.id === activeTaskId)
    ?? eligibleTasks[0]
    ?? null;

  const loadRun = React.useCallback(async (signal?: AbortSignal) => {
    if (!runId) return;
    setLoading(true);
    try {
      const result = await getHermesResearchRun(researchObjectId, runId, signal);
      setRun(result.run);
      setError('');
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof ApiClientError ? cause.message : t('loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [researchObjectId, runId, t]);

  React.useEffect(() => {
    if (!runId) { setRun(null); setError(''); setLoading(false); return undefined; }
    const controller = new AbortController();
    void loadRun(controller.signal);
    return () => controller.abort();
  }, [loadRun, runId]);

  React.useEffect(() => {
    if (!runId || !run || ['succeeded', 'failed', 'stopped'].includes(run.status)) return undefined;
    const timer = window.setInterval(() => { void loadRun(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [loadRun, run?.status, runId]);

  async function start() {
    if (!selectedTask || starting) return;
    setStarting(true); setError('');
    try {
      const result = await createHermesResearchRun(researchObjectId, [selectedTask.id], crypto.randomUUID());
      setRun(result.run);
      onRunCreated(result.run);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('startError'));
    } finally {
      setStarting(false);
    }
  }

  async function upgradeGenerationGrant() {
    if (!run || granting) return;
    setGranting(true); setError('');
    try {
      const result = await authorizeHermesGenerationGrant(researchObjectId, run.id, run.version);
      setRun(result.run);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('grantError'));
    } finally {
      setGranting(false);
    }
  }

  async function retryGeneration() {
    if (!run?.canRetryGeneration || retrying) return;
    const previous = retryRequest.current;
    const current = previous?.runId === run.id && previous.version === run.version
      ? previous : { runId: run.id, version: run.version, key: crypto.randomUUID() };
    retryRequest.current = current;
    setRetrying(true); setError('');
    try {
      const result = await retryHermesGeneration(researchObjectId, run.id, run.version, current.key);
      setRun(result.run);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : t('retryError'));
    } finally {
      setRetrying(false);
    }
  }

  const sourceReady = run?.status === 'awaiting_source_review';
  const claimReviewReady = run?.status === 'awaiting_claim_review' && Boolean(run.versionId);
  const terminal = run?.status === 'failed' || run?.status === 'stopped';
  const presentationReady = Boolean(run?.versionId && [
    'generating_storyboard', 'awaiting_storyboard_review',
    'generating_scene_images', 'awaiting_scene_images_review', 'generating_video', 'awaiting_video_review', 'succeeded',
  ].includes(run.status));
  const legacyGrantNeedsUpgrade = Boolean(run
    && ['awaiting_claim_review', 'awaiting_storyboard_review'].includes(run.status)
    && run.profile === 'onchip-field-sampling-v1' && run.maxAgentTasks === 7);
  return <section className="surface-folio-sheet mt-7 max-w-3xl border-y border-os-rule-paper px-5 py-6 sm:px-7" aria-labelledby="hermes-run-title" data-hermes-research-run={run?.status ?? 'new'}>
    <p data-reading-role="caption" className="text-os-vermilion-ink">Hermes</p>
    <h2 id="hermes-run-title" className="mt-2 text-2xl font-medium text-os-ink">{t('title')}</h2>
    {!run && !loading ? <>
      <p className="mt-3 max-w-[66ch] leading-7 text-os-muted-paper">{t(eligibleTasks.length ? 'startDescription' : 'unavailableDescription')}</p>
      {eligibleTasks.length > 1 ? <label className="mt-4 grid max-w-lg gap-2 text-sm font-semibold text-os-ink">{t('sourceLabel')}<select value={selectedTask?.id ?? ''} onChange={(event) => setSelectedTaskId(event.target.value)} className="min-h-11 rounded-panel border border-os-rule-paper bg-os-paper px-3 font-normal">{eligibleTasks.map((task) => <option key={task.id} value={task.id}>{task.logicalPath}</option>)}</select></label> : null}
      {selectedTask ? <button type="button" onClick={() => void start()} disabled={starting} className="mt-5 min-h-11 rounded-panel bg-os-vermilion-ink px-4 py-2 font-semibold text-white disabled:opacity-40">{t(starting ? 'starting' : 'startFor', { source: selectedTask.logicalPath })}</button> : null}
    </> : null}
    {loading ? <p role="status" className="mt-4 text-os-muted-paper">{t('loading')}</p> : null}
    {error ? <div className="mt-4 border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{error}</div> : null}
    {run ? <div className="mt-4 border-t border-os-rule-paper pt-4">
      <p className="font-semibold text-os-ink">{t(`status.${run.status}`)}</p>
      <p className="mt-2 leading-7 text-os-muted-paper">{t(`description.${run.status}`)}</p>
      <ol className="mt-4 divide-y divide-os-rule-paper border-y border-os-rule-paper">
        {run.steps.map((step) => <li key={step.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{t(step.stage === 'source_ingestion' ? 'source' : 'stepName', { number: step.ordinal + 1 })}</span><span className="font-data text-os-muted-paper">{t(`step.${step.status}`)}</span></li>)}
      </ol>
      {run.error ? <p className="mt-3 text-sm text-os-vermilion-ink">{run.error}</p> : null}
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

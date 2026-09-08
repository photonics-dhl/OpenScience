'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HermesTaskEntry, loadScopedHermesReview } from '@/components/hermes/HermesTaskEntry';
import { HermesResearchRunPanel } from '@/components/hermes/HermesResearchRunPanel';
import { HermesClaimEvidenceReview } from '@/components/hermes/HermesClaimEvidenceReview';
import { HermesSourceReview } from '@/components/hermes/HermesSourceReview';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import { HermesExtractionEvidence } from '@/components/hermes/HermesExtractionEvidence';
import { ResearchWorkspaceNav } from '@/components/research/ResearchWorkspaceNav';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { ApiClientError, confirmIngestionTask, apiRequest, getHermesResearchRun, getResearchObject, getIngestionTask, getResearchIngestion, retryIngestionTask, type IngestionConfirmation, type DashboardTaskApi, type HermesResearchRun, type IngestionTaskDetail, type SdfCore } from '@/lib/api';

const fields: Array<keyof SdfCore> = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
const emptyCore = (): SdfCore => ({ schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' });
const hasExactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> => Boolean(value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','));
export function isCanonicalAllMissingExtraction(task: Pick<IngestionTaskDetail['task'], 'state' | 'result' | 'retryCount'>): boolean {
  if (task.state !== 'needs_review' || task.retryCount !== 1 || !task.result || typeof task.result !== 'object') return false;
  const result = task.result as Record<string, unknown>;
  const core = result.core;
  const segments = result.evidenceSegments;
  const evidence = result.evidence;
  const missing = result.needsMoreInformation;
  return Boolean(hasExactKeys(core, ['schemaVersion', ...fields]) && core.schemaVersion === '0.1.0'
    && fields.every((field) => core[field] === '')
    && Array.isArray(missing) && missing.length === fields.length && new Set(missing).size === fields.length
    && fields.every((field) => missing.includes(field))
    && hasExactKeys(segments, fields) && fields.every((field) => { const value = segments[field]; return Array.isArray(value) && value.length === 0; })
    && hasExactKeys(evidence, fields) && fields.every((field) => { const value = evidence[field]; return hasExactKeys(value, ['quote', 'locator'])
      && value.quote === '' && value.locator === ''; })
    && result.sourceMapAvailable === true);
}
export function isRetryableSdfExtraction(task: Pick<IngestionTaskDetail['task'], 'state' | 'result' | 'retryCount'> & { error?: string | null }): boolean {
  const result = task.result;
  return isCanonicalAllMissingExtraction(task) || (task.state === 'failed_retryable' && (task.retryCount < 2 || (task.retryCount === 2 && ['结构化输出超过重试上限', 'canonical_validation_exhausted'].includes(task.error ?? '')))) || (task.retryCount === 0 && ((task.state === 'needs_review' && Boolean(result && typeof result === 'object'
    && (result as Record<string, unknown>).status === 'needs_review'
    && (result as Record<string, unknown>).reason === 'sdf-proposal-unavailable'
    && !Object.hasOwn(result as object, 'core')))));
}
export default function HermesReviewPage({ params: routeParams }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const taskId = searchParams.get('task') ?? '';
  const runId = searchParams.get('run') ?? '';
  const claimReview = searchParams.get('claimReview') === '1';
  return <HermesResearchPage key={`${routeParams.id}:${taskId}:${runId}:${claimReview}`} routeParams={routeParams} taskId={taskId} runId={runId} claimReview={claimReview} />;
}

function HermesResearchPage({ routeParams, taskId, runId, claimReview }: { routeParams: { id: string }; taskId: string; runId: string; claimReview: boolean }) {
  const router = useRouter();
  const locale = useLocale() as 'zh' | 'en';
  const t = useTranslations('hermesReview');
  const shell = useTranslations('shell');
  const fieldT = useTranslations('editor');
  const statusT = useTranslations('ingestion.status');
  const [detail, setDetail] = useState<IngestionTaskDetail | null>(null);
  const [core, setCore] = useState<SdfCore>(emptyCore);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmation, setConfirmation] = useState<IngestionConfirmation | null>(null);
  const [hermesOpen, setHermesOpen] = useState(false);
  const [run, setRun] = useState<HermesResearchRun | null>(null);

  const [researchTitle, setResearchTitle] = useState('');
  const [researchStatus, setResearchStatus] = useState('draft');
  const [tasks, setTasks] = useState<DashboardTaskApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!runId) { setRun(null); return; }
    const controller = new AbortController();
    void getHermesResearchRun(routeParams.id, runId, controller.signal).then((result) => { if (!controller.signal.aborted) setRun(result.run); });
    return () => controller.abort();
  }, [routeParams.id, runId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setDetail(null); setCore(emptyCore()); setSaved(false); setConfirmation(null);
    const load = taskId ? Promise.all([loadScopedHermesReview(routeParams.id, taskId, getIngestionTask), getResearchIngestion(routeParams.id)]).then(async ([value, recovery]) => {
      if (cancelled) return;
      const confirmed = recovery.tasks.find((task) => task.id === taskId)?.confirmation ?? null;
      const proposed = (value.task.result as { core?: SdfCore } | null)?.core;
      if (confirmed) {
        try {
          const snapshot = await apiRequest<{ version: { versionId: string; snapshot: { core: SdfCore } } }>(`/api/versions/${encodeURIComponent(confirmed.versionId)}`);
          if (snapshot.version.versionId !== confirmed.versionId) throw new Error('Version snapshot mismatch');
          if (!cancelled) setCore({ ...emptyCore(), ...snapshot.version.snapshot.core });
        } catch { throw new Error(t('snapshotLoadError')); }
      } else if (proposed) setCore({ ...emptyCore(), ...proposed });
      if (cancelled) return;
      setDetail({ ...value, version: recovery.version });
      setConfirmation(confirmed);
      setSaved(value.task.state === 'confirmed' || value.task.state === 'written');
    }) : Promise.all([getResearchObject(routeParams.id), getResearchIngestion(routeParams.id)]).then(([research, value]) => {
      if (!cancelled) { setTasks(value.tasks.map((task) => ({ ...task, researchObjectId: routeParams.id, researchTitle: research.researchObject.title }))); setResearchTitle(research.researchObject.title); setResearchStatus(research.researchObject.status); }
    });
    load.catch((cause) => {
      if (cancelled) return;
      if (cause instanceof ApiClientError && cause.status === 401) {
        router.replace(`/auth/login?returnTo=${encodeURIComponent(`/research-objects/${routeParams.id}/hermes${taskId ? `?task=${encodeURIComponent(taskId)}` : ''}`)}`);
      }
      setError(cause instanceof Error && cause.message === 'HERMES_TASK_SCOPE_MISMATCH' ? t('scopeMismatch') : cause instanceof Error ? cause.message : t('loadError'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId, routeParams.id, reload, router, t]);

  useEffect(() => {
    if (!detail || !['queued', 'stored', 'parsing'].includes(detail.task.state)) return;
    const timer = window.setTimeout(() => setReload((value) => value + 1), 1_500);
    return () => window.clearTimeout(timer);
  }, [detail]);

  const complete = useMemo(() => fields.every((field) => core[field].trim().length > 0), [core]);
  const canonicalAllMissing = detail ? isCanonicalAllMissingExtraction(detail.task) : false;
  const paidReanalysis = canonicalAllMissing || (detail?.task.state === 'failed_retryable' && detail.task.retryCount === 1);
  const compensatedReanalysis = detail?.task.state === 'failed_retryable' && detail.task.retryCount === 2;
  const proposalUnavailable = detail ? isRetryableSdfExtraction(detail.task) : false;
  const approvalOpen = detail?.task.state === 'needs_review' && !proposalUnavailable;
  const reviewSuggestion = useMemo(() => detail ? ({
    bodyKey: 'guide.review.body',
    href: `/research-objects/${encodeURIComponent(detail.researchObjectId)}/edit`,
    kind: 'actionable-task' as const,
    researchObjectId: detail.researchObjectId,
    taskId,
    titleKey: 'guide.review.title',
  }) : ({ bodyKey: 'guide.neutral.body', kind: 'neutral' as const, titleKey: 'guide.neutral.title' }), [detail, taskId]);
  async function confirm() {
    if (!detail || !approvalOpen || saving || saved || detail.researchObjectId !== routeParams.id) return;
    setSaving(true); setError('');
    try {
      const result = await confirmIngestionTask(taskId, { version: detail.version, core });
      if (!mounted.current) return;
      setSaved(true); setConfirmation(result.confirmation);
      if (!runId) router.push(`/research-objects/${encodeURIComponent(routeParams.id)}/versions?version=${encodeURIComponent(result.confirmation.versionId)}`);
    }
    catch (cause) { if (mounted.current) setError(cause instanceof ApiClientError ? cause.message : t('confirmError')); }
    finally { if (mounted.current) setSaving(false); }
  }
  async function retryExtraction() {
    if (!detail || !proposalUnavailable || saving || detail.researchObjectId !== routeParams.id) return;
    setSaving(true); setError('');
    try {
      await retryIngestionTask(taskId);
      if (mounted.current) setReload((value) => value + 1);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof ApiClientError ? cause.message : t('proposalRetryError'));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const workspaceNavigation = (
    <div className="overflow-x-auto border-b border-os-rule-paper" data-workspace-mode-tabs="true">
      <ResearchWorkspaceNav active="hermes" objectId={routeParams.id} />
    </div>
  );
  const literatureEntry = (
    <div className="mt-7 max-w-3xl">
      <LiteratureAcquisitionDisclosure instanceId="ro-hermes-literature" onAuthenticationRequired={() => router.replace(`/auth/login?returnTo=${encodeURIComponent(`/research-objects/${routeParams.id}/hermes${taskId ? `?task=${taskId}` : ''}`)}`)} target={{ kind: 'research_object', researchObjectId: routeParams.id }} />
    </div>
  );

  const onRunCreated = (run: { id: string }) => router.replace(`/research-objects/${encodeURIComponent(routeParams.id)}/hermes?run=${encodeURIComponent(run.id)}`);
  if (!taskId) return (
    <DashboardShell mainClassName="p-0" navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
      {workspaceNavigation}
      <div className="min-h-[calc(100dvh-7rem)] px-4 py-7 text-os-ink sm:px-8 lg:px-12"><HermesTaskEntry researchObjectId={routeParams.id} researchTitle={researchTitle} tasks={tasks} loading={loading} error={error} onRetry={() => setReload((value) => value + 1)} />
        {!loading && !error ? <HermesResearchRunPanel key={`${runId}:${reload}`} researchObjectId={routeParams.id} tasks={tasks} runId={runId} activeTaskId={taskId || undefined} onRunCreated={onRunCreated} /> : null}
        {!loading && !error && claimReview && run?.status === 'awaiting_claim_review' ? <HermesClaimEvidenceReview researchObjectId={routeParams.id} run={run} onDone={() => router.replace(`/research-objects/${encodeURIComponent(routeParams.id)}/hermes?run=${encodeURIComponent(run.id)}`)} /> : null}
        {!loading && !error && <button type="button" className="mt-5 min-h-11 rounded-panel border border-os-vermilion-ink px-4 py-2 font-semibold text-os-vermilion-ink" onClick={() => setHermesOpen(true)}>{t('askHermes')}</button>}
        {literatureEntry}
        <HermesAssistantDrawer dashboardContext={{ tasks: tasks.filter((task) => task.researchObjectId === routeParams.id).map(({ id, researchObjectId, state }) => ({ id, researchObjectId, state })), researchObjects: [{ id: routeParams.id, status: researchStatus, title: researchTitle }] }} locale={locale} onOpenChange={setHermesOpen} open={hermesOpen} route="research-object-edit" routeResearchObjectId={routeParams.id} suggestion={reviewSuggestion} target={null} />
      </div>
    </DashboardShell>
  );
  return <DashboardShell mainClassName="p-0" navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
    {workspaceNavigation}
    <div className="min-h-[calc(100dvh-7rem)] px-4 py-7 text-os-ink sm:px-8 lg:px-12">
    <div className="mx-auto max-w-[90rem]">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-os-vermilion-ink hover:underline">← {t('back')}</Link>
      <header className="mt-5 max-w-3xl border-l-2 border-os-vermilion-ink pl-5">
        <p data-reading-role="caption" className="text-os-vermilion-ink">{t('eyebrow')}</p>
        <h1 className="mt-2 font-reading text-4xl font-normal text-os-ink">{t('title')}</h1>
        <p data-reading-role="body" className="mt-3 max-w-[66ch] text-os-muted-paper">{t('description')}</p>
      </header>
      {literatureEntry}
      {error && <p className="mt-6 max-w-3xl border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{error}</p>}
      {!detail && error && <div className="mt-4 flex flex-wrap items-center gap-5"><button type="button" onClick={() => setReload((value) => value + 1)} className="min-h-11 font-semibold text-os-vermilion-ink underline">{t('retry')}</button><Link className="min-h-11 py-3 text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(routeParams.id)}/hermes`}>{t('allTasks')}</Link></div>}
      {runId ? <HermesResearchRunPanel key={`${runId}:${reload}`} researchObjectId={routeParams.id} tasks={tasks} runId={runId} activeTaskId={taskId || undefined} onRunCreated={onRunCreated} /> : null}
      {loading ? <p className="mt-10 text-base text-os-muted-paper" role="status">{t('loading')}</p> : !detail ? null : <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-os-rule-paper py-3 text-sm text-os-muted-paper">
            <span className="font-data">{detail.task.logicalPath}</span>
            <span>{t('taskState', { state: statusT(detail.task.state) })}</span>
          </div>
          {proposalUnavailable ? <section className="surface-folio-sheet border-y border-os-rule-paper px-4 py-6 sm:px-6" aria-label={t(paidReanalysis ? 'proposalReanalysisTitle' : 'proposalUnavailableTitle')}>
            <h2 className="font-reading text-2xl text-os-ink">{t(paidReanalysis ? 'proposalReanalysisTitle' : 'proposalUnavailableTitle')}</h2>
            <p className="mt-2 max-w-[66ch] text-sm leading-6 text-os-muted-paper">{t(compensatedReanalysis ? 'proposalCompensationBody' : paidReanalysis ? 'proposalReanalysisBody' : 'proposalUnavailableBody')}</p>
            <button type="button" disabled={saving} onClick={() => void retryExtraction()} className="mt-5 min-h-11 touch-manipulation rounded-panel bg-os-vermilion-ink px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40">{saving ? t('proposalRetrying') : t(compensatedReanalysis ? 'proposalCompensation' : paidReanalysis ? 'proposalReanalysis' : 'proposalRetry')}</button>
          </section> : <><p className="mb-4 text-sm text-os-muted-paper">{t('reviewPending')}</p>
          <section aria-label={t('fieldLabel')} className="surface-folio-sheet divide-y divide-os-rule-paper border-y border-os-rule-paper">
            {fields.map((field, index) => <div key={field} className="grid gap-3 px-4 py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-6">
              <label htmlFor={`hermes-review-${field}`}><span className="block font-data text-xs text-os-vermilion-ink">0{index + 1}</span><span className="mt-1 block text-sm font-semibold text-os-ink">{fieldT(field)}</span>{!core[field].trim() && <span className="block text-sm text-os-muted-paper">{t('missing')}</span>}</label>
              <div className="min-w-0"><textarea id={`hermes-review-${field}`} aria-label={field} readOnly={!approvalOpen || saving} data-hermes-review-field value={core[field]} onChange={(event) => setCore({ ...core, [field]: event.target.value })} rows={5} className="w-full resize-y rounded-panel border border-os-rule-paper bg-os-paper-strong p-4 font-reading text-lg leading-[1.68] text-os-ink outline-none focus:border-os-vermilion-ink focus:ring-2 focus:ring-os-vermilion-ink/20" /><HermesExtractionEvidence field={field} result={detail.task.result}/></div>
            </div>)}
          </section></>}
          {saved && <nav aria-label={t('entryActions')} className="mt-6 flex flex-wrap gap-5"><Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(routeParams.id)}/edit` }>{t('continueEditing')}</Link><Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(routeParams.id)}/versions${confirmation ? `?version=${encodeURIComponent(confirmation.versionId)}` : ''}`}>{t('viewVersions')}</Link></nav>}
          {saved && run?.status === 'awaiting_source_review' && confirmation ? <HermesSourceReview researchObjectId={routeParams.id} run={run} confirmation={confirmation} onSubmitted={() => router.replace(`/research-objects/${encodeURIComponent(routeParams.id)}/hermes?run=${encodeURIComponent(run.id)}`)} /> : null}
          {!proposalUnavailable ? <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-os-rule-paper pt-5"><p className="text-base text-os-muted-paper" role="status">{saved ? confirmation ? t('saved') : t('legacyConfirmation') : approvalOpen ? complete ? t('ready') : t('incomplete') : t('taskState', { state: statusT(detail.task.state) })}</p><button type="button" disabled={saving || saved || !approvalOpen} onClick={confirm} className="min-h-11 rounded-panel bg-os-vermilion-ink px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? t('saving') : saved ? t('confirmed') : t('confirm')}</button></footer> : null}
        </div>
        <aside aria-label={t('marginLabel')} className="border-t border-os-rule-paper pt-3 lg:border-l lg:border-t-0 lg:pl-5">
          <p data-reading-role="caption" className="text-os-muted-paper">{t('boundary')}</p>
          <p className="mt-2 text-sm leading-6 text-os-muted-paper">{t('boundaryNote')}</p>
          <HermesDockAnchor assistantOpen={hermesOpen} onInvoke={() => setHermesOpen(true)} state={approvalOpen ? 'awaiting_approval' : 'idle'} suggestion={reviewSuggestion} workspaceId={detail.researchObjectId} />
        </aside>
        <HermesAssistantDrawer
          dashboardContext={{ tasks: [], researchObjects: [{ id: detail.researchObjectId, status: 'draft', title: detail.task.logicalPath }] }}
          locale={locale}
          onOpenChange={setHermesOpen}
          open={hermesOpen}
          route="research-object-edit"
          routeResearchObjectId={routeParams.id}
          suggestion={reviewSuggestion}
          target={null}
        />
      </div>}
    </div>
    </div>
  </DashboardShell>;
}

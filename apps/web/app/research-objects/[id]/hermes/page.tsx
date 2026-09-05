'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HermesTaskEntry, loadScopedHermesReview } from '@/components/hermes/HermesTaskEntry';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import { ResearchWorkspaceNav } from '@/components/research/ResearchWorkspaceNav';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { ApiClientError, confirmIngestionTask, listResearchIngestionTasks, getResearchObject, getIngestionTask, type DashboardTaskApi, type IngestionTaskDetail, type SdfCore } from '@/lib/api';

const fields: Array<keyof SdfCore> = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
const emptyCore = (): SdfCore => ({ schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' });
export default function HermesReviewPage({ params: routeParams }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const taskId = searchParams.get('task') ?? '';
  return <HermesResearchPage key={`${routeParams.id}:${taskId}`} routeParams={routeParams} taskId={taskId} />;
}

function HermesResearchPage({ routeParams, taskId }: { routeParams: { id: string }; taskId: string }) {
  const router = useRouter();
  const locale = useLocale() as 'zh' | 'en';
  const t = useTranslations('hermesReview');
  const shell = useTranslations('shell');
  const statusT = useTranslations('ingestion.status');
  const [detail, setDetail] = useState<IngestionTaskDetail | null>(null);
  const [core, setCore] = useState<SdfCore>(emptyCore);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hermesOpen, setHermesOpen] = useState(false);

  const [researchTitle, setResearchTitle] = useState('');
  const [researchStatus, setResearchStatus] = useState('draft');
  const [tasks, setTasks] = useState<DashboardTaskApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setDetail(null); setCore(emptyCore()); setSaved(false);
    const load = taskId ? loadScopedHermesReview(routeParams.id, taskId, getIngestionTask).then((value) => {
      if (cancelled) return;
      setDetail(value);
      setSaved(value.task.state === 'confirmed' || value.task.state === 'written');
      const proposed = (value.task.result as { core?: SdfCore } | null)?.core;
      if (proposed) setCore({ ...emptyCore(), ...proposed });
    }) : Promise.all([getResearchObject(routeParams.id), listResearchIngestionTasks(routeParams.id)]).then(([research, value]) => {
      if (!cancelled) { setTasks(value.tasks); setResearchTitle(research.researchObject.title); setResearchStatus(research.researchObject.status); }
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

  const complete = useMemo(() => fields.every((field) => core[field].trim().length > 0), [core]);
  const approvalOpen = detail?.task.state === 'needs_review';
  const reviewSuggestion = useMemo(() => detail ? ({
    bodyKey: 'guide.review.body',
    href: `/research-objects/${encodeURIComponent(detail.researchObjectId)}/edit`,
    kind: 'actionable-task' as const,
    researchObjectId: detail.researchObjectId,
    taskId,
    titleKey: 'guide.review.title',
  }) : ({ bodyKey: 'guide.neutral.body', kind: 'neutral' as const, titleKey: 'guide.neutral.title' }), [detail, taskId]);
  async function confirm() {
    if (!detail || !complete || !approvalOpen || saving || detail.researchObjectId !== routeParams.id) return;
    setSaving(true); setError('');
    try { await confirmIngestionTask(taskId, { version: detail.version, core }); if (!mounted.current) return; setSaved(true); setDetail({ ...detail, task: { ...detail.task, state: 'confirmed' } }); }
    catch (cause) { if (mounted.current) setError(cause instanceof ApiClientError ? cause.message : t('confirmError')); }
    finally { if (mounted.current) setSaving(false); }
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

  if (!taskId) return (
    <DashboardShell mainClassName="p-0" navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
      {workspaceNavigation}
      <div className="min-h-[calc(100dvh-7rem)] px-4 py-7 text-os-ink sm:px-8 lg:px-12"><HermesTaskEntry researchObjectId={routeParams.id} researchTitle={researchTitle} tasks={tasks} loading={loading} error={error} onRetry={() => setReload((value) => value + 1)} />
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
      {loading ? <p className="mt-10 text-base text-os-muted-paper" role="status">{t('loading')}</p> : !detail ? null : <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-os-rule-paper py-3 text-sm text-os-muted-paper">
            <span className="font-data">{detail.task.logicalPath}</span>
            <span>{t('taskState', { state: statusT(detail.task.state) })}</span>
          </div>
          <section aria-label={t('fieldLabel')} className="surface-folio-sheet divide-y divide-os-rule-paper border-y border-os-rule-paper">
            {fields.map((field, index) => <label key={field} className="grid gap-3 px-4 py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-6">
              <span><span className="block font-data text-xs text-os-vermilion-ink">0{index + 1}</span><span className="mt-1 block text-sm font-semibold text-os-ink">{field}</span></span>
              <textarea readOnly={!approvalOpen || saving} data-hermes-review-field value={core[field]} onChange={(event) => setCore({ ...core, [field]: event.target.value })} rows={5} className="w-full resize-y rounded-panel border border-os-rule-paper bg-os-paper-strong p-4 font-reading text-lg leading-[1.68] text-os-ink outline-none focus:border-os-vermilion-ink focus:ring-2 focus:ring-os-vermilion-ink/20" />
            </label>)}
          </section>
          {saved && <nav aria-label={t('entryActions')} className="mt-6 flex flex-wrap gap-5"><Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(routeParams.id)}/edit?ingestionTask=${encodeURIComponent(taskId)}`}>{t('continueEditing')}</Link><Link className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(routeParams.id)}/versions`}>{t('viewVersions')}</Link></nav>}
          <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-os-rule-paper pt-5"><p className="text-base text-os-muted-paper" role="status">{saved ? t('saved') : complete ? t('ready') : t('incomplete')}</p><button type="button" disabled={!complete || saving || !approvalOpen} onClick={confirm} className="min-h-11 rounded-panel bg-os-vermilion-ink px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? t('saving') : saved ? t('confirmed') : t('confirm')}</button></footer>
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

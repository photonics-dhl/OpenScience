'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { EvidenceIntake } from '@/components/intake/EvidenceIntake';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import type { HermesGuideSuggestion } from '@/components/hermes/hermes-guide';
import { useOptionalHermesWorkspaceStage } from '@/components/hermes/HermesWorkspaceStage';
import { DashboardShell } from '@/components/shell/DashboardShell';
import type { HermesAnchorAction } from '@/lib/hermes/anchor-registry';
import { createIntakeMaterials, updateMaterialFromTask, type IntakeMaterial } from '@/components/intake/intake-model';
import {
  createResearchObject,
  getIngestionBatch,
  listMyWorkspaces,
  retryIngestionTask,
  startIngestionBatch,
  ApiClientError,
  type IngestionTaskSummary,
  type WorkspaceApi,
} from '@/lib/api';
import type { Locale } from '@/i18n/locale';

const CHECKPOINT_KEY = 'openscience.evidence-intake';
const ACTIVE_STATES = new Set(['queued', 'uploading', 'stored', 'parsing']);
const EXPLAIN_ONLY: HermesAnchorAction[] = ['explain'];
const CREATION_SUGGESTION: HermesGuideSuggestion = {
  bodyKey: 'guide.neutral.body',
  kind: 'neutral',
  titleKey: 'guide.neutral.title',
};

function mergeTasks(materials: IntakeMaterial[], tasks: IngestionTaskSummary[]): IntakeMaterial[] {
  return materials.map((material, index) => {
    const task = tasks.find((candidate) => candidate.id === material.taskId)
      ?? tasks.find((candidate) => candidate.logicalPath === material.file.name)
      ?? tasks[index];
    return task ? updateMaterialFromTask(material, task) : material;
  });
}

export default function NewResearchObjectPage() {
  const t = useTranslations('createResearch');
  const intakeT = useTranslations('ingestion.intake');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'blank' ? 'blank' : 'import';
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [title, setTitle] = useState('');
  const [materials, setMaterials] = useState<IntakeMaterial[]>([]);
  const [researchObjectId, setResearchObjectId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [pollRevision, setPollRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [hermesOpen, setHermesOpen] = useState(false);
  const hermesStage = useOptionalHermesWorkspaceStage();

  useEffect(() => {
    hermesStage?.requestGuide(mode === 'import' && title.trim() ? 'source-import' : 'ro-title');
  }, [hermesStage, mode, title]);

  useEffect(() => {
    let active = true;
    listMyWorkspaces()
      .then((rows) => {
        if (!active) return;
        setWorkspaces(rows);
        setWorkspaceId((current) => current || rows[0]?.id || '');
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : t('error')));
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (mode !== 'import') return;
    try {
      const raw = window.localStorage.getItem(CHECKPOINT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { batchId: string; researchObjectId: string; title: string };
      if (!saved.batchId || !saved.researchObjectId) return;
      setBatchId(saved.batchId);
      setResearchObjectId(saved.researchObjectId);
      setTitle(saved.title);
    } catch {
      window.localStorage.removeItem(CHECKPOINT_KEY);
    }
  }, [mode]);

  const refreshBatch = useCallback(async () => {
    if (!batchId) return false;
    const batch = await getIngestionBatch(batchId);
    setResearchObjectId(batch.researchObjectId);
    setMaterials((current) => {
      const source = current.length > 0
        ? current
        : createIntakeMaterials(batch.tasks.map((task) => new File([], task.logicalPath)));
      return mergeTasks(source, batch.tasks);
    });
    const stillActive = batch.tasks.some((task) => ACTIVE_STATES.has(task.state));
    if (!stillActive && batch.tasks.every((task) => task.state === 'written' || task.state === 'confirmed')) {
      window.localStorage.removeItem(CHECKPOINT_KEY);
    }
    return stillActive;
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const active = await refreshBatch();
        if (active && !cancelled) timer = setTimeout(poll, 1500);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t('error'));
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [batchId, pollRevision, refreshBatch, t]);

  const reviewTasks = useMemo(() => materials.filter((material) => material.status === 'needs_review' && material.taskId), [materials]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !title.trim()) return;
    if (mode === 'import' && materials.length === 0) {
      setError(t('materialsRequired'));
      return;
    }
    setPending(true);
    setError('');
    try {
      const roId = researchObjectId || (await createResearchObject({ workspaceId, title: title.trim() })).researchObject.id;
      setResearchObjectId(roId);
      if (mode === 'blank') {
        router.push(`/research-objects/${roId}/edit`);
        return;
      }
      setMaterials((current) => current.map((material) => ({ ...material, status: 'uploading', progress: 0 })));
      const result = await startIngestionBatch(
        roId,
        materials.map(({ file }) => file),
        `evidence:${roId}:${crypto.randomUUID()}`,
        (percent) => setMaterials((current) => current.map((material) => material.status === 'uploading' ? { ...material, progress: Math.round(percent * 0.35) } : material)),
      );
      setMaterials((current) => mergeTasks(current, result.tasks));
      setBatchId(result.batchId);
      window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ batchId: result.batchId, researchObjectId: roId, title: title.trim() }));
    } catch (cause) {
      const blocked = cause instanceof ApiClientError && ['MALICIOUS_FILE', 'UNSUPPORTED_INGESTION_FORMAT', 'FILE_TOO_LARGE'].includes(cause.code);
      setMaterials((current) => current.map((material) => material.status === 'uploading' ? {
        ...material,
        status: blocked ? 'failed_blocked' : 'failed_retryable',
        errorCode: cause instanceof Error ? cause.message : t('error'),
      } : material));
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      setPending(false);
    }
  }

  async function retry(material: IntakeMaterial) {
    if (!material.taskId) return;
    setError('');
    try {
      const task = await retryIngestionTask(material.taskId);
      setMaterials((current) => current.map((row) => row.localId === material.localId ? updateMaterialFromTask(row, task) : row));
      setPollRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    }
  }

  return (
    <DashboardShell
      activeRoute="create"
      navigationLabel={t('navigationLabel')}
      skipLabel={t('skipLabel')}
    >
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-10 lg:grid-cols-[minmax(17rem,.62fr)_minmax(0,1.38fr)] lg:gap-16">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <p data-reading-role="caption" className="text-os-vermilion-ink">{t('eyebrow')}</p>
            <h1 className="mt-3 max-w-xl text-[clamp(2rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.03em] text-os-ink">{t('title')}</h1>
            <p data-reading-role="body" className="mt-4 max-w-md text-os-muted-paper">{t('description')}</p>
            <ol className="mt-7 list-none border-y border-os-rule-paper p-0 text-sm" aria-label={t('progressLabel')}>
              <li className="flex gap-3 border-b border-os-rule-paper py-3 font-semibold text-os-ink"><span className="font-data text-os-vermilion-ink">01</span><span>{t('identityStep')}</span></li>
              <li className="flex gap-3 py-3 text-os-muted-paper"><span className="font-data">02</span><span>{t('evidenceStep')}</span></li>
            </ol>
            <div className="mt-7 border-l-2 border-os-vermilion-ink pl-5 text-sm leading-6 text-os-muted-paper">
              <p>{intakeT('provenance')}</p>
              <p className="mt-3">{intakeT('consent')}</p>
            </div>
            <div className="mt-4">
              <HermesDockAnchor assistantOpen={hermesOpen} onInvoke={() => setHermesOpen(true)} state={pending ? 'scanning' : error ? 'failed' : 'idle'} suggestion={CREATION_SUGGESTION} />
            </div>
          </aside>

          <form className="surface-folio-sheet min-w-0 px-5 py-7 sm:px-8 sm:py-9" onSubmit={submit}>
            <section className="grid gap-6 border-b border-os-rule-paper pb-8 sm:grid-cols-2">
              <label data-hermes-protected="true" data-reading-role="control" className="grid gap-2 text-sm font-medium text-os-ink">
                {t('workspace')}
                <select data-reading-role="reading" className="min-h-12 border-0 border-b border-os-rule-paper bg-transparent text-lg text-os-ink outline-none focus:border-os-vermilion-ink" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required>
                  <option value="">{t('workspaceLoading')}</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label data-reading-role="control" className="grid gap-2 text-sm font-medium text-os-ink">
                {t('researchTitle')}
                <HermesAnchor actions={EXPLAIN_ONLY} id="ro-title">
                  <input data-reading-role="reading" className="min-h-12 w-full border-0 border-b border-os-rule-paper bg-transparent px-1 text-lg text-os-ink outline-none placeholder:text-os-muted-paper focus:border-os-vermilion-ink" name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={intakeT('titlePlaceholder')} />
                </HermesAnchor>
              </label>
            </section>

            {mode === 'import' ? <div className="pt-10"><HermesAnchor actions={EXPLAIN_ONLY} id="source-import"><EvidenceIntake materials={materials} onChange={setMaterials} onRetry={retry} /></HermesAnchor></div> : (
              <section className="border-b border-os-rule-paper py-10">
                <h2 className="text-3xl font-normal text-os-ink">{intakeT('blankTitle')}</h2>
                <p data-reading-role="body" className="mt-3 max-w-xl text-os-muted-paper">{intakeT('blankBody')}</p>
              </section>
            )}

            {error ? <p className="mt-6 border-l-2 border-os-vermilion-ink pl-4 text-sm text-state-danger" role="alert">{error}</p> : null}
            {reviewTasks.length > 0 ? (
              <div className="mt-8 border-y border-os-vermilion-ink py-6">
                <h2 className="text-2xl font-normal text-os-ink">{intakeT('reviewReady')}</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  {reviewTasks.map((material) => <Link className="border-b border-os-vermilion-ink pb-1 text-sm text-os-vermilion-ink" key={material.localId} href={`/research-objects/${researchObjectId}/hermes?task=${material.taskId}`}>{material.file.name} →</Link>)}
                </div>
              </div>
            ) : null}
            <footer className="mt-10 flex flex-wrap items-center justify-between gap-5 border-t border-os-rule-paper pt-6">
              <p className="max-w-xl text-sm leading-6 text-os-muted-paper">{mode === 'import' ? intakeT('submitNote') : intakeT('blankNote')}</p>
              <div className="flex gap-4">
                {researchObjectId ? <Link className="min-h-12 px-5 py-3 text-sm text-os-muted-paper hover:text-os-ink" href={`/research-objects/${researchObjectId}/edit`}>{intakeT('openDraft')}</Link> : null}
                {!batchId ? <button data-hermes-protected="true" data-reading-role="control" className="min-h-12 rounded-control border-0 bg-os-vermilion-ink px-7 text-sm font-semibold text-os-paper transition-colors hover:bg-[#9f301c] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none" disabled={pending || !workspaceId} type="submit">{pending ? t('creating') : researchObjectId ? intakeT('retryUpload') : t('create')}</button> : null}
              </div>
            </footer>
          </form>
        </div>
      </div>
      <HermesAssistantDrawer dashboardContext={{ tasks: [], researchObjects: [] }} locale={locale} onOpenChange={setHermesOpen} open={hermesOpen} route="research-object-new" suggestion={CREATION_SUGGESTION} target={mode === 'import' && title.trim() ? 'source-import' : 'ro-title'} />
    </DashboardShell>
  );
}

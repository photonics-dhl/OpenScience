'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { EvidenceIntake } from '@/components/intake/EvidenceIntake';
import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { useOptionalHermesWorkspaceStage } from '@/components/hermes/HermesWorkspaceStage';
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

const CHECKPOINT_KEY = 'openscience.evidence-intake';
const ACTIVE_STATES = new Set(['queued', 'uploading', 'stored', 'parsing']);
const EXPLAIN_ONLY: HermesAnchorAction[] = ['explain'];

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
    <main className="surface-dark min-h-screen bg-[#0b0b0a] text-[#f4f0e8]">
      <div className="mx-auto max-w-[92rem] px-5 pb-16 pt-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/20 pb-5">
          <Link data-reading-role="control" className="text-sm tracking-[0.04em] text-white/70 hover:text-white" href="/dashboard">← {t('back')}</Link>
          <p data-reading-role="caption" className="uppercase tracking-[0.12em] text-white/55">OpenScience / Research Object</p>
        </header>

        <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(18rem,.55fr)_minmax(0,1.45fr)] lg:gap-20">
          <aside className="lg:sticky lg:top-10 lg:self-start">
            <p data-reading-role="caption" className="uppercase tracking-[0.12em] text-[#ff7457]">01 / Research identity</p>
            <h1 className="mt-5 max-w-xl font-display text-4xl leading-[.98] sm:text-6xl lg:text-[4.7rem]">{t('title')}</h1>
            <p data-reading-role="body" className="mt-6 max-w-md text-base leading-[var(--leading-body)] text-white/65">{t('description')}</p>
            <div className="mt-10 border-t border-white/20 pt-5 text-xs leading-6 text-white/45">
              <p>{intakeT('provenance')}</p>
              <p className="mt-3">{intakeT('consent')}</p>
            </div>
          </aside>

          <form className="min-w-0" onSubmit={submit}>
            <section className="grid gap-6 border-b border-white/25 pb-10 sm:grid-cols-2">
              <label data-reading-role="control" className="grid gap-2 text-sm font-medium tracking-[0.02em] text-white/70">
                {t('workspace')}
                <select data-reading-role="reading" className="min-h-12 border-0 border-b border-white/25 bg-transparent text-[1.0625rem] normal-case tracking-normal text-white outline-none focus:border-[#ef4c2f]" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required>
                  <option className="bg-[#11100f]" value="">{t('workspaceLoading')}</option>
                  {workspaces.map((workspace) => <option className="bg-[#11100f]" key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label data-reading-role="control" className="grid gap-2 text-sm font-medium tracking-[0.02em] text-white/70">
                {t('researchTitle')}
                <HermesAnchor actions={EXPLAIN_ONLY} id="ro-title">
                  <input data-reading-role="reading" className="min-h-12 w-full border-0 border-b border-white/25 bg-transparent px-1 text-[1.0625rem] normal-case tracking-normal text-white outline-none placeholder:text-white/60 focus:border-[#ef4c2f]" name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={intakeT('titlePlaceholder')} />
                </HermesAnchor>
              </label>
            </section>

            {mode === 'import' ? <div className="pt-10"><HermesAnchor actions={EXPLAIN_ONLY} id="source-import"><EvidenceIntake materials={materials} onChange={setMaterials} onRetry={retry} /></HermesAnchor></div> : (
              <section className="border-b border-white/20 py-12">
                <p className="font-display text-3xl">{intakeT('blankTitle')}</p>
                <p data-reading-role="body" className="mt-3 max-w-xl text-base leading-[var(--leading-body)] text-white/65">{intakeT('blankBody')}</p>
              </section>
            )}

            {error ? <p className="mt-6 border-l-2 border-[#ef4c2f] pl-4 text-sm text-[#ffb09f]" role="alert">{error}</p> : null}
            {reviewTasks.length > 0 ? (
              <div className="mt-8 border-y border-[#ef4c2f]/60 py-6">
                <p className="font-display text-2xl">{intakeT('reviewReady')}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {reviewTasks.map((material) => <Link className="border-b border-[#ef4c2f] pb-1 text-sm text-[#ff8065]" key={material.localId} href={`/research-objects/${researchObjectId}/hermes?task=${material.taskId}`}>{material.file.name} →</Link>)}
                </div>
              </div>
            ) : null}
            <footer className="mt-10 flex flex-wrap items-center justify-between gap-5 border-t border-white/25 pt-6">
              <p className="max-w-xl text-xs leading-5 text-white/60">{mode === 'import' ? intakeT('submitNote') : intakeT('blankNote')}</p>
              <div className="flex gap-4">
                {researchObjectId ? <Link className="min-h-12 px-5 py-3 text-xs uppercase tracking-[0.14em] text-white/60 hover:text-white" href={`/research-objects/${researchObjectId}/edit`}>{intakeT('openDraft')}</Link> : null}
                {!batchId ? <button data-reading-role="control" className="min-h-12 border-0 bg-[#bd321d] px-7 text-sm font-semibold tracking-[0.04em] text-white transition-colors hover:bg-[#d13b22] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none" disabled={pending || !workspaceId} type="submit">{pending ? t('creating') : researchObjectId ? intakeT('retryUpload') : t('create')}</button> : null}
              </div>
            </footer>
          </form>
        </div>
      </div>
    </main>
  );
}

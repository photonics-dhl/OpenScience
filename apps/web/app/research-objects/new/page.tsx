'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { useSession } from '@/components/auth/SessionProvider';
import { EvidenceIntake } from '@/components/intake/EvidenceIntake';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import type { HermesGuideSuggestion } from '@/components/hermes/hermes-guide';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { updateMaterialFromTask, type IntakeMaterial } from '@/components/intake/intake-model';
import {
  ApiClientError,
  createResearchObject,
  createWorkspaceGuideSession,
  listMyWorkspaces,
  startIngestionBatch,
  submitWorkspaceGuideTask,
  type WorkspaceApi,
} from '@/lib/api';
import type { Locale } from '@/i18n/locale';

const CREATION_SUGGESTION: HermesGuideSuggestion = {
  bodyKey: 'guide.neutral.body',
  kind: 'neutral',
  titleKey: 'guide.neutral.title',
};
const HERMES_HANDOFF_TTL_MS = 30 * 60 * 1000;

function temporaryTitle(goal: string, materials: readonly IntakeMaterial[], fallback: string): string {
  const idea = goal.replace(/\s+/gu, ' ').trim();
  if (idea) return idea.slice(0, 120);
  const filename = materials[0]?.file.name.replace(/\.[^.]+$/u, '').trim();
  return (filename || fallback).slice(0, 200);
}

export default function NewResearchObjectPage() {
  const t = useTranslations('createResearch');
  const intakeT = useTranslations('ingestion.intake');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const session = useSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [viewerId, setViewerId] = useState('');
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [materials, setMaterials] = useState<IntakeMaterial[]>([]);
  const [researchObjectId, setResearchObjectId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const createKey = useRef('');
  const uploadKey = useRef('');
  const guideSessionKey = useRef('');
  const guideTaskKey = useRef('');
  const guideSessionId = useRef('');
  const firstGoal = useRef('');
  const uploadedFiles = useRef(new WeakSet<File>());
  const uploadedTasks = useRef<Array<{ id: string; researchObjectId: string; state: string }>>([]);
  const lastIngestionTaskId = useRef('');
  const goalInput = useRef<HTMLTextAreaElement>(null);
  const ownerRef = useRef('');
  const pendingRef = useRef(false);

  const clearCreationState = useCallback(() => {
    setWorkspaces([]);
    setWorkspaceId('');
    setViewerId('');
    setTitle('');
    setGoal('');
    setMaterials([]);
    setResearchObjectId('');
    setPending(false);
    setError('');
    createKey.current = '';
    uploadKey.current = '';
    guideSessionKey.current = '';
    guideTaskKey.current = '';
    guideSessionId.current = '';
    firstGoal.current = '';
    uploadedFiles.current = new WeakSet<File>();
    uploadedTasks.current = [];
    lastIngestionTaskId.current = '';
    pendingRef.current = false;
  }, []);

  useEffect(() => {
    if (session.status !== 'authenticated') {
      if (ownerRef.current) {
        ownerRef.current = '';
        clearCreationState();
      }
      if (session.status === 'anonymous') router.replace('/auth/login?returnTo=%2Fresearch-objects%2Fnew');
      return;
    }
    const nextOwner = session.user?.userId || '';
    if (!nextOwner) {
      ownerRef.current = '';
      clearCreationState();
      return;
    }
    if (ownerRef.current && ownerRef.current !== nextOwner) {
      ownerRef.current = nextOwner;
      clearCreationState();
      setViewerId(nextOwner);
      router.replace('/dashboard');
      return;
    }
    ownerRef.current = nextOwner;
    setViewerId(nextOwner);
  }, [clearCreationState, router, session.status, session.user?.userId]);

  useEffect(() => {
    const owner = session.user?.userId;
    if (session.status !== 'authenticated' || !owner || ownerRef.current !== owner) return;
    let active = true;
    listMyWorkspaces()
      .then((rows) => {
        if (!active || ownerRef.current !== owner) return;
        setWorkspaces(rows);
        setWorkspaceId((current) => current || rows[0]?.id || '');
      })
      .catch((cause) => active && ownerRef.current === owner && setError(cause instanceof Error ? cause.message : t('error')));
    return () => { active = false; };
  }, [session.status, session.user?.userId, t]);

  function changeMaterials(next: IntakeMaterial[]) {
    setMaterials(next);
  }

  function changeGoal(next: string) {
    if (firstGoal.current && next.trim() !== firstGoal.current) {
      firstGoal.current = next.trim();
      guideTaskKey.current = '';
      if (!guideSessionId.current) guideSessionKey.current = '';
    }
    setGoal(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const owner = ownerRef.current;
    if (pendingRef.current || session.status !== 'authenticated' || session.user?.userId !== owner || !owner || owner !== viewerId || !workspaceId || (!goal.trim() && !title.trim() && materials.length === 0)) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    let uploadFailed = false;
    try {
      const resolvedTitle = title.trim() || temporaryTitle(goal, materials, t('untitled'));
      if (!createKey.current) createKey.current = crypto.randomUUID();
      const roId = researchObjectId || (await createResearchObject({ workspaceId, title: resolvedTitle }, createKey.current)).researchObject.id;
      if (ownerRef.current !== owner) return;
      setResearchObjectId(roId);
      firstGoal.current ||= goal.trim();
      let ingestionTaskId = lastIngestionTaskId.current;
      let ingestionTasks = [...uploadedTasks.current];
      const newFiles = materials.map(({ file }) => file).filter((file) => !uploadedFiles.current.has(file));
      if (newFiles.length > 0) {
        setMaterials((current) => current.map((material) => newFiles.includes(material.file)
          ? { ...material, status: 'uploading', progress: 0 }
          : material));
        if (!uploadKey.current) uploadKey.current = `evidence:${roId}:${crypto.randomUUID()}`;
        const result = await startIngestionBatch(
            roId,
            newFiles,
            uploadKey.current,
            (percent) => {
              if (ownerRef.current !== owner) return;
              setMaterials((current) => current.map((material) => material.status === 'uploading' ? { ...material, progress: Math.round(percent * 0.35) } : material));
            },
          ).catch((cause) => {
          uploadFailed = true;
          throw cause;
        });
        if (ownerRef.current !== owner) return;
        ingestionTaskId = result.tasks[0]?.id ?? '';
        const newTasks = result.tasks.map((task) => ({ id: task.id, researchObjectId: roId, state: task.state }));
        setMaterials((current) => current.map((material) => {
          const index = newFiles.indexOf(material.file);
          return index >= 0 && result.tasks[index] ? updateMaterialFromTask(material, result.tasks[index]!) : material;
        }));
        newFiles.forEach((file) => uploadedFiles.current.add(file));
        uploadedTasks.current = [...uploadedTasks.current, ...newTasks];
        ingestionTasks = [...uploadedTasks.current];
        lastIngestionTaskId.current = ingestionTaskId;
        uploadKey.current = '';
      }

      let hermesTaskId = '';
      if (firstGoal.current) {
        guideSessionKey.current ||= crypto.randomUUID();
        guideTaskKey.current ||= crypto.randomUUID();
        if (!guideSessionId.current) {
          const createdSessionId = (await createWorkspaceGuideSession(firstGoal.current, guideSessionKey.current, roId)).session.id;
          if (ownerRef.current !== owner) return;
          guideSessionId.current = createdSessionId;
        }
        hermesTaskId = (await submitWorkspaceGuideTask({
          sessionId: guideSessionId.current,
          idempotencyKey: guideTaskKey.current,
          payload: {
            goal: firstGoal.current,
            locale,
            route: 'research-object-edit',
            target: null,
            context: {
              tasks: ingestionTasks,
              researchObjects: [{ id: roId, title: resolvedTitle, status: 'draft' }],
              editorDraft: {
                researchObjectId: roId,
                scope: 'sdf',
                version: 1,
                core: { problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' },
              },
            },
          },
        })).task.id;
        if (ownerRef.current !== owner) return;
        window.sessionStorage.setItem(`openscience.hermes-handoff:${owner}:${roId}:${hermesTaskId}`, JSON.stringify({
          viewerId: owner,
          researchObjectId: roId,
          taskId: hermesTaskId,
          expiresAt: Date.now() + HERMES_HANDOFF_TTL_MS,
        }));
      }
      const params = new URLSearchParams();
      if (ingestionTaskId && !hermesTaskId) params.set('ingestionTask', ingestionTaskId);
      if (hermesTaskId) params.set('hermesTask', hermesTaskId);
      if (ownerRef.current !== owner) return;
      router.push(`/research-objects/${encodeURIComponent(roId)}/edit${params.size ? `?${params.toString()}` : ''}`);
    } catch (cause) {
      if (ownerRef.current !== owner) return;
      const blocked = cause instanceof ApiClientError && ['MALICIOUS_FILE', 'UNSUPPORTED_INGESTION_FORMAT', 'FILE_TOO_LARGE'].includes(cause.code);
      if (uploadFailed) setMaterials((current) => current.map((material) => material.status === 'uploading' ? {
        ...material,
        status: blocked ? 'failed_blocked' : 'failed_retryable',
        errorCode: cause instanceof Error ? cause.message : t('error'),
      } : material));
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      if (ownerRef.current === owner) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  const canCreate = Boolean(
    session.status === 'authenticated'
    && session.user?.userId === viewerId
    && workspaceId
    && viewerId
    && (goal.trim() || title.trim() || materials.length),
  );

  return (
    <DashboardShell
      activeRoute="create"
      navigationLabel={t('navigationLabel')}
      skipLabel={t('skipLabel')}
    >
      <div className="mx-auto max-w-[78rem]">
        <header className="mx-auto max-w-3xl text-center">
          <p data-reading-role="caption" className="text-os-vermilion-ink">{t('eyebrow')}</p>
          <h1 className="mt-3 text-[clamp(2.35rem,6vw,4.6rem)] font-normal leading-[.98] tracking-[-0.045em] text-os-ink">{t('title')}</h1>
          <p data-reading-role="body" className="mx-auto mt-5 max-w-2xl text-base leading-7 text-os-muted-paper">{t('description')}</p>
        </header>

        <form className="surface-folio-sheet mx-auto mt-10 max-w-4xl px-5 py-6 sm:px-8 sm:py-8" onSubmit={submit}>
          <section className="grid gap-5 border-b border-os-rule-paper pb-7 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <div className="relative mx-auto h-52 w-52 shrink-0 [&_.hermes-dock-anchor]:h-52 [&_.hermes-dock-anchor]:!min-h-52 [&_.hermes-workspace-stage]:!mt-0 sm:mx-0">
              <HermesDockAnchor assistantOpen state={pending ? 'scanning' : error ? 'failed' : 'idle'} suggestion={CREATION_SUGGESTION} onInvoke={() => goalInput.current?.focus()} />
            </div>
            <label data-reading-role="control" className="grid gap-3 text-sm font-medium text-os-ink">
              <span className="flex flex-wrap items-baseline justify-between gap-2"><span>{t('hermesPrompt')}</span><span className="font-normal text-os-muted-paper">{t('hermesPromptNote')}</span></span>
              <textarea ref={goalInput} className="min-h-36 w-full resize-y rounded-control border border-os-rule-paper bg-os-paper px-4 py-3 text-lg leading-7 text-os-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-os-muted-paper focus:border-os-vermilion-ink focus:shadow-[0_0_0_3px_rgba(18,93,102,.12)]" maxLength={2000} value={goal} onChange={(event) => changeGoal(event.target.value)} placeholder={t('hermesPlaceholder')} />
            </label>
          </section>

          <div className="pt-7">
            <EvidenceIntake literature={{ instanceId: 'research-start-literature', onAuthenticationRequired: () => router.replace('/auth/login?returnTo=%2Fresearch-objects%2Fnew'), target: researchObjectId ? { kind: 'research_object', researchObjectId } : { kind: 'personal' }, withinForm: true }} materials={materials} onChange={changeMaterials} variant="research-start" />
          </div>

          <details className="mt-7 border-t border-os-rule-paper pt-5">
            <summary className="cursor-pointer text-sm font-medium text-os-muted-paper transition-colors duration-150 hover:text-os-ink">{t('details')}</summary>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <label data-reading-role="control" className="grid gap-2 text-sm font-medium text-os-ink">
                {t('workspace')}
                <select className="min-h-12 border-0 border-b border-os-rule-paper bg-transparent text-base text-os-ink outline-none focus:border-os-vermilion-ink" value={workspaceId} onChange={(event) => { createKey.current = ''; setWorkspaceId(event.target.value); }} disabled={Boolean(researchObjectId)} required>
                  <option value="">{t('workspaceLoading')}</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label data-reading-role="control" className="grid gap-2 text-sm font-medium text-os-ink">
                {t('optionalTitle')}
                <input className="min-h-12 border-0 border-b border-os-rule-paper bg-transparent text-base text-os-ink outline-none placeholder:text-os-muted-paper focus:border-os-vermilion-ink" maxLength={200} value={title} onChange={(event) => { createKey.current = ''; setTitle(event.target.value); }} disabled={Boolean(researchObjectId)} placeholder={t('titlePlaceholder')} />
              </label>
            </div>
          </details>

          {error ? <p className="mt-6 border-l-2 border-os-vermilion-ink pl-4 text-sm text-state-danger" role="alert">{error}</p> : null}
          <footer className="mt-7 flex flex-wrap items-center justify-between gap-5 border-t border-os-rule-paper pt-6">
            <p className="max-w-xl text-sm leading-6 text-os-muted-paper">{t('privacyNote')}</p>
            <div className="flex items-center gap-4">
              {researchObjectId ? <Link className="min-h-12 px-4 py-3 text-sm text-os-muted-paper hover:text-os-ink" href={`/research-objects/${encodeURIComponent(researchObjectId)}/edit`}>{intakeT('openDraft')}</Link> : null}
              <button className="min-h-12 rounded-control border-0 bg-os-vermilion-ink px-7 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:brightness-90 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || !canCreate} type="submit">{pending ? t('creating') : researchObjectId ? t('continue') : t('create')}</button>
            </div>
          </footer>
        </form>
      </div>
    </DashboardShell>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useSession } from '@/components/auth/SessionProvider';
import CoreEditor from '@/components/editor/CoreEditor';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import { HermesExtractionEvidence } from '@/components/hermes/HermesExtractionEvidence';
import type { HermesGuideSuggestion } from '@/components/hermes/hermes-guide';
import { EvidenceIntake } from '@/components/intake/EvidenceIntake';
import { updateMaterialFromTask, type IntakeMaterial } from '@/components/intake/intake-model';
import {
  ApiClientError, apiRequest, confirmIngestionTask, createResearchObject,
  createWorkspaceGuideSession, submitWorkspaceGuideTask,
  getIngestionTask, getResearchObject, listMyWorkspaces, listVersions, startIngestionBatch,
  updateSdf, type DashboardResearchApi, type IngestionTaskDetail, type SdfCore,
  type VersionSummary, type WorkspaceApi, type WorkspaceGuideResult,
} from '@/lib/api';
import { emptyCore } from '@/lib/editor-state';
import { guideWorkspaceCopy } from '@/lib/guide-workspace-copy';
import { loadGuideDraft, saveGuideDraft } from '@/lib/guide-workspace-state';
import { loadResearchMaterials } from '@/lib/research-materials';
import { SDF_FIELDS, type SdfField } from '@/lib/suggestions';
import styles from './guide-research-workspace.module.css';

const suggestion: HermesGuideSuggestion = { bodyKey: 'guide.neutral.body', kind: 'neutral', titleKey: 'guide.neutral.title' };
const loginHref = `/auth/login?returnTo=${encodeURIComponent('/guide')}`;
const directLoginHref = `/auth/login?returnTo=${encodeURIComponent('/guide?mode=direct')}`;

function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function draftContext(id: string, version: number, core: SdfCore) {
  return { researchObjectId: id, scope: 'sdf', version, core: {
    problem: core.problem, insight: core.insight, method: core.method, results: core.results,
    limitations: core.limitations, reproducibility: core.reproducibility,
  } };
}

function proposedCore(detail: IngestionTaskDetail): SdfCore | null {
  const value = detail.task.result?.core;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!SDF_FIELDS.every((field) => typeof candidate[field] === 'string')) return null;
  return { ...emptyCore(), ...Object.fromEntries(SDF_FIELDS.map((field) => [field, candidate[field]])) };
}

export function GuideResearchWorkspace() {
  const locale = useLocale();
  const editorT = useTranslations('editor');
  const ingestionStatusT = useTranslations('ingestion.status');
  const copy = guideWorkspaceCopy(locale);
  const router = useRouter();
  const session = useSession();
  const owner = session.status === 'authenticated' ? session.user?.userId ?? '' : '';
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const previousOwner = useRef('');
  const epoch = useRef(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [research, setResearch] = useState<DashboardResearchApi[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [freeText, setFreeText] = useState('');
  const freeTextFile = useRef<{ text: string; file: File } | null>(null);
  const freeTextInput = useRef<HTMLTextAreaElement>(null);
  const [existingSources, setExistingSources] = useState<string[]>([]);
  const [materials, setMaterials] = useState<IntakeMaterial[]>([]);
  const [directMode, setDirectMode] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const [core, setCore] = useState<SdfCore>(emptyCore);
  const coreRef = useRef(core); coreRef.current = core;
  const [version, setVersion] = useState(1);
  const versionRef = useRef(version); versionRef.current = version;
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [ingestionTaskIds, setIngestionTaskIds] = useState<string[]>([]);
  const [ingestionLabels, setIngestionLabels] = useState<Record<string, string>>({});
  const [ingestionStates, setIngestionStates] = useState<Record<string, string>>({});
  const [reviewTaskId, setReviewTaskId] = useState('');
  const reviewTaskRef = useRef(''); reviewTaskRef.current = reviewTaskId;
  const [ingestionDetail, setIngestionDetail] = useState<IngestionTaskDetail | null>(null);
  const [proposal, setProposal] = useState<SdfCore | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [conversationOpen, setConversationOpen] = useState(false);
  const [conversationGoal, setConversationGoal] = useState('');
  const [initialTaskId, setInitialTaskId] = useState('');
  const [activeField, setActiveField] = useState<SdfField | null>(null);
  const createKey = useRef('');
  const createIntent = useRef<{ workspaceId: string; title: string; core?: SdfCore } | null>(null);
  const uploadKey = useRef('');
  const uploadSignature = useRef('');
  const fileIdentities = useRef(new WeakMap<File, string>());
  const guideSessionKey = useRef('');
  const guideSessionTitle = useRef('');
  const guideTaskKey = useRef('');
  const guideTaskIntent = useRef<{ goal: string; payload: Parameters<typeof submitWorkspaceGuideTask>[0]['payload'] } | null>(null);
  const guideSessionId = useRef('');
  const uploadedFiles = useRef(new WeakSet<File>());
  const chosenId = useRef(''); chosenId.current = selectedId;
  const lastHermesEdit = useRef<NonNullable<WorkspaceGuideResult['draftEdit']> | null>(null);
  const isCurrent = useCallback((expectedOwner: string, expectedEpoch: number) =>
    ownerRef.current === expectedOwner && epoch.current === expectedEpoch, []);

  useEffect(() => {
    const preserveInitialIdea = !previousOwner.current && Boolean(owner);
    previousOwner.current = owner;
    epoch.current++;
    busyRef.current = false; setBusy(false); switchingRef.current = false; setSwitching(false);
    setWorkspaces([]); setWorkspaceId(''); setResearch([]); setSelectedId('');
    if (!preserveInitialIdea) { setTitle(''); setIdea(''); setMaterials([]); setDirectMode(false); setSourceOpen(false); }
    setFreeText(''); freeTextFile.current = null; setExistingSources([]);
    setCore(emptyCore()); setVersion(1); setVersions([]);
    setIngestionTaskIds([]); setIngestionLabels({}); setIngestionStates({}); setReviewTaskId(''); setIngestionDetail(null); setProposal(null); setDirty(false);
    setStatus(''); setError(''); setConversationOpen(false); setConversationGoal('');
    createKey.current = ''; createIntent.current = null; uploadKey.current = ''; uploadSignature.current = '';
    guideSessionKey.current = ''; guideSessionTitle.current = ''; guideTaskKey.current = ''; guideTaskIntent.current = null; guideSessionId.current = ''; setInitialTaskId('');
    uploadedFiles.current = new WeakSet<File>(); fileIdentities.current = new WeakMap<File, string>();
    if (!owner) return;
    const current = epoch.current;
    void Promise.all([
      listMyWorkspaces(),
      apiRequest<{ researchObjects: DashboardResearchApi[] }>('/api/research-objects?limit=100'),
    ]).then(([spaces, found]) => {
      if (!isCurrent(owner, current)) return;
      setWorkspaces(spaces);
      setWorkspaceId(spaces.find((item) => item.type === 'personal')?.id ?? spaces[0]?.id ?? '');
      setResearch(found.researchObjects);
    }).catch((cause) => { if (isCurrent(owner, current)) setError(errorText(cause, copy.failure)); });
  }, [owner, isCurrent, copy.failure]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'direct') setDirectMode(true);
  }, []);

  const refreshResearch = useCallback(async (expectedOwner: string, expectedEpoch: number) => {
    const result = await apiRequest<{ researchObjects: DashboardResearchApi[] }>('/api/research-objects?limit=100');
    if (isCurrent(expectedOwner, expectedEpoch)) setResearch(result.researchObjects);
  }, [isCurrent]);

  const selectResearch = useCallback(async (id: string) => {
    if (!owner || busyRef.current || switchingRef.current) return;
    const pendingText = Boolean(freeText.trim() && (freeTextFile.current?.text !== freeText || !uploadedFiles.current.has(freeTextFile.current.file)));
    if ((dirtyRef.current || pendingText) && id !== chosenId.current) { setError(copy.switchWarning); return; }
    const current = ++epoch.current;
    switchingRef.current = true; setSwitching(true); setError(''); setStatus('');
    if (!id) {
      setSelectedId(''); setTitle(''); setIdea(''); setMaterials([]); setFreeText(''); freeTextFile.current = null; setExistingSources([]); setCore(emptyCore()); setVersion(1); setDirty(false); setDirectMode(false); setSourceOpen(false);
      setIngestionTaskIds([]); setIngestionLabels({}); setIngestionStates({}); setReviewTaskId(''); setIngestionDetail(null); setProposal(null); setVersions([]);
      createKey.current = ''; createIntent.current = null; uploadKey.current = ''; uploadSignature.current = '';
      guideSessionKey.current = ''; guideSessionTitle.current = ''; guideTaskKey.current = ''; guideTaskIntent.current = null; guideSessionId.current = ''; setInitialTaskId('');
      uploadedFiles.current = new WeakSet<File>(); fileIdentities.current = new WeakMap<File, string>(); setConversationOpen(false);
      switchingRef.current = false; setSwitching(false); return;
    }
    try {
      const [found, history, source] = await Promise.all([
        getResearchObject(id, { fresh: true }), listVersions(id, { fresh: true }), loadResearchMaterials(id, { fresh: true }),
      ]);
      if (!isCurrent(owner, current)) return;
      setSelectedId(id); setConversationOpen(false); setInitialTaskId(''); setIdea(''); setMaterials([]); setFreeText(''); freeTextFile.current = null; setDirectMode(false); setSourceOpen(false);
      setExistingSources([...source.artifacts.map((item) => item.logicalPath), ...source.ingestion.tasks.map((task) => task.logicalPath)]);
      setTitle(found.researchObject.title); setVersion(found.researchObject.version);
      setVersions(history.versions);
      const browserDraft = loadGuideDraft(window.localStorage, owner, id, found.researchObject.version);
      setCore(browserDraft ?? found.researchObject.sdf.core);
      setDirty(Boolean(browserDraft && SDF_FIELDS.some((field) => browserDraft[field] !== found.researchObject.sdf.core[field])));
      setIngestionTaskIds(source.ingestion.tasks.filter((task) => task.state !== 'confirmed').map((task) => task.id));
      setIngestionLabels(Object.fromEntries(source.ingestion.tasks.map((task) => [task.id, task.logicalPath])));
      setIngestionStates(Object.fromEntries(source.ingestion.tasks.map((task) => [task.id, task.state])));
      setReviewTaskId(source.ingestion.tasks.find((task) => task.state === 'needs_review')?.id ?? source.ingestion.tasks[0]?.id ?? '');
      createKey.current = ''; createIntent.current = null; uploadKey.current = ''; uploadSignature.current = '';
      guideSessionKey.current = ''; guideSessionTitle.current = ''; guideTaskKey.current = ''; guideTaskIntent.current = null; guideSessionId.current = '';
      uploadedFiles.current = new WeakSet<File>(); fileIdentities.current = new WeakMap<File, string>();
    } catch (cause) { if (isCurrent(owner, current)) setError(errorText(cause, copy.failure)); }
    finally { if (isCurrent(owner, current)) { switchingRef.current = false; setSwitching(false); } }
  }, [copy.failure, copy.switchWarning, freeText, isCurrent, owner]);

  function editField(field: SdfField, value: string) {
    if (busyRef.current || switchingRef.current) return;
    const next = { ...coreRef.current, [field]: value };
    coreRef.current = next;
    setCore(next); setDirty(true); setStatus('');
    if (selectedId && owner) saveGuideDraft(window.localStorage, owner, selectedId, versionRef.current, next);
  }

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || switchingRef.current) return;
    if (!owner || !workspaceId) { router.push(directMode ? directLoginHref : loginHref); return; }
    if (!idea.trim() && !title.trim() && !freeText.trim() && materials.length === 0 && !SDF_FIELDS.some((field) => coreRef.current[field].trim())) { setError(copy.required); return; }
    const current = epoch.current;
    const goal = guideSessionTitle.current || idea.trim();
    const resolvedTitle = title.trim() || goal.replace(/\s+/gu, ' ').slice(0, 120) || materials[0]?.file.name.replace(/\.[^.]+$/u, '') || freeText.trim().split(/\r?\n/u)[0].slice(0, 120) || copy.titlePlaceholder;
    busyRef.current = true; setBusy(true); setError(''); setStatus(copy.saving);
    try {
      createKey.current ||= crypto.randomUUID();
      let id = selectedId;
      let guideTasks = ingestionTaskIds.map((taskId) => ({ id: taskId, researchObjectId: id, state: 'queued' }));
      if (!id) {
        createIntent.current ||= { workspaceId, title: resolvedTitle, ...(SDF_FIELDS.some((field) => coreRef.current[field].trim()) ? { core: { ...coreRef.current } } : {}) };
        const intent = createIntent.current;
        id = (await createResearchObject({ workspaceId: intent.workspaceId, title: intent.title, ...(intent.core ? { sdf: { core: intent.core } } : {}) }, createKey.current)).researchObject.id;
        if (!isCurrent(owner, current)) return;
        setSelectedId(id); setTitle(intent.title); setDirty(false);
        createKey.current = ''; createIntent.current = null;
      }
      if (freeText.trim() && freeTextFile.current?.text !== freeText) {
        freeTextFile.current = { text: freeText, file: new File([freeText], copy.pastedFileName, { type: 'text/markdown;charset=utf-8' }) };
      }
      const pastedFile = freeText.trim() ? freeTextFile.current?.file : undefined;
      const newFiles = [...materials.map((item) => item.file), ...(pastedFile ? [pastedFile] : [])].filter((file) => !uploadedFiles.current.has(file));
      if (newFiles.length) {
        const signature = `${id}:${newFiles.map((file) => {
          let identity = fileIdentities.current.get(file);
          if (!identity) { identity = crypto.randomUUID(); fileIdentities.current.set(file, identity); }
          return identity;
        }).join('|')}`;
        if (uploadSignature.current !== signature) { uploadSignature.current = signature; uploadKey.current = `guide:${crypto.randomUUID()}`; }
        setMaterials((items) => items.map((item) => newFiles.includes(item.file) ? { ...item, status: 'uploading', progress: 0 } : item));
        const result = await startIngestionBatch(id, newFiles, uploadKey.current, (percent) => {
          if (isCurrent(owner, current)) setMaterials((items) => items.map((item) => newFiles.includes(item.file) ? { ...item, progress: percent } : item));
        });
        if (!isCurrent(owner, current)) return;
        setMaterials((items) => items.map((item) => {
          const index = newFiles.indexOf(item.file);
          return index >= 0 && result.tasks[index] ? updateMaterialFromTask(item, result.tasks[index]) : item;
        }));
        newFiles.forEach((file) => uploadedFiles.current.add(file));
        setIngestionTaskIds((ids) => [...ids, ...result.tasks.map((task) => task.id)]);
        setIngestionLabels((labels) => ({ ...labels, ...Object.fromEntries(result.tasks.map((task) => [task.id, task.logicalPath])) }));
        setIngestionStates((states) => ({ ...states, ...Object.fromEntries(result.tasks.map((task) => [task.id, task.state])) }));
        setExistingSources((names) => [...names, ...result.tasks.map((task) => task.logicalPath)]);
        setReviewTaskId(result.tasks[0]?.id ?? '');
        guideTasks = [...guideTasks, ...result.tasks.map((task) => ({ id: task.id, researchObjectId: id, state: task.state }))];
        uploadKey.current = ''; uploadSignature.current = '';
      }
      if (!isCurrent(owner, current)) return;
      await refreshResearch(owner, current);
      if (!isCurrent(owner, current)) return;
      if (goal) {
        guideSessionKey.current ||= crypto.randomUUID();
        guideSessionTitle.current ||= goal;
        if (!guideSessionId.current) {
          const createdSession = await createWorkspaceGuideSession(goal, guideSessionKey.current, id);
          if (!isCurrent(owner, current)) return;
          guideSessionId.current = createdSession.session.id;
        }
        guideTaskKey.current ||= crypto.randomUUID();
        guideTaskIntent.current ||= { goal, payload: { goal, locale: locale === 'en' ? 'en' : 'zh', route: 'research-object-edit', target: null,
          context: { tasks: guideTasks,
            researchObjects: [{ id, title: resolvedTitle, status: 'draft' }], editorDraft: draftContext(id, versionRef.current, coreRef.current) } } };
        const task = await submitWorkspaceGuideTask({ sessionId: guideSessionId.current, idempotencyKey: guideTaskKey.current, payload: guideTaskIntent.current.payload });
        if (!isCurrent(owner, current)) return;
        guideTaskKey.current = ''; guideTaskIntent.current = null; guideSessionTitle.current = ''; setInitialTaskId(task.task.id); setConversationGoal(''); setConversationOpen(true); setIdea('');
      } else if (newFiles.length) setConversationOpen(true);
      setStatus(copy.saved);
    } catch (cause) {
      if (isCurrent(owner, current)) {
        setError(errorText(cause, copy.failure));
        if (cause instanceof ApiClientError && cause.status === 401) router.push(directMode ? directLoginHref : loginHref);
      }
    } finally { if (isCurrent(owner, current)) { busyRef.current = false; setBusy(false); } }
  }

  async function savePrivateDraft() {
    if (!owner || !selectedId || busyRef.current) { if (!owner) router.push(loginHref); return; }
    const current = epoch.current, id = selectedId, frozen = { ...coreRef.current }, base = versionRef.current;
    busyRef.current = true; setBusy(true); setError(''); setStatus(copy.saving);
    try {
      await updateSdf(id, base, frozen);
      if (!isCurrent(owner, current) || chosenId.current !== id) return;
      const history = await listVersions(id, { fresh: true });
      if (!isCurrent(owner, current) || chosenId.current !== id) return;
      setVersion(base + 1); setVersions(history.versions);
      setDirty(SDF_FIELDS.some((field) => coreRef.current[field] !== frozen[field]));
      saveGuideDraft(window.localStorage, owner, id, base + 1, coreRef.current);
      setStatus(copy.saved);
    } catch (cause) {
      if (isCurrent(owner, current)) {
        try {
          const [found, history] = await Promise.all([getResearchObject(id, { fresh: true }), listVersions(id, { fresh: true })]);
          if (!isCurrent(owner, current) || chosenId.current !== id) return;
          if (found.researchObject.version > base && SDF_FIELDS.every((field) => found.researchObject.sdf.core[field] === frozen[field])) {
            setVersion(found.researchObject.version); setVersions(history.versions);
            setDirty(SDF_FIELDS.some((field) => coreRef.current[field] !== frozen[field])); setStatus(copy.saved);
          } else setError(errorText(cause, copy.failure));
        } catch { if (isCurrent(owner, current)) setError(errorText(cause, copy.failure)); }
      }
    }
    finally { if (isCurrent(owner, current)) { busyRef.current = false; setBusy(false); } }
  }

  async function refreshExtraction() {
    const id = reviewTaskId || ingestionTaskIds.at(-1);
    if (!owner || !id) return;
    const current = epoch.current;
    try {
      const detail = await getIngestionTask(id);
      if (!isCurrent(owner, current) || chosenId.current !== detail.researchObjectId || reviewTaskRef.current !== id) return;
      setIngestionDetail(detail);
      setIngestionStates((states) => ({ ...states, [id]: detail.task.state }));
      setProposal(proposedCore(detail));
      setError('');
    } catch (cause) { if (isCurrent(owner, current)) setError(errorText(cause, copy.failure)); }
  }

  async function acceptExtraction() {
    if (!owner || !selectedId || !ingestionDetail?.task.agentTaskId || ingestionDetail.task.state !== 'needs_review' || !proposal || busyRef.current || dirtyRef.current
      || !SDF_FIELDS.some((field) => proposal[field].trim())) return;
    const current = epoch.current, id = selectedId, detail = ingestionDetail, accepted = { ...proposal };
    busyRef.current = true; setBusy(true); setError('');
    try {
      const result = await confirmIngestionTask(detail.task.id, { version: versionRef.current, core: accepted, sourceAgentTaskId: detail.task.agentTaskId! });
      if (!isCurrent(owner, current) || chosenId.current !== id) return;
      const history = await listVersions(id, { fresh: true });
      if (!isCurrent(owner, current) || chosenId.current !== id) return;
      setCore(result.sdf.core); setVersion(result.confirmation.version); setVersions(history.versions);
      setDirty(false); setProposal(null); setIngestionTaskIds((ids) => ids.filter((item) => item !== detail.task.id));
      setReviewTaskId((currentId) => currentId === detail.task.id ? '' : currentId);
      setStatus(copy.saved);
    } catch (cause) {
      if (isCurrent(owner, current)) {
        try {
          const [latestTask, found, history] = await Promise.all([
            getIngestionTask(detail.task.id), getResearchObject(id, { fresh: true }), listVersions(id, { fresh: true }),
          ]);
          if (isCurrent(owner, current) && chosenId.current === id && ['confirmed', 'written'].includes(latestTask.task.state)) {
            setCore(found.researchObject.sdf.core); setVersion(found.researchObject.version);
            setVersions(history.versions); setDirty(false); setProposal(null);
            setIngestionTaskIds((ids) => ids.filter((item) => item !== detail.task.id)); setReviewTaskId(''); setStatus(copy.saved);
          } else if (isCurrent(owner, current)) setError(errorText(cause, copy.failure));
        } catch { if (isCurrent(owner, current)) setError(errorText(cause, copy.failure)); }
      }
    }
    finally { if (isCurrent(owner, current)) { busyRef.current = false; setBusy(false); } }
  }

  const editorDraft = selectedId ? draftContext(selectedId, version, core) : undefined;
  const currentResearch = research.find((item) => item.id === selectedId);
  const latestVersion = versions[0];
  const published = versions.some((item) => item.publicationNo != null);
  const dashboardContext = useMemo(() => ({
    tasks: ingestionTaskIds.map((id) => ({ id, researchObjectId: selectedId, state: ingestionDetail?.task.id === id ? ingestionDetail.task.state : 'queued' })),
    researchObjects: selectedId ? [{ id: selectedId, title: title || currentResearch?.title || '', status: currentResearch?.status || 'draft' }] : [],
    ...(editorDraft ? { editorDraft } : {}),
    ...(ingestionDetail?.task.id && ingestionDetail.task.state === 'needs_review' ? { researchRunSource: { ingestionTaskId: ingestionDetail.task.id } } : {}),
  }), [ingestionTaskIds, selectedId, ingestionDetail, title, currentResearch, editorDraft]);

  function applyHermesEdit(edit: NonNullable<WorkspaceGuideResult['draftEdit']>, replace = false) {
    const changed = SDF_FIELDS.filter((field) => typeof edit.changes[field] === 'string');
    if (!editorDraft || edit.base.researchObjectId !== selectedId || edit.base.scope !== 'sdf' || edit.base.version !== version || busyRef.current) return { applied: 0, conflicts: changed.length };
    const next = { ...coreRef.current }; let applied = 0, conflicts = 0;
    const before = draftContext(selectedId, version, next);
    for (const field of changed) {
      if (!replace && next[field] !== edit.base.core[field]) { conflicts++; continue; }
      next[field] = edit.changes[field]!; applied++;
    }
    if (applied) {
      lastHermesEdit.current = { base: before, changes: Object.fromEntries(changed.filter((field) => next[field] !== before.core[field]).map((field) => [field, next[field]])) };
      coreRef.current = next; setCore(next); setDirty(true); saveGuideDraft(window.localStorage, owner, selectedId, version, next);
    }
    return { applied, conflicts };
  }

  function startDirect() {
    if (busyRef.current || switchingRef.current) return;
    setDirectMode(true);
    window.requestAnimationFrame(() => freeTextInput.current?.focus());
  }

  return <section className={styles.workspace} aria-label={copy.heading} data-guide-workspace="true">
    <div className={styles.intro}>
      <div><p className={styles.eyebrow}>Hermes · Research workspace</p><h2>{copy.heading}</h2></div>
      <HermesDockAnchor floating={false} assistantOpen={conversationOpen} suggestion={suggestion}
        state={busy ? 'scanning' : error ? 'failed' : 'idle'} onInvoke={() => owner ? setConversationOpen(true) : router.push(directMode ? directLoginHref : loginHref)} workspaceId={selectedId || 'guide'} />
    </div>
    <form onSubmit={begin} className={styles.composer}>
      <div className={styles.inputCards}>
        <section className={styles.inputCard} data-guide-input-card="upload">
          <h3>{copy.upload}</h3>
          <p>{copy.uploadHint}</p>
          <div className={styles.entryActions}><button type="button" onClick={() => setSourceOpen(true)} disabled={busy || switching}>{copy.upload}</button><button type="button" onClick={startDirect} disabled={busy || switching}>{copy.direct}</button></div>
        </section>
        <section className={styles.inputCard} data-guide-input-card="title">
          <label htmlFor="guide-research-title">{copy.title}</label>
          <input id="guide-research-title" value={title} placeholder={copy.titlePlaceholder} disabled={busy || switching} onChange={(event) => setTitle(event.target.value)} />
          <p>{copy.titleHint}</p>
        </section>
        <section className={styles.inputCard} data-guide-input-card="sources">
          <h3>{copy.source}</h3>
          {materials.length || freeText.trim() || existingSources.length ? <ul>{Array.from(new Set([
            ...materials.map((item) => item.file.name), ...(freeText.trim() ? [copy.pastedSource] : []), ...existingSources,
          ])).map((name) => <li key={name}>{name}</li>)}</ul> : <p>{copy.sourceHint}</p>}
        </section>
      </div>
      {sourceOpen ? <div className={styles.source}><EvidenceIntake materials={materials} onChange={setMaterials} disabled={busy || switching} variant="research-start" /></div> : null}
      {directMode ? <div className={styles.directEntry}>
        <label htmlFor="guide-research-text">{copy.directLabel}</label>
        <textarea id="guide-research-text" ref={freeTextInput} value={freeText} placeholder={copy.directPlaceholder} rows={10}
          onChange={(event) => setFreeText(event.target.value)} disabled={busy || switching} />
      </div> : null}
      <div className={styles.conversationEntry}>
        <label className={styles.srOnly} htmlFor="guide-research-idea">{copy.placeholder}</label>
        <textarea id="guide-research-idea" value={idea} placeholder={copy.placeholder} rows={3} maxLength={2000}
          onChange={(event) => setIdea(event.target.value)} disabled={busy || switching} />
        <div className={styles.prompts}>{copy.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => setIdea(prompt)}>{prompt}</button>)}</div>
      </div>
      {owner && workspaces.length > 1 ? <div className={styles.controls}><label>{copy.workspaces}<select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} disabled={busy || switching}>{workspaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label></div> : null}
      <div className={styles.actions}><button type="submit" disabled={busy || switching}>{owner ? busy ? copy.saving : copy.send : copy.signIn}</button></div>
      {!owner ? <p className={styles.hint}>{copy.local}</p> : null}
    </form>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {status ? <p role="status" className={styles.status}>{status}</p> : null}
    {owner ? <HermesAssistantDrawer key={`${owner}:${selectedId || 'new'}`} open={conversationOpen} onOpenChange={setConversationOpen}
      locale={locale === 'en' ? 'en' : 'zh'} suggestion={suggestion} dashboardContext={dashboardContext}
      route={selectedId ? 'research-object-edit' : 'research-object-new'} routeResearchObjectId={selectedId || undefined}
      initialGoal={conversationGoal} initialTaskId={initialTaskId || undefined} onDraftEdit={applyHermesEdit} onUndoDraftEdit={() => {
        const previous = lastHermesEdit.current;
        if (!previous || previous.base.researchObjectId !== selectedId || previous.base.version !== version) return;
        const next = { ...coreRef.current };
        for (const field of SDF_FIELDS) if (previous.changes[field] === next[field]) next[field] = previous.base.core[field];
        coreRef.current = next; setCore(next); setDirty(true); saveGuideDraft(window.localStorage, owner, selectedId, version, next); lastHermesEdit.current = null;
      }} docked embedded pageOwnedAnchor /> : null}

    {!switching && selectedId ? <div className={styles.editor}>
      <div className={styles.editorHead}><p>{copy.research} · {title || currentResearch?.title || copy.newResearch}</p><span>{copy.version} {latestVersion?.versionNo ?? version}</span></div>
      {published ? <p className={styles.hint}>{copy.published}</p> : null}
      <h3>{copy.editor}</h3>
      <CoreEditor core={core} onEdit={editField} activeField={activeField} onSelectField={setActiveField} readOnly={busy || switching} />
      <div className={styles.actions}><button type="button" onClick={() => selectedId ? void savePrivateDraft() : document.querySelector<HTMLFormElement>('[data-guide-workspace] form')?.requestSubmit()} disabled={busy || switching || !dirty}>{copy.save}</button>{latestVersion ? <Link href={`/research-objects/${encodeURIComponent(selectedId)}/publish`}>{copy.publish}</Link> : null}</div>
      {ingestionTaskIds.length ? <section className={styles.review}><h3>{copy.source}</h3>{ingestionTaskIds.length > 1 ? <select aria-label={copy.source} value={reviewTaskId} onChange={(event) => { reviewTaskRef.current = event.target.value; setReviewTaskId(event.target.value); setIngestionDetail(null); setProposal(null); }}>{ingestionTaskIds.map((id) => <option key={id} value={id}>{ingestionLabels[id] || id}{ingestionStates[id] ? ` · ${ingestionStatusT(ingestionStates[id])}` : ''}</option>)}</select> : null}<p>{ingestionDetail ? `${ingestionDetail.task.logicalPath} · ${ingestionStatusT(ingestionDetail.task.state)}` : copy.pending}</p><button type="button" onClick={() => void refreshExtraction()} disabled={busy}>{copy.refresh}</button>{proposal ? <div><h4>{copy.review}</h4>{SDF_FIELDS.map((field) => <div key={field}><label>{editorT(field)}<textarea value={proposal[field]} disabled={busy} onChange={(event) => setProposal((value) => value ? { ...value, [field]: event.target.value } : value)} /></label><HermesExtractionEvidence field={field} result={ingestionDetail?.task.result} /></div>)}<button type="button" onClick={() => void acceptExtraction()} disabled={busy || dirty || !SDF_FIELDS.some((field) => proposal[field].trim())}>{copy.accept}</button></div> : ingestionDetail ? <p>{copy.extractionUnavailable}</p> : null}</section> : null}
    </div> : null}

    <div className={styles.picker}><h3>{copy.update}</h3><p>{copy.updateDescription}</p>{owner ? <select aria-label={copy.choose} value={selectedId} onChange={(event) => void selectResearch(event.target.value)} disabled={busy || switching}><option value="">{copy.newResearch}</option>{research.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select> : <Link href={directMode ? directLoginHref : loginHref}>{copy.signIn}</Link>}{owner && research.length === 0 ? <p>{copy.noResearch}</p> : null}</div>
  </section>;
}

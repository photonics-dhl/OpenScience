'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { FormEvent, useEffect, useRef, useState } from 'react';

import Drawer from '@/components/editor/Drawer';
import { LiteratureAcquisition } from '@/components/dashboard/LiteratureAcquisition';
import {
  createWorkspaceGuideSession,
  ApiClientError,
  getCurrentUser,
  getAgentTask,
  listAgentTasks,
  listVersions,
  submitWorkspaceGuideTask,
  type AgentTaskView,
  type WorkspaceGuidePayload,
  type WorkspaceGuideResult,
} from '@/lib/api';
import { routeHermesLiteratureIntent, type RoutedHermesIntent } from '@/lib/hermes/literature-intent';
import { createLiteratureIntentFingerprint } from '@/lib/literature-acquisition-state';

import type { HermesPresentationIntent } from '@/lib/hermes/presentation-intent';
import { useRouter, useSearchParams } from 'next/navigation';
import { HermesPresentationReview } from './HermesPresentationReview';
import type { SubmissionIntent } from '@/lib/hermes/presentation-action';
import { getHermesDraftStorage, loadHermesGuideGoal, saveHermesGuideGoal, type HermesDraftScope } from '@/lib/hermes/draft-state';
import type { HermesGuideSuggestion } from './hermes-guide';
import { SDF_FIELDS } from '@/lib/suggestions';

type LiteratureIntent = Extract<RoutedHermesIntent, { kind: 'literature.acquire' }>;

export function selectRestorableGuide(tasks: AgentTaskView[], route: WorkspaceGuidePayload['route'], researchObjectId?: string): AgentTaskView | null {
  return tasks.find((candidate) => candidate.kind === 'workspace.guide'
    && (route === 'research-object-edit'
      ? Boolean(researchObjectId) && candidate.researchObjectId === researchObjectId
      : !candidate.researchObjectId)) ?? null;
}
type DrawerLiteratureIntent = LiteratureIntent & { callerIdempotencyKey: string; callerIntentFingerprint: string };

export function resolveDrawerLiteratureTarget(routeResearchObjectId: string | null): LiteratureIntent['target'] {
  return routeResearchObjectId
    ? { kind: 'research_object', researchObjectId: routeResearchObjectId }
    : { kind: 'personal' };
}

export async function createDrawerLiteratureIntent({
  createIdempotencyKey,
  createIntentFingerprint = createLiteratureIntentFingerprint,
  goal,
  routeResearchObjectId,
}: {
  createIdempotencyKey: () => string;
  createIntentFingerprint?: (input: LiteratureIntent['input']) => Promise<string>;
  goal: string;
  routeResearchObjectId: string | null;
}): Promise<DrawerLiteratureIntent | null> {
  const routed = routeHermesLiteratureIntent({ activeResearchObjectId: null, goal });
  if (routed.kind !== 'literature.acquire') return null;
  return {
    ...routed,
    callerIdempotencyKey: createIdempotencyKey(),
    callerIntentFingerprint: await createIntentFingerprint(routed.input),
    target: resolveDrawerLiteratureTarget(routeResearchObjectId),
  };
}

export interface HermesAssistantDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  locale: 'zh' | 'en';
  suggestion: HermesGuideSuggestion;
  dashboardContext: WorkspaceGuidePayload['context'];
  onTaskStateChange?(task: AgentTaskView | null): void;
  route?: WorkspaceGuidePayload['route'];
  routeResearchObjectId?: string;
  target?: WorkspaceGuidePayload['target'];
  onDraftEdit?(edit: NonNullable<WorkspaceGuideResult['draftEdit']>, replace?: boolean): { applied: number; conflicts: number };
  onUndoDraftEdit?(): void;
  /** Optional caller-provided text to prefill and route through the same Hermes conversation. */
  initialGoal?: string;
  docked?: boolean;
}

function resultFromTask(task: AgentTaskView): WorkspaceGuideResult | null {
  const value = task.result;
  if (!value || typeof value.summary !== 'string' || typeof value.needsMoreInformation !== 'boolean' || !Array.isArray(value.nextSteps)) return null;
  const nextSteps = value.nextSteps.filter((step): step is WorkspaceGuideResult['nextSteps'][number] => {
    if (!step || typeof step !== 'object') return false;
    const candidate = step as Record<string, unknown>;
    return typeof candidate.label === 'string'
      && ['open-task', 'open-ro', 'start-import', 'prepare-publication'].includes(String(candidate.intent))
      && (candidate.targetId === undefined || typeof candidate.targetId === 'string');
  }).slice(0, 1);
  if (nextSteps.length !== value.nextSteps.length) return null;
  let presentationDraft: WorkspaceGuideResult['presentationDraft'];
  if (value.presentationDraft !== undefined) {
    const candidate = value.presentationDraft as Record<string, unknown>;
    if (!candidate || typeof candidate !== 'object' || !['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(String(candidate.action))
      || typeof candidate.instruction !== 'string' || !candidate.instruction.trim() || candidate.instruction.length > 1_000
      || typeof candidate.researchObjectId !== 'string' || typeof candidate.versionId !== 'string') return null;
    presentationDraft = {
      action: candidate.action as NonNullable<WorkspaceGuideResult['presentationDraft']>['action'],
      instruction: candidate.instruction as string,
      researchObjectId: candidate.researchObjectId as string,
      versionId: candidate.versionId as string,
    };
  }
  let draftEdit: WorkspaceGuideResult['draftEdit'];
  if (value.draftEdit !== undefined) {
    const edit = value.draftEdit as NonNullable<WorkspaceGuideResult['draftEdit']>;
    if (!edit?.base || typeof edit.base.researchObjectId !== 'string' || typeof edit.base.scope !== 'string' || !Number.isSafeInteger(edit.base.version)
      || !edit.base.core || !SDF_FIELDS.every((field) => typeof edit.base.core[field] === 'string')
      || !edit.changes || typeof edit.changes !== 'object' || Array.isArray(edit.changes)
      || !Object.entries(edit.changes).every(([field, text]) => SDF_FIELDS.includes(field as typeof SDF_FIELDS[number]) && typeof text === 'string' && text.length <= 4000)) return null;
    draftEdit = edit;
  }
  return { summary: value.summary, nextSteps, needsMoreInformation: value.needsMoreInformation, ...(presentationDraft ? { presentationDraft } : {}), ...(draftEdit ? { draftEdit } : {}) };
}

export function HermesAssistantDrawer(props: HermesAssistantDrawerProps) {
  return <React.Suspense fallback={null}><HermesAssistantDrawerContent {...props} /></React.Suspense>;
}

function HermesAssistantDrawerContent({
  open, onOpenChange, locale, suggestion, dashboardContext, onTaskStateChange, route = 'dashboard', routeResearchObjectId, target = null, onDraftEdit, onUndoDraftEdit, initialGoal, docked = false,
}: HermesAssistantDrawerProps) {
  const t = useTranslations('dashboard.hermes');
  const [wide, setWide] = useState(false);
  useEffect(() => { const media = window.matchMedia('(min-width: 1024px)'); const update = () => setWide(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const tw = useTranslations('workbench');
  const fieldLabel = useTranslations('editor');
  const appliedTasks = useRef(new Set<string>());
  const [editOutcome, setEditOutcome] = useState<{ applied: number; conflicts: number } | null>(null);
  const tc = useTranslations('hermesConversation');
  const presentationSubmissions = useRef(new Map<string, SubmissionIntent>());
  const [presentationIntent, setPresentationIntent] = useState<HermesPresentationIntent | null>(null);
  const [presentationSuggestion, setPresentationSuggestion] = useState<WorkspaceGuideResult['presentationDraft']>();
  const [viewerId, setViewerId] = useState('');
  const [restoredTask, setRestoredTask] = useState(false);
  const [guideStored, setGuideStored] = useState(false);
  const requestedVersion = useSearchParams()?.get('version') ?? '';
  const router = useRouter();
  const currentOwner = `${route}:${routeResearchObjectId ?? ''}:${requestedVersion}`;
  const [resolvedGuide, setResolvedGuide] = useState({ owner: currentOwner, versionId: requestedVersion });
  const resolvedGuideVersion = resolvedGuide.owner === currentOwner ? resolvedGuide.versionId : '';
  const ownerRef = useRef(currentOwner); ownerRef.current = currentOwner;
  const sessionId = useRef<string | null>(null);
  const sessionKey = useRef<string | null>(null);
  const taskKey = useRef<string | null>(null);
  const pendingPayload = useRef<WorkspaceGuidePayload | null>(null);
  const submittingRef = useRef(false);
  const goalTouched = useRef(false);
  const [goal, setGoal] = useState('');
  const injectedGoal = useRef('');
  const [task, setTask] = useState<AgentTaskView | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [sentGoal, setSentGoal] = useState('');
  const [turns, setTurns] = useState<Array<{ id: string; user: string; summary: string }>>([]);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const preparedTasks = useRef(new Set<string>());
  const [literatureIntent, setLiteratureIntent] = useState<DrawerLiteratureIntent | null>(null);
  const activeTask = task?.status === 'pending' || task?.status === 'running';
  const busy = submitting || activeTask;
  const result = task?.status === 'succeeded' ? resultFromTask(task) : null;
  const invalidResult = task?.status === 'succeeded' && !result;
  useEffect(() => {
    if (!task || !result?.draftEdit || !onDraftEdit || restoredTask || appliedTasks.current.has(task.id)) return;
    appliedTasks.current.add(task.id);
    setEditOutcome(onDraftEdit(result.draftEdit));
  }, [task, result, restoredTask, onDraftEdit]);
  const guideDraftScope: HermesDraftScope | null = viewerId ? {
    userId: viewerId,
    researchObjectId: routeResearchObjectId ?? route,
    versionId: route === 'research-object-edit' ? resolvedGuideVersion : route,
    purpose: 'guide-goal',
  } : null;
  const resolvedDraftScope = guideDraftScope?.versionId ? guideDraftScope : null;
  const draftStorage = getHermesDraftStorage();
  const scopedPresentationDraft = result?.presentationDraft
    && route === 'research-object-edit'
    && result.presentationDraft.researchObjectId === routeResearchObjectId
    && (!requestedVersion || result.presentationDraft.versionId === requestedVersion)
    && (!restoredTask || Boolean(requestedVersion))
    ? result.presentationDraft
    : undefined;

  useEffect(() => {
    appliedTasks.current.clear(); setEditOutcome(null);
    preparedTasks.current.clear(); setTurns([]); setSentGoal(''); followTranscript.current = true;
    setPresentationIntent(null); setPresentationSuggestion(undefined); setLiteratureIntent(null); setTask(null); setGoal(''); setError(''); setSubmitting(false); setRestoredTask(false); setGuideStored(false);
    sessionId.current = null; sessionKey.current = null; taskKey.current = null; pendingPayload.current = null; submittingRef.current = false; goalTouched.current = false; setActionBusy(false);
  }, [currentOwner]);

  useEffect(() => {
    if (!open) { injectedGoal.current = ''; return; }
    const next = initialGoal?.trim() ?? '';
    if (!next || injectedGoal.current === `${currentOwner}:${next}`) return;
    injectedGoal.current = `${currentOwner}:${next}`;
    goalTouched.current = true; setGoal(next);
  }, [currentOwner, initialGoal, open]);

  useEffect(() => {
    const pane = transcript.current;
    if (pane && followTranscript.current) pane.scrollTop = pane.scrollHeight;
  }, [open, sentGoal, turns, task?.status, result?.summary, presentationIntent, editOutcome]);

  useEffect(() => {
    if (!task || !result || result.needsMoreInformation || restoredTask || preparedTasks.current.has(task.id)) return;
    preparedTasks.current.add(task.id);
    if (scopedPresentationDraft) {
      setPresentationSuggestion(scopedPresentationDraft);
      setPresentationIntent({ action: scopedPresentationDraft.action, instruction: scopedPresentationDraft.instruction });
    }
    const preview = result.nextSteps.find((step) => step.intent === 'prepare-publication' && step.targetId === routeResearchObjectId);
    if (preview && route === 'research-object-edit' && routeResearchObjectId) {
      const version = requestedVersion || resolvedGuideVersion;
      router.push(`/research-objects/${encodeURIComponent(routeResearchObjectId)}/edit?${new URLSearchParams({ stage: 'publish', ...(version ? { version } : {}) })}`);
    }
  }, [task, result, restoredTask, scopedPresentationDraft, requestedVersion, resolvedGuideVersion, route, routeResearchObjectId, router]);

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((user) => { if (active) setViewerId(user.userId); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (route !== 'research-object-edit' || !routeResearchObjectId) { setResolvedGuide({ owner: currentOwner, versionId: route }); return; }
    if (requestedVersion) { setResolvedGuide({ owner: currentOwner, versionId: requestedVersion }); return; }
    let active = true;
    setResolvedGuide({ owner: currentOwner, versionId: '' });
    void listVersions(routeResearchObjectId)
      .then(({ versions }) => { if (active) setResolvedGuide({ owner: currentOwner, versionId: versions.find((version) => version.status === 'draft')?.versionId ?? '' }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [currentOwner, requestedVersion, route, routeResearchObjectId]);

  useEffect(() => {
    if (!resolvedDraftScope) return;
    if (goalTouched.current) setGuideStored(saveHermesGuideGoal(draftStorage, resolvedDraftScope, goal));
    else {
      const stored = loadHermesGuideGoal(draftStorage, resolvedDraftScope);
      setGuideStored(stored !== null);
      setGoal(stored ?? '');
    }
  }, [currentOwner, resolvedGuideVersion, viewerId]);

  useEffect(() => {
    onTaskStateChange?.(task);
  }, [onTaskStateChange, task]);

  useEffect(() => {
    if (!open || task) return;
    let cancelled = false;
    void listAgentTasks()
      .then(({ tasks }) => {
        if (cancelled || submittingRef.current || sessionId.current) return;
        const restored = selectRestorableGuide(tasks, route, routeResearchObjectId);
        if (restored) {
          sessionId.current = restored.sessionId;
          setRestoredTask(true);
          setTask(restored);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [open, task, route, routeResearchObjectId]);

  useEffect(() => {
    if (!activeTask || !task || error) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getAgentTask('', task.id)
        .then(({ task: next }) => { if (!cancelled) setTask(next); })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : t('guide.error')); });
    }, 900);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeTask, error, task, t]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = goal.trim();
    if (!normalized || busy || actionBusy || submittingRef.current) return;
    if (pendingPayload.current && normalized !== pendingPayload.current.goal) { setError(tc('retrySame')); return; }
    const owner = currentOwner;
    if (task && result) setTurns((previous) => previous.some((turn) => turn.id === task.id) ? previous : [...previous, { id: task.id, user: sentGoal, summary: result.summary }].slice(-12));
    setSentGoal(normalized); followTranscript.current = true;
    setPresentationIntent(null); setPresentationSuggestion(undefined);
    submittingRef.current = true;
    setError('');
    setEditOutcome(null);
    setSubmitting(true);
    setTask(null);
    try {
      const routed = await createDrawerLiteratureIntent({
        createIdempotencyKey: () => crypto.randomUUID(),
        goal: normalized,
        routeResearchObjectId: route === 'research-object-edit' ? routeResearchObjectId ?? null : null,
      });
      if (ownerRef.current !== owner) return;
      if (routed) {
        setLiteratureIntent(routed);
        return;
      }
      if (!sessionId.current) {
        sessionKey.current ??= crypto.randomUUID();
        const response = await createWorkspaceGuideSession(normalized, sessionKey.current, route === 'research-object-edit' ? routeResearchObjectId : undefined);
        if (ownerRef.current !== owner) return;
        sessionId.current = response.session.id;
      }
      taskKey.current ??= crypto.randomUUID();
      pendingPayload.current ??= {
        goal: normalized, locale, route, target,
        context: dashboardContext.presentation && resolvedGuideVersion
          ? { ...dashboardContext, presentation: { ...dashboardContext.presentation, versionId: resolvedGuideVersion } }
          : dashboardContext,
      };
      const response = await submitWorkspaceGuideTask({
        sessionId: sessionId.current,
        idempotencyKey: taskKey.current,
        payload: pendingPayload.current,
      });
      if (ownerRef.current !== owner) return;
      setTask(response.task);
      setRestoredTask(false);
      setGoal('');
      if (resolvedDraftScope) saveHermesGuideGoal(draftStorage, resolvedDraftScope, '');
      taskKey.current = null;
      pendingPayload.current = null;
    } catch (cause) {
      if (ownerRef.current !== owner) return;
      if (cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status)) {
        taskKey.current = null; pendingPayload.current = null;
        if ([401, 403, 404].includes(cause.status)) { sessionId.current = null; sessionKey.current = null; }
      }
      setError(cause instanceof Error ? cause.message : t('guide.error'));
    } finally {
      if (ownerRef.current === owner) { submittingRef.current = false; setSubmitting(false); }
    }
  };

  const actionHref = (step: WorkspaceGuideResult['nextSteps'][number]) => {
    if (step.intent === 'prepare-publication' && step.targetId === routeResearchObjectId && routeResearchObjectId) {
      return `/research-objects/${encodeURIComponent(routeResearchObjectId)}/edit?${new URLSearchParams({ stage: 'publish', ...(resolvedGuideVersion ? { version: resolvedGuideVersion } : {}) })}`;
    }
    if (step.intent === 'start-import') return '/research-objects/new?mode=import';
    if (step.intent === 'open-ro' && step.targetId
      && dashboardContext.researchObjects.some((candidate) => candidate.id === step.targetId)) {
      return `/research-objects/${encodeURIComponent(step.targetId)}/edit`;
    }
    if (step.intent === 'open-task' && step.targetId) {
      const matching = dashboardContext.tasks.find((candidate) => candidate.id === step.targetId);
      if (matching) return `/research-objects/${encodeURIComponent(matching.researchObjectId)}/hermes?task=${encodeURIComponent(step.targetId)}`;
    }
    return null;
  };

  const drawer = (
    <Drawer
      inline={docked && wide}
      className="hermes-assistant-shell hermes-conversation-shell research-product"
      hideCloseButton
      closeLabel={t('guide.close')}
      label={t('guide.dialogLabel')}
      onClose={() => onOpenChange(false)}
      open={open}
      overlayClassName="hermes-assistant-overlay"
      side="right"
    >
      <section className="hermes-conversation" data-hermes-drawer-state={busy ? 'working' : task?.status ?? 'ready'}>
        <header className="hermes-conversation-header">
          <img src="/hermes/wanko-static-transparent.png" width={96} height={96} alt="" className="hermes-conversation-portrait" />
          <div><h2>Hermes</h2><p>{tc('role')}</p></div>
          <button type="button" className="hermes-conversation-close" onClick={() => onOpenChange(false)} aria-label={t('guide.close')}>×</button>
        </header>

        <div className="hermes-conversation-transcript" ref={transcript} role="log" aria-label={tc('conversation')} aria-live="polite" aria-relevant="additions text"
          onScroll={(event) => { const pane = event.currentTarget; followTranscript.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 64; }}>
          <p className="hermes-message hermes-message-assistant">{dashboardContext.editorDraft ? tc('welcomeEditor') : t(suggestion.bodyKey)}</p>
          {turns.map((turn) => <React.Fragment key={turn.id}>
            {turn.user && <p className="hermes-message hermes-message-user">{turn.user}</p>}
            <p className="hermes-message hermes-message-assistant">{turn.summary}</p>
          </React.Fragment>)}
          {sentGoal && <p className="hermes-message hermes-message-user">{sentGoal}</p>}
          {busy && <p className="hermes-message hermes-message-assistant hermes-conversation-status" role="status">{t('guide.working')}</p>}
          {(error || task?.status === 'failed' || invalidResult) && <div className="hermes-conversation-error" role="alert">
            <p>{error || task?.error || t('guide.error')}</p>
            {error && activeTask && <button type="button" onClick={() => setError('')}>{t('guide.resume')}</button>}
          </div>}
          {!submitting && result && <div className="hermes-message hermes-message-assistant">
            <p>{result.summary}</p>
            {result.draftEdit && <div className="hermes-conversation-change">
              <p role="status">{editOutcome ? tw(editOutcome.conflicts ? 'editConflict' : 'editApplied', { count: editOutcome.applied }) : tw('editProposal')}</p>
              {Boolean(editOutcome?.applied) && onUndoDraftEdit && <button type="button" onClick={() => { onUndoDraftEdit(); setEditOutcome(null); }}>{tw('undo')}</button>}
              <details><summary>{tw('viewChanges')}</summary>
                {Object.entries(result.draftEdit.changes).map(([field, value]) => <div className="hermes-conversation-field" key={field}>
                  <h4>{fieldLabel(field)}</h4><p>{value}</p>
                  {onDraftEdit && (restoredTask || Boolean(editOutcome?.conflicts) || (!editOutcome && task && appliedTasks.current.has(task.id))) && <button type="button" onClick={() => setEditOutcome(onDraftEdit({ ...result.draftEdit!, changes: { [field]: value } }, true))}>{tw('useField')}</button>}
                </div>)}
              </details>
            </div>}
            {result.needsMoreInformation && <p className="hermes-conversation-question">{t('guide.needsMoreInformation')}</p>}
            {scopedPresentationDraft && !presentationIntent && <button type="button" className="hermes-conversation-link" onClick={() => { setPresentationSuggestion(scopedPresentationDraft); setPresentationIntent({ action: scopedPresentationDraft.action, instruction: scopedPresentationDraft.instruction }); }}>{tc('productionOptions')}</button>}
            {!presentationIntent && result.nextSteps.map((step, index) => {
              const href = actionHref(step);
              return href ? <Link className="hermes-conversation-link" href={href} key={index}>{step.label} →</Link> : <p key={index}>{step.label}</p>;
            })}
          </div>}
          {presentationIntent && <React.Suspense fallback={<p role="status">{t('guide.working')}</p>}>
            <HermesPresentationReview intent={presentationIntent} suggestion={presentationSuggestion} userId={viewerId}
              submissionRecords={presentationSubmissions.current} routeResearchObjectId={routeResearchObjectId}
              researchObjects={dashboardContext.researchObjects} onBusyChange={setActionBusy}
              onBack={() => { setPresentationIntent(null); setActionBusy(false); }}
              onDone={() => { setPresentationIntent(null); setPresentationSuggestion(undefined); setActionBusy(false); setGoal(''); if (resolvedDraftScope) saveHermesGuideGoal(draftStorage, resolvedDraftScope, ''); }} />
          </React.Suspense>}
          {literatureIntent && <div className="hermes-conversation-acquisition">
            <button type="button" onClick={() => setLiteratureIntent(null)}>{t('guide.backToGuide')}</button>
            <LiteratureAcquisition initialRequest={literatureIntent.input} instanceId="hermes-drawer-literature"
              callerIdempotencyKey={literatureIntent.callerIdempotencyKey} callerIntentFingerprint={literatureIntent.callerIntentFingerprint}
              onAuthenticationRequired={() => window.location.assign(`/auth/login?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)}
              target={literatureIntent.target} tone="paper" />
          </div>}
        </div>

        <form className="hermes-conversation-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="hermes-guide-goal">{tc('inputLabel')}</label>
          <textarea id="hermes-guide-goal" rows={2} maxLength={2000}
            disabled={busy || actionBusy || Boolean(pendingPayload.current)}
            placeholder={tc('placeholder')} value={goal}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
            onChange={(event) => { const next = event.target.value; goalTouched.current = true; setGoal(next); if (resolvedDraftScope) setGuideStored(saveHermesGuideGoal(draftStorage, resolvedDraftScope, next)); }} />
          <div><span>{pendingPayload.current ? tc('retrySame') : tc('inputHint')}</span>
            <button type="submit" disabled={busy || actionBusy || !goal.trim()}>{error && pendingPayload.current ? tc('retry') : tc('send')} <span aria-hidden="true">↑</span></button>
          </div>
          {guideStored && !goal && <span className="sr-only">{t('guide.browserSessionDraft')}</span>}
        </form>
      </section>
    </Drawer>
  );
  return (docked && wide) || typeof document === 'undefined' ? drawer : createPortal(drawer, document.body);
}

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { FormEvent, useEffect, useRef, useState } from 'react';

import Drawer from '@/components/editor/Drawer';
import { LiteratureAcquisition } from '@/components/dashboard/LiteratureAcquisition';
import {
  createWorkspaceGuideSession,
  getAgentTask,
  listAgentTasks,
  submitWorkspaceGuideTask,
  type AgentTaskView,
  type WorkspaceGuidePayload,
  type WorkspaceGuideResult,
} from '@/lib/api';
import { routeHermesLiteratureIntent, type RoutedHermesIntent } from '@/lib/hermes/literature-intent';
import { createLiteratureIntentFingerprint } from '@/lib/literature-acquisition-state';

import { routeHermesPresentationIntent, type HermesPresentationIntent } from '@/lib/hermes/presentation-intent';
import { useSearchParams } from 'next/navigation';
import { HermesPresentationReview } from './HermesPresentationReview';
import type { SubmissionIntent } from '@/lib/hermes/presentation-action';
import type { HermesGuideSuggestion } from './hermes-guide';

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
}

function resultFromTask(task: AgentTaskView): WorkspaceGuideResult | null {
  const value = task.result;
  if (!value || typeof value.summary !== 'string' || typeof value.needsMoreInformation !== 'boolean' || !Array.isArray(value.nextSteps)) return null;
  const nextSteps = value.nextSteps.filter((step): step is WorkspaceGuideResult['nextSteps'][number] => {
    if (!step || typeof step !== 'object') return false;
    const candidate = step as Record<string, unknown>;
    return typeof candidate.label === 'string'
      && ['open-task', 'open-ro', 'start-import'].includes(String(candidate.intent))
      && (candidate.targetId === undefined || typeof candidate.targetId === 'string');
  }).slice(0, 3);
  if (nextSteps.length !== value.nextSteps.length) return null;
  return { summary: value.summary, nextSteps, needsMoreInformation: value.needsMoreInformation };
}

export function HermesAssistantDrawer(props: HermesAssistantDrawerProps) {
  return <React.Suspense fallback={null}><HermesAssistantDrawerContent {...props} /></React.Suspense>;
}

function HermesAssistantDrawerContent({
  open, onOpenChange, locale, suggestion, dashboardContext, onTaskStateChange, route = 'dashboard', routeResearchObjectId, target = null,
}: HermesAssistantDrawerProps) {
  const t = useTranslations('dashboard.hermes');
  const tp = useTranslations('hermesPresentation');
  const presentationSubmissions = useRef(new Map<string, SubmissionIntent>());
  const [presentationIntent, setPresentationIntent] = useState<HermesPresentationIntent | null>(null);
  const requestedVersion = useSearchParams()?.get('version') ?? '';
  const currentOwner = `${route}:${routeResearchObjectId ?? ''}:${requestedVersion}`;
  const ownerRef = useRef(currentOwner); ownerRef.current = currentOwner;
  const sessionId = useRef<string | null>(null);
  const sessionKey = useRef<string | null>(null);
  const taskKey = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [goal, setGoal] = useState('');
  const [task, setTask] = useState<AgentTaskView | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [literatureIntent, setLiteratureIntent] = useState<DrawerLiteratureIntent | null>(null);
  const activeTask = task?.status === 'pending' || task?.status === 'running';
  const busy = submitting || activeTask;
  const result = task?.status === 'succeeded' ? resultFromTask(task) : null;
  const invalidResult = task?.status === 'succeeded' && !result;

  useEffect(() => {
    presentationSubmissions.current.clear();
    setPresentationIntent(null); setLiteratureIntent(null); setTask(null); setGoal(''); setError(''); setSubmitting(false);
    sessionId.current = null; sessionKey.current = null; taskKey.current = null; submittingRef.current = false;
  }, [currentOwner]);

  useEffect(() => {
    onTaskStateChange?.(task);
  }, [onTaskStateChange, task]);

  useEffect(() => {
    if (!open || task) return;
    let cancelled = false;
    void listAgentTasks()
      .then(({ tasks }) => {
        if (cancelled) return;
        const restored = selectRestorableGuide(tasks, route, routeResearchObjectId);
        if (restored) {
          sessionId.current = restored.sessionId;
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
    if (!normalized || busy || submittingRef.current) return;
    const owner = currentOwner;
    const presentation = routeHermesPresentationIntent(normalized);
    if (presentation) { setPresentationIntent(presentation); return; }
    submittingRef.current = true;
    setError('');
    setSubmitting(true);
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
      const response = await submitWorkspaceGuideTask({
        sessionId: sessionId.current,
        idempotencyKey: taskKey.current,
        payload: { goal: normalized, locale, route, target, context: dashboardContext },
      });
      if (ownerRef.current !== owner) return;
      setTask(response.task);
      taskKey.current = null;
    } catch (cause) {
      if (ownerRef.current !== owner) return;
      setError(cause instanceof Error ? cause.message : t('guide.error'));
    } finally {
      if (ownerRef.current === owner) { submittingRef.current = false; setSubmitting(false); }
    }
  };

  const actionHref = (step: WorkspaceGuideResult['nextSteps'][number]) => {
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

  return (
    <Drawer
      className="hermes-assistant-shell"
      closeLabel={t('guide.close')}
      label={t('guide.dialogLabel')}
      onClose={() => onOpenChange(false)}
      open={open}
      overlayClassName="hermes-assistant-overlay"
      side="right"
    >
      <section className="hermes-guide-drawer" data-hermes-drawer-state={presentationIntent ? 'presentation' : literatureIntent ? 'literature' : busy ? 'working' : task?.status ?? 'ready'} data-literature-routing="deterministic">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-os-vermilion">{t('guide.eyebrow')}</p>
        <h2 className="mt-3 font-editorial text-3xl text-os-ink-paper">{t('guide.title')}</h2>
        <p className="mt-3 text-sm leading-6 text-os-muted-paper">{t(suggestion.bodyKey)}</p>

        {suggestion.href ? (
          <Link className="mt-5 inline-flex border-b border-os-vermilion pb-1 text-sm text-os-ink-paper" href={suggestion.href}>
            {t('guide.openContext')} →
          </Link>
        ) : null}

        {presentationIntent ? <React.Suspense fallback={<p role="status">{t('guide.working')}</p>}>
          <HermesPresentationReview intent={presentationIntent} submissionRecords={presentationSubmissions.current} routeResearchObjectId={routeResearchObjectId} researchObjects={dashboardContext.researchObjects} onBack={() => setPresentationIntent(null)} onDone={() => { setPresentationIntent(null); setGoal(''); onOpenChange(false); }} />
        </React.Suspense> : literatureIntent ? (
          <div className="mt-8 border-t border-os-rule-paper pt-5">
            <button className="mb-3 inline-flex min-h-11 items-center border-b border-os-vermilion text-sm font-semibold text-os-ink-paper focus-visible:ring-2 focus-visible:ring-focus-ring" onClick={() => setLiteratureIntent(null)} type="button">
              {t('guide.backToGuide')}
            </button>
            <LiteratureAcquisition
              initialRequest={literatureIntent.input}
              instanceId="hermes-drawer-literature"
              callerIdempotencyKey={literatureIntent.callerIdempotencyKey}
              callerIntentFingerprint={literatureIntent.callerIntentFingerprint}
              onAuthenticationRequired={() => window.location.assign(`/auth/login?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)}
              target={literatureIntent.target}
              tone="paper"
            />
          </div>
        ) : <form className="mt-8 border-t border-os-rule-paper pt-6" onSubmit={submit}>
          <button type="button" className="mb-4 min-h-11 rounded border border-os-rule-paper px-3 text-sm text-os-ink-paper disabled:opacity-50" disabled={busy} onClick={() => setPresentationIntent({ action: 'storyboard.create', instruction: goal.trim() })}>{tp('entry')}</button>
          <label className="block text-sm font-medium text-os-ink-paper" htmlFor="hermes-guide-goal">{t('guide.goalLabel')}</label>
          <textarea
            className="mt-3 min-h-28 w-full resize-y border border-os-rule-paper bg-transparent p-3 text-sm leading-6 text-os-ink-paper outline-none focus:border-os-vermilion"
            disabled={busy}
            id="hermes-guide-goal"
            maxLength={2000}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={t('guide.goalPlaceholder')}
            value={goal}
          />
          <button className="mt-3 border-b border-os-vermilion pb-1 text-sm font-semibold text-os-ink-paper disabled:opacity-50" disabled={busy || !goal.trim()} type="submit">
            {busy ? t('guide.working') : t('guide.submit')}
          </button>
        </form>}

        {!presentationIntent && !literatureIntent && activeTask ? (
          <p className="mt-4 font-mono text-xs text-os-muted-paper" aria-live="polite">{t('guide.progress', { progress: task.progress })}</p>
        ) : null}

        {!presentationIntent && !literatureIntent && (error || task?.status === 'failed' || invalidResult) ? (
          <div className="mt-5 text-sm text-os-vermilion" role="alert">
            <p>{error || task?.error || t('guide.error')}</p>
            {error && activeTask ? <button className="mt-3 border-b border-os-vermilion pb-1 text-os-ink-paper" onClick={() => setError('')} type="button">{t('guide.resume')}</button> : null}
          </div>
        ) : null}
        {!presentationIntent && !literatureIntent && result ? (
          <section className="mt-7 border-t border-os-rule-paper pt-5" aria-live="polite">
            <h3 className="text-sm font-semibold text-os-ink-paper">{t('guide.result')}</h3>
            <p className="mt-3 text-sm leading-6 text-os-muted-paper">{result.summary}</p>
            {result.needsMoreInformation ? <p className="mt-3 text-sm text-os-vermilion">{t('guide.needsMoreInformation')}</p> : null}
            <ol className="mt-5 space-y-3">
              {result.nextSteps.map((step, index) => {
                const href = actionHref(step);
                return <li className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm text-os-ink-paper" key={`${step.intent}-${index}`}><span className="font-mono text-os-vermilion">{String(index + 1).padStart(2, '0')}</span>{href ? <Link className="hover:text-os-vermilion" href={href}>{step.label} →</Link> : <span>{step.label}</span>}</li>;
              })}
            </ol>
          </section>
        ) : null}
      </section>
    </Drawer>
  );
}

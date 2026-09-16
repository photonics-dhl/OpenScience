'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { isSourceRetrieveIdentifier } from '@openscience/domain/browser-result';

import {
  ApiClientError,
  createTemporaryDocumentDownloadLink,
  getCurrentUser,
  getAgentTask,
  listSourceRetrieveTasks,
  retryAgentTask,
  submitLiteratureAcquisition,
  type AgentTaskView,
  type LiteratureAcquisitionTarget,
} from '@/lib/api';
import {
  acquirePendingLiteratureIntent,
  settlePendingLiteratureIntent,
  startLiteratureTaskPolling,
} from '@/lib/literature-acquisition-state';

export type LiteratureTask = AgentTaskView;

type LiteratureSource = {
  id?: string;
  title?: string;
  sourceUrl?: string;
  identifiers?: Record<string, unknown>;
  temporaryDocumentId?: string;
  expiresAt?: string;
};

type LiteratureTaskDescription = {
  state: 'pending' | 'running' | 'auth_required' | 'failed' | 'failed_terminal' | 'succeeded';
  messageKey: 'statusPending' | 'statusRunning' | 'statusAuthRequired' | 'statusFailed' | 'statusBlocked' | 'statusRetryExhausted' | 'statusSucceeded';
};

export const isLiteratureIdentifier = isSourceRetrieveIdentifier;

export function isLiteratureTaskRetryEligible(task: LiteratureTask): boolean {
  return task.canRetry === true;
}

function hasAuthRequiredResult(result: Record<string, unknown> | null): boolean {
  if (!result || !Array.isArray(result.providers)) return false;
  return result.providers.some((entry) => entry && typeof entry === 'object'
    && (entry as Record<string, unknown>).code === 'auth_required');
}

export function describeLiteratureTask(task: LiteratureTask): LiteratureTaskDescription {
  if (task.status === 'pending') return { state: 'pending', messageKey: 'statusPending' };
  if (task.status === 'running') return { state: 'running', messageKey: 'statusRunning' };
  if (task.status === 'failed') {
    if (task.error?.startsWith('[blocked]')) return { state: 'failed_terminal', messageKey: 'statusBlocked' };
    if (task.retryCount >= 1) return { state: 'failed_terminal', messageKey: 'statusRetryExhausted' };
    return { state: 'failed', messageKey: 'statusFailed' };
  }
  if (hasAuthRequiredResult(task.result)) return { state: 'auth_required', messageKey: 'statusAuthRequired' };
  return { state: 'succeeded', messageKey: 'statusSucceeded' };
}

function resultSources(result: Record<string, unknown> | null): LiteratureSource[] {
  if (!result || !Array.isArray(result.sources)) return [];
  return result.sources.filter((source): source is LiteratureSource => Boolean(source) && typeof source === 'object');
}

function sourceIdentifier(source: LiteratureSource): string | undefined {
  const identifiers = source.identifiers;
  if (!identifiers) return undefined;
  for (const key of ['doi', 'DOI', 'arxiv', 'arXiv']) {
    const value = identifiers[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readableExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export interface LiteratureAcquisitionProps {
  callerIdempotencyKey?: string;
  callerIntentFingerprint?: string;
  initialRequest?: { query: string; identifier?: string };
  initialTask?: LiteratureTask | null;
  instanceId?: string;
  onAuthenticationRequired: () => void;
  onTaskIdentityChange?: (taskId: string) => void;
  recoveryComplete?: boolean;
  target?: LiteratureAcquisitionTarget;
  tone?: 'paper' | 'dark';
  userId?: string;
  withinForm?: boolean;
}

export function hasExplicitLiteratureIntentIdentity(input: Pick<LiteratureAcquisitionProps, 'callerIdempotencyKey' | 'callerIntentFingerprint' | 'initialRequest'>): boolean {
  return Boolean(input.initialRequest && input.callerIdempotencyKey?.trim() && input.callerIntentFingerprint?.trim());
}

function targetNamespace(target: LiteratureAcquisitionTarget): 'personal' | `research-object:${string}` {
  return target.kind === 'personal' ? 'personal' : `research-object:${target.researchObjectId}`;
}

export interface LiteratureDisclosureState {
  scope: string;
  taskId: string | null;
  open: boolean;
}

export type LiteratureDisclosureEvent =
  | { type: 'sync_scope'; scope: string; taskId: string | null }
  | { type: 'observe_task'; scope: string; taskId: string }
  | { type: 'toggle'; open: boolean };

export interface ScopedLiteratureTaskState {
  scope: string;
  task: LiteratureTask | null;
}

export function updateScopedLiteratureTask(
  state: ScopedLiteratureTaskState,
  scope: string,
  task: LiteratureTask | null,
): ScopedLiteratureTaskState {
  return state.scope === scope ? { scope, task } : state;
}

export function createLiteratureDisclosureState(scope: string, taskId: string | null): LiteratureDisclosureState {
  return { scope, taskId, open: Boolean(taskId) };
}

export function reduceLiteratureDisclosureState(
  state: LiteratureDisclosureState,
  event: LiteratureDisclosureEvent,
): LiteratureDisclosureState {
  if (event.type === 'sync_scope') {
    return event.scope === state.scope
      ? state
      : createLiteratureDisclosureState(event.scope, event.taskId);
  }
  if (event.type === 'toggle') return { ...state, open: event.open };
  if (event.scope !== state.scope || event.taskId === state.taskId) return state;
  return { ...state, taskId: event.taskId, open: true };
}

export function LiteratureAcquisition({
  callerIdempotencyKey,
  callerIntentFingerprint,
  initialRequest,
  initialTask = null,
  instanceId = 'literature',
  onAuthenticationRequired,
  onTaskIdentityChange,
  recoveryComplete,
  target = { kind: 'personal' },
  tone = 'paper',
  userId,
  withinForm = false,
}: LiteratureAcquisitionProps) {
  const t = useTranslations('dashboard.literature');
  const explicitInitialIdentity = hasExplicitLiteratureIntentIdentity({ callerIdempotencyKey, callerIntentFingerprint, initialRequest });
  const [resolvedUserId, setResolvedUserId] = React.useState(userId ?? '');
  const namespace = targetNamespace(target);
  const effectiveUserId = userId || resolvedUserId;
  const scope = `${effectiveUserId || 'pending-user'}:${namespace}`;
  const [query, setQuery] = React.useState(initialRequest?.query ?? '');
  const [taskState, setTaskState] = React.useState<ScopedLiteratureTaskState>({ scope, task: initialTask });
  const [error, setError] = React.useState('');
  const [reconnecting, setReconnecting] = React.useState(false);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [submissionPending, setSubmissionPending] = React.useState(false);
  const [retryPending, setRetryPending] = React.useState(false);
  const [internalRecoveryComplete, setInternalRecoveryComplete] = React.useState(recoveryComplete !== undefined || explicitInitialIdentity);
  const submitting = React.useRef<{ scope: string } | null>(null);
  const retrying = React.useRef<{ scope: string } | null>(null);
  const initialRequestSubmitted = React.useRef('');
  const reportedTaskIdentity = React.useRef(initialTask ? initialTask.id : '');
  const authenticationRequired = React.useRef(onAuthenticationRequired);
  authenticationRequired.current = onAuthenticationRequired;
  const activeInstance = React.useRef(true);
  const currentScope = React.useRef(scope);
  currentScope.current = scope;
  const task = taskState.scope === scope ? taskState.task : null;
  const recoveryReady = recoveryComplete ?? internalRecoveryComplete;
  const queryId = `${instanceId}-query`;
  const dark = tone === 'dark';
  const rule = dark ? 'border-os-rule-dark' : 'border-os-rule-paper';
  const ink = dark ? 'text-os-paper' : 'text-os-ink';
  const muted = dark ? 'text-os-muted-dark' : 'text-os-muted-paper';
  const accent = dark ? 'text-os-vermilion' : 'text-os-vermilion-ink';
  const researchObjectTarget = target.kind === 'research_object';

  const description = task ? describeLiteratureTask(task) : null;
  const active = description?.state === 'pending' || description?.state === 'running';
  const sources = resultSources(task?.result ?? null);
  const setScopedTask = React.useCallback((nextTask: LiteratureTask | null, expectedScope: string) => {
    if (!activeInstance.current || currentScope.current !== expectedScope) return;
    setTaskState((current) => updateScopedLiteratureTask(current, expectedScope, nextTask));
    if (!nextTask) return;
    const identity = `${expectedScope}:${nextTask.id}`;
    if (reportedTaskIdentity.current === identity) return;
    reportedTaskIdentity.current = identity;
    onTaskIdentityChange?.(nextTask.id);
  }, [onTaskIdentityChange]);
  const handlePermanentTaskError = React.useCallback((status: number, expectedScope: string) => {
    if (!activeInstance.current || currentScope.current !== expectedScope) return;
    if (status === 401) {
      authenticationRequired.current();
      return;
    }
    setTaskState({ scope: expectedScope, task: null });
    setReconnecting(false);
    setError(t('recoveryError'));
  }, [t]);

  React.useEffect(() => {
    activeInstance.current = true;
    return () => { activeInstance.current = false; };
  }, []);

  React.useEffect(() => {
    if (userId) {
      setResolvedUserId(userId);
      return undefined;
    }
    let active = true;
    setResolvedUserId('');
    void getCurrentUser()
      .then((current) => { if (active) setResolvedUserId(current.userId); })
      .catch(() => { if (active) authenticationRequired.current(); });
    return () => { active = false; };
  }, [userId]);

  React.useEffect(() => {
    setTaskState({ scope, task: initialTask });
    setQuery(initialRequest?.query ?? '');
    setError('');
    setReconnecting(false);
    setDownloading(null);
    setSubmissionPending(false);
    setRetryPending(false);
    setInternalRecoveryComplete(recoveryComplete !== undefined || explicitInitialIdentity);
    reportedTaskIdentity.current = initialTask ? `${scope}:${initialTask.id}` : '';
  }, [scope]);

  React.useEffect(() => {
    if (recoveryComplete === undefined || !recoveryReady || !effectiveUserId) return;
    setScopedTask(initialTask, scope);
    if (initialTask && typeof window !== 'undefined') {
      settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, { kind: 'recovered' });
    }
  }, [effectiveUserId, initialTask, namespace, recoveryComplete, recoveryReady, scope, setScopedTask]);

  React.useEffect(() => {
    if (recoveryComplete !== undefined || explicitInitialIdentity || !effectiveUserId) return;
    let cancelled = false;
    setInternalRecoveryComplete(false);
    setScopedTask(null, scope);
    const recoveryTarget: LiteratureAcquisitionTarget = target.kind === 'personal'
      ? { kind: 'personal' }
      : { kind: 'research_object', researchObjectId: target.researchObjectId };
    void listSourceRetrieveTasks(recoveryTarget)
      .then(({ tasks }) => {
        if (cancelled || !activeInstance.current || currentScope.current !== scope) return;
        const recovered = tasks[0] ?? null;
        setScopedTask(recovered, scope);
        if (recovered && typeof window !== 'undefined') {
          settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, { kind: 'recovered' });
        }
      })
      .catch((cause) => {
        if (cancelled || !activeInstance.current || currentScope.current !== scope) return;
        if (cause instanceof ApiClientError && cause.status === 401) authenticationRequired.current();
        else setError(t('recoveryError'));
      })
      .finally(() => {
        if (!cancelled && activeInstance.current && currentScope.current === scope) setInternalRecoveryComplete(true);
      });
    return () => { cancelled = true; };
  }, [effectiveUserId, explicitInitialIdentity, namespace, recoveryComplete, scope, setScopedTask, t, target.kind, target.kind === 'research_object' ? target.researchObjectId : null]);

  React.useEffect(() => {
    if (!task || !active) return undefined;
    const pollingScope = scope;
    return startLiteratureTaskPolling<AgentTaskView>({
      taskId: task.id,
      getTask: async (taskId, signal) => (await getAgentTask('', taskId, signal)).task,
      onTask: (nextTask) => setScopedTask(nextTask, pollingScope),
      onReconnecting: (next) => { if (activeInstance.current && currentScope.current === pollingScope) setReconnecting(next); },
      onPermanentError: (status) => handlePermanentTaskError(status, pollingScope),
    });
  }, [active, handlePermanentTaskError, scope, setScopedTask, task?.id]);

  const submit = React.useCallback(async (input: { query: string; identifier?: string }, useCallerIdentity = false) => {
    const operation = { scope };
    if (submitting.current?.scope === scope || retrying.current?.scope === scope) return;
    if (typeof window === 'undefined' || !effectiveUserId || !recoveryReady) return;
    submitting.current = operation;
    setSubmissionPending(true);
    setError('');
    try {
      const pendingIntent = await acquirePendingLiteratureIntent(
        window.sessionStorage,
        {
          userId: effectiveUserId,
          target: namespace,
          input,
          ...(useCallerIdentity && callerIntentFingerprint ? { intentFingerprint: callerIntentFingerprint } : {}),
        },
        () => useCallerIdentity && callerIdempotencyKey ? callerIdempotencyKey : crypto.randomUUID(),
      );
      if (pendingIntent.status === 'blocked') {
        if (activeInstance.current && currentScope.current === scope) setError(t('pendingIntent'));
        return;
      }
      if (!activeInstance.current || currentScope.current !== scope) return;
      const acquisition = await submitLiteratureAcquisition(input, pendingIntent.key, target);
      setScopedTask(acquisition.task, scope);
      settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, { kind: 'accepted' });
    } catch (cause) {
      settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, {
        kind: 'failure', ...(cause instanceof ApiClientError ? { status: cause.status } : {}),
      });
      if (activeInstance.current && currentScope.current === scope) setError(t('error'));
    } finally {
      if (submitting.current === operation) submitting.current = null;
      if (activeInstance.current && currentScope.current === scope) setSubmissionPending(false);
    }
  }, [callerIdempotencyKey, callerIntentFingerprint, effectiveUserId, namespace, recoveryReady, scope, setScopedTask, t, target]);

  React.useEffect(() => {
    if (!initialRequest || !recoveryReady || !effectiveUserId || active) return;
    const intentIdentity = `${scope}:${callerIdempotencyKey ?? ''}:${callerIntentFingerprint ?? ''}:${initialRequest.query}:${initialRequest.identifier ?? ''}`;
    if (initialRequestSubmitted.current === intentIdentity) return;
    initialRequestSubmitted.current = intentIdentity;
    void submit(initialRequest, true);
  }, [active, callerIdempotencyKey, callerIntentFingerprint, effectiveUserId, initialRequest, recoveryReady, scope, submit]);

  function submitCurrentQuery() {
    const normalized = query.trim();
    if (!normalized) return;
    void submit({ query: normalized, ...(isLiteratureIdentifier(normalized) ? { identifier: normalized } : {}) });
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCurrentQuery();
  }

  function onEmbeddedKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLInputElement) || !shouldSubmitEmbeddedLiteratureQuery({
      key: event.key,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
    })) return;
    event.preventDefault();
    submitCurrentQuery();
  }

  async function retry() {
    if (!task || retrying.current?.scope === scope || submitting.current?.scope === scope || !isLiteratureTaskRetryEligible(task)) return;
    const operation = { scope };
    retrying.current = operation;
    setRetryPending(true);
    setError('');
    try {
      const next = await retryAgentTask(task.id);
      setScopedTask(next.task, scope);
    } catch (cause) {
      const status = cause instanceof ApiClientError ? cause.status : undefined;
      const reconcile = status === undefined || status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
      if (!reconcile) {
        if (status === 401 || status === 403 || status === 404) handlePermanentTaskError(status, scope);
        else if (activeInstance.current && currentScope.current === scope) setError(t('error'));
        return;
      }
      try {
        const authoritative = await getAgentTask('', task.id);
        setScopedTask(authoritative.task, scope);
      } catch (recoveryCause) {
        const recoveryStatus = recoveryCause instanceof ApiClientError ? recoveryCause.status : undefined;
        if (recoveryStatus === 401 || recoveryStatus === 403 || recoveryStatus === 404) handlePermanentTaskError(recoveryStatus, scope);
        else if (activeInstance.current && currentScope.current === scope) setError(t('error'));
      }
    } finally {
      if (retrying.current === operation) retrying.current = null;
      if (activeInstance.current && currentScope.current === scope) setRetryPending(false);
    }
  }

  async function download(documentId: string) {
    const downloadScope = scope;
    setDownloading(documentId);
    setError('');
    try {
      const link = await createTemporaryDocumentDownloadLink(documentId);
      if (!activeInstance.current || currentScope.current !== downloadScope) return;
      window.location.assign(link.downloadUrl);
    } catch {
      if (activeInstance.current && currentScope.current === downloadScope) setError(t('error'));
    } finally {
      if (activeInstance.current && currentScope.current === downloadScope) setDownloading(null);
    }
  }

  const searchControls = <>
    <div>
      <label className={`block text-sm font-semibold ${ink}`} htmlFor={queryId}>{t('queryLabel')}</label>
      <input
        className={`mt-2 min-h-11 w-full border ${rule} bg-transparent px-3 text-base ${ink} outline-none transition-transform duration-150 focus:border-current focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`}
        disabled={active || submissionPending || !recoveryReady || !effectiveUserId}
        id={queryId}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('queryPlaceholder')}
        value={query}
      />
    </div>
    <button className={`min-h-11 border px-4 text-sm font-semibold ${dark ? 'border-os-paper text-os-paper' : 'border-os-ink text-os-ink'} transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`} disabled={active || submissionPending || !recoveryReady || !effectiveUserId || !query.trim()} onClick={withinForm ? submitCurrentQuery : undefined} type={withinForm ? 'button' : 'submit'}>
      {t('search')}
    </button>
  </>;

  return (
    <section className={`border-y ${rule} py-6`} data-literature-acquisition="true" data-literature-target={namespace} data-literature-tone={tone}>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p data-reading-role="caption" className={`font-mono text-[0.68rem] uppercase tracking-[0.16em] ${accent}`}>{t(researchObjectTarget ? 'roEyebrow' : 'eyebrow')}</p>
          <h2 className={`mt-2 font-editorial text-2xl ${ink}`}>{t(researchObjectTarget ? 'roTitle' : 'title')}</h2>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${muted}`}>{t(researchObjectTarget ? 'roDescription' : 'description')}</p>
        </div>
      </div>
      {withinForm
        ? <div className={`mt-5 grid gap-3 border-t ${rule} pt-5 sm:grid-cols-[minmax(0,1fr)_auto]`} onKeyDown={onEmbeddedKeyDown}>{searchControls}</div>
        : <form className={`mt-5 grid gap-3 border-t ${rule} pt-5 sm:grid-cols-[minmax(0,1fr)_auto]`} onSubmit={onSearch}>{searchControls}</form>}

      <div aria-atomic="true" aria-live="polite" className={`mt-4 min-h-6 text-sm ${muted}`} data-literature-state={description?.state ?? 'idle'}>
        {description ? t(description.messageKey) : null}
        {reconnecting ? <span className="ml-2">{t('reconnecting')}</span> : null}
        {error ? <span className="text-state-danger">{error}</span> : null}
      </div>

      {task && isLiteratureTaskRetryEligible(task) ? (
        <button aria-busy={retryPending} className={`mt-2 min-h-11 border-b border-os-vermilion text-sm font-semibold ${ink} transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`} disabled={submissionPending || retryPending} onClick={() => void retry()} type="button">
          {t('retry')}
        </button>
      ) : null}

      {sources.length > 0 ? (
        <section className={`mt-5 border-t ${rule} pt-5`} aria-label={t('metadata')}>
          <h3 className={`font-mono text-[0.68rem] uppercase tracking-[0.16em] ${muted}`}>{t('metadata')}</h3>
          <ol className={`mt-3 divide-y ${dark ? 'divide-os-rule-dark' : 'divide-os-rule-paper'}`}>
            {sources.map((source, index) => {
              const identifier = sourceIdentifier(source);
              return (
                <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={source.id ?? `${source.title ?? 'source'}-${index}`}>
                  <div>
                    <p className={`font-reading text-lg leading-7 ${ink}`}>{source.title ?? t('untitled')}</p>
                    {source.sourceUrl ? submissionPending
                      ? <span aria-disabled="true" className={`mt-1 inline-flex min-h-11 min-w-11 items-center text-sm ${muted} opacity-60`}>{t('source')}</span>
                      : <a className={`mt-1 inline-flex min-h-11 min-w-11 items-center text-sm ${muted} underline decoration-current underline-offset-4 focus-visible:ring-2 focus-visible:ring-focus-ring`} href={source.sourceUrl}>{t('source')}</a>
                      : null}
                    {source.expiresAt ? <p className={`mt-2 font-mono text-xs ${muted}`}>{t('expires', { expiresAt: readableExpiry(source.expiresAt) })}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {identifier ? <button className={`min-h-11 min-w-11 border-b border-os-vermilion px-1 text-sm font-semibold ${ink} transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`} disabled={active || submissionPending || !recoveryReady || !effectiveUserId} onClick={() => void submit({ query: source.title ?? query, identifier })} type="button">{t('getFullText')}</button> : null}
                    {source.temporaryDocumentId ? <button className={`min-h-11 border px-3 text-sm font-semibold ${dark ? 'border-os-paper text-os-paper' : 'border-os-ink text-os-ink'} transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`} disabled={submissionPending || downloading === source.temporaryDocumentId} onClick={() => void download(source.temporaryDocumentId!)} type="button">{t('download')}</button> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : task && description?.state === 'succeeded' ? <p className={`mt-5 border-t ${rule} pt-5 text-sm ${muted}`}>{t('noResults')}</p> : null}
    </section>
  );
}

export function shouldSubmitEmbeddedLiteratureQuery(event: { key: string; isComposing: boolean; keyCode: number }): boolean {
  return event.key === 'Enter' && !event.isComposing && event.keyCode !== 229;
}

export function LiteratureAcquisitionDisclosure(props: LiteratureAcquisitionProps) {
  const t = useTranslations('dashboard.literature');
  const dark = props.tone === 'dark';
  const scope = `${props.userId?.trim() || 'session-user'}:${targetNamespace(props.target ?? { kind: 'personal' })}`;
  const [state, dispatch] = React.useReducer(
    reduceLiteratureDisclosureState,
    createLiteratureDisclosureState(scope, props.initialTask?.id ?? null),
  );
  const visibleState = state.scope === scope
    ? state
    : createLiteratureDisclosureState(scope, props.initialTask?.id ?? null);
  React.useEffect(() => {
    dispatch({ type: 'sync_scope', scope, taskId: props.initialTask?.id ?? null });
  }, [scope]);
  React.useEffect(() => {
    if (props.initialTask) dispatch({ type: 'observe_task', scope, taskId: props.initialTask.id });
  }, [props.initialTask?.id, scope]);
  const observeTaskIdentity = React.useCallback((taskId: string) => {
    dispatch({ type: 'observe_task', scope, taskId });
    props.onTaskIdentityChange?.(taskId);
  }, [props.onTaskIdentityChange, scope]);
  return (
    <details
      className={`border-y ${dark ? 'border-os-rule-dark' : 'border-os-rule-paper'}`}
      data-literature-entry="true"
      onToggle={(event) => dispatch({ type: 'toggle', open: event.currentTarget.open })}
      open={visibleState.open}
    >
      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-focus-ring ${dark ? 'text-os-paper' : 'text-os-ink'}`}>
        {t('disclosure')}
        <span aria-hidden="true" className={dark ? 'text-os-vermilion' : 'text-os-vermilion-ink'}>＋</span>
      </summary>
      <LiteratureAcquisition {...props} onTaskIdentityChange={observeTaskIdentity} />
    </details>
  );
}

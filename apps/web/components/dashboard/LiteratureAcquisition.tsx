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

export interface LiteratureRecoveryState {
  scope: string;
  generation: number;
  task: LiteratureTask | null;
  origin: 'recovery' | 'task';
  status: 'pending' | 'resolved' | 'failed';
}

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
  onRecoveryStateChange?: (state: LiteratureRecoveryState) => void;
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

export function LiteratureAcquisition({
  callerIdempotencyKey,
  callerIntentFingerprint,
  initialRequest,
  initialTask = null,
  instanceId = 'literature',
  onAuthenticationRequired,
  onRecoveryStateChange,
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
  const effectiveUserId = userId ?? resolvedUserId;
  const scopeKey = `${effectiveUserId}:${namespace}`;
  const [query, setQuery] = React.useState(initialRequest?.query ?? '');
  const [taskState, setTaskState] = React.useState({ scope: scopeKey, task: initialTask as LiteratureTask | null });
  const [error, setError] = React.useState('');
  const [reconnecting, setReconnecting] = React.useState(false);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [submissionPending, setSubmissionPending] = React.useState(false);
  const [retryPending, setRetryPending] = React.useState(false);
  const [internalRecovery, setInternalRecovery] = React.useState({
    scope: scopeKey,
    complete: recoveryComplete !== undefined || explicitInitialIdentity,
  });
  const submitting = React.useRef(false);
  const retrying = React.useRef(false);
  const submissionToken = React.useRef(0);
  const retryToken = React.useRef(0);
  const initialRequestSubmitted = React.useRef('');
  const recoveryNamespaceStarted = React.useRef('');
  const scope = React.useRef({ key: '', generation: 0 });
  const mounted = React.useRef(true);
  const authenticationRequired = React.useRef(onAuthenticationRequired);
  authenticationRequired.current = onAuthenticationRequired;
  if (scope.current.key !== scopeKey) scope.current = { key: scopeKey, generation: scope.current.generation + 1 };
  const isCurrentScope = React.useCallback((key: string, generation: number) => mounted.current && scope.current.key === key && scope.current.generation === generation, []);
  const setScopedTask = React.useCallback((next: LiteratureTask | null, key: string, generation: number) => {
    if (!isCurrentScope(key, generation)) return;
    setTaskState({ scope: key, task: next });
  }, [isCurrentScope]);
  const task = taskState.scope === scopeKey ? taskState.task : null;
  const recoveryReady = recoveryComplete
    ?? (explicitInitialIdentity || (internalRecovery.scope === scopeKey && internalRecovery.complete));
  const queryId = `${instanceId}-query`;
  const dark = tone === 'dark';
  const rule = dark ? 'border-os-rule-dark' : 'border-os-rule-paper';
  const ink = dark ? 'text-os-paper' : 'text-os-ink';
  const muted = dark ? 'text-os-muted-dark' : 'text-os-muted-paper';
  const accent = dark ? 'text-os-vermilion' : 'text-os-vermilion-ink';
  const researchObjectTarget = target.kind === 'research_object';

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  React.useEffect(() => {
    const current = { ...scope.current };
    submitting.current = false;
    retrying.current = false;
    submissionToken.current += 1;
    retryToken.current += 1;
    setSubmissionPending(false);
    setRetryPending(false);
    setDownloading(null);
    setReconnecting(false);
    setError('');
    setTaskState((state) => state.scope === current.key ? state : { scope: current.key, task: null });
    setInternalRecovery({
      scope: current.key,
      complete: recoveryComplete !== undefined || explicitInitialIdentity,
    });
  }, [explicitInitialIdentity, recoveryComplete, scopeKey]);

  const description = task ? describeLiteratureTask(task) : null;
  const active = description?.state === 'pending' || description?.state === 'running';
  const sources = resultSources(task?.result ?? null);
  const handlePermanentTaskError = React.useCallback((status: number, key: string, generation: number) => {
    if (!isCurrentScope(key, generation)) return;
    if (status === 401) {
      authenticationRequired.current();
      return;
    }
    setScopedTask(null, key, generation);
    setReconnecting(false);
    setError(t('recoveryError'));
  }, [isCurrentScope, setScopedTask, t]);

  React.useEffect(() => {
    if (userId) {
      setResolvedUserId(userId);
      return undefined;
    }
    let disposed = false;
    setResolvedUserId('');
    void getCurrentUser()
      .then((current) => { if (!disposed && mounted.current) setResolvedUserId(current.userId); })
      .catch(() => { if (!disposed && mounted.current) authenticationRequired.current(); });
    return () => { disposed = true; };
  }, [userId]);

  React.useEffect(() => {
    if (recoveryComplete === undefined || !recoveryReady || !effectiveUserId) return;
    const generation = scope.current.generation;
    setScopedTask(initialTask, scopeKey, generation);
    onRecoveryStateChange?.({ scope: scopeKey, generation, task: initialTask, origin: 'recovery', status: 'resolved' });
    if (initialTask && typeof window !== 'undefined') {
      settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, { kind: 'recovered' });
    }
  }, [effectiveUserId, initialTask, namespace, onRecoveryStateChange, recoveryComplete, recoveryReady, scopeKey, setScopedTask]);

  React.useEffect(() => {
    if (recoveryComplete !== undefined || explicitInitialIdentity || !effectiveUserId) return;
    const recoveryKey = scopeKey;
    const generation = scope.current.generation;
    const requestKey = `${recoveryKey}:${generation}`;
    if (recoveryNamespaceStarted.current === requestKey) return;
    recoveryNamespaceStarted.current = requestKey;
    let disposed = false;
    setInternalRecovery({ scope: recoveryKey, complete: false });
    setScopedTask(null, recoveryKey, generation);
    onRecoveryStateChange?.({ scope: recoveryKey, generation, task: null, origin: 'recovery', status: 'pending' });
    const recoveryTarget: LiteratureAcquisitionTarget = target.kind === 'personal'
      ? { kind: 'personal' }
      : { kind: 'research_object', researchObjectId: target.researchObjectId };
    void listSourceRetrieveTasks(recoveryTarget)
      .then(({ tasks }) => {
        if (disposed || !isCurrentScope(recoveryKey, generation)) return;
        const recovered = tasks[0] ?? null;
        setScopedTask(recovered, recoveryKey, generation);
        onRecoveryStateChange?.({ scope: recoveryKey, generation, task: recovered, origin: 'recovery', status: 'resolved' });
        if (recovered && typeof window !== 'undefined') {
          settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, { kind: 'recovered' });
        }
      })
      .catch((cause) => {
        if (disposed || !isCurrentScope(recoveryKey, generation)) return;
        if (cause instanceof ApiClientError && cause.status === 401) authenticationRequired.current();
        else {
          setError(t('recoveryError'));
          onRecoveryStateChange?.({ scope: recoveryKey, generation, task: null, origin: 'recovery', status: 'failed' });
        }
      })
      .finally(() => {
        if (!disposed && isCurrentScope(recoveryKey, generation)) setInternalRecovery({ scope: recoveryKey, complete: true });
      });
    return () => {
      disposed = true;
      if (recoveryNamespaceStarted.current === requestKey) recoveryNamespaceStarted.current = '';
    };
  }, [effectiveUserId, explicitInitialIdentity, isCurrentScope, namespace, onRecoveryStateChange, recoveryComplete, scopeKey, setScopedTask, t, target.kind, target.kind === 'research_object' ? target.researchObjectId : null]);

  React.useEffect(() => {
    if (!task || !active) return undefined;
    const operation = { ...scope.current };
    return startLiteratureTaskPolling<AgentTaskView>({
      taskId: task.id,
      getTask: async (taskId, signal) => (await getAgentTask('', taskId, signal)).task,
      onTask: (next) => {
        if (!isCurrentScope(operation.key, operation.generation)) return;
        setScopedTask(next, operation.key, operation.generation);
        onRecoveryStateChange?.({ scope: operation.key, generation: operation.generation, task: next, origin: 'task', status: 'resolved' });
      },
      onReconnecting: (next) => { if (isCurrentScope(operation.key, operation.generation)) setReconnecting(next); },
      onPermanentError: (status) => handlePermanentTaskError(status, operation.key, operation.generation),
    });
  }, [active, handlePermanentTaskError, isCurrentScope, onRecoveryStateChange, setScopedTask, task?.id]);

  const submit = React.useCallback(async (input: { query: string; identifier?: string }, useCallerIdentity = false) => {
    if (submitting.current || retrying.current) return;
    if (typeof window === 'undefined' || !effectiveUserId || !recoveryReady) return;
    const operation = { ...scope.current };
    const token = submissionToken.current + 1;
    submissionToken.current = token;
    submitting.current = true;
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
        if (isCurrentScope(operation.key, operation.generation)) setError(t('pendingIntent'));
        return;
      }
      if (!isCurrentScope(operation.key, operation.generation)) return;
      const acquisition = await submitLiteratureAcquisition(input, pendingIntent.key, target);
      settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, { kind: 'accepted' });
      if (!isCurrentScope(operation.key, operation.generation)) return;
      setScopedTask(acquisition.task, operation.key, operation.generation);
      onRecoveryStateChange?.({ scope: operation.key, generation: operation.generation, task: acquisition.task, origin: 'task', status: 'resolved' });
    } catch (cause) {
      settlePendingLiteratureIntent(window.sessionStorage, { userId: effectiveUserId, target: namespace }, {
        kind: 'failure', ...(cause instanceof ApiClientError ? { status: cause.status } : {}),
      });
      if (isCurrentScope(operation.key, operation.generation)) setError(t('error'));
    } finally {
      if (submissionToken.current === token) {
        submitting.current = false;
        if (isCurrentScope(operation.key, operation.generation)) setSubmissionPending(false);
      }
    }
  }, [callerIdempotencyKey, callerIntentFingerprint, effectiveUserId, isCurrentScope, namespace, onRecoveryStateChange, recoveryReady, setScopedTask, t, target]);

  React.useEffect(() => {
    if (!initialRequest || !recoveryReady || !effectiveUserId || active) return;
    const identity = `${scopeKey}:${callerIdempotencyKey ?? ''}:${callerIntentFingerprint ?? ''}:${initialRequest.query}:${initialRequest.identifier ?? ''}`;
    if (initialRequestSubmitted.current === identity) return;
    initialRequestSubmitted.current = identity;
    void submit(initialRequest, true);
  }, [active, callerIdempotencyKey, callerIntentFingerprint, effectiveUserId, initialRequest, recoveryReady, scopeKey, submit]);

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
    if (!task || retrying.current || submitting.current || !isLiteratureTaskRetryEligible(task)) return;
    const operation = { ...scope.current };
    const token = retryToken.current + 1;
    retryToken.current = token;
    retrying.current = true;
    setRetryPending(true);
    setError('');
    try {
      const next = await retryAgentTask(task.id);
      if (!isCurrentScope(operation.key, operation.generation)) return;
      setScopedTask(next.task, operation.key, operation.generation);
      onRecoveryStateChange?.({ scope: operation.key, generation: operation.generation, task: next.task, origin: 'task', status: 'resolved' });
    } catch (cause) {
      const status = cause instanceof ApiClientError ? cause.status : undefined;
      const reconcile = status === undefined || status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
      if (!reconcile) {
        if (status === 401 || status === 403 || status === 404) handlePermanentTaskError(status, operation.key, operation.generation);
        else if (isCurrentScope(operation.key, operation.generation)) setError(t('error'));
        return;
      }
      try {
        const authoritative = await getAgentTask('', task.id);
        if (!isCurrentScope(operation.key, operation.generation)) return;
        setScopedTask(authoritative.task, operation.key, operation.generation);
        onRecoveryStateChange?.({ scope: operation.key, generation: operation.generation, task: authoritative.task, origin: 'task', status: 'resolved' });
      } catch (recoveryCause) {
        const recoveryStatus = recoveryCause instanceof ApiClientError ? recoveryCause.status : undefined;
        if (recoveryStatus === 401 || recoveryStatus === 403 || recoveryStatus === 404) handlePermanentTaskError(recoveryStatus, operation.key, operation.generation);
        else if (isCurrentScope(operation.key, operation.generation)) setError(t('error'));
      }
    } finally {
      if (retryToken.current === token) {
        retrying.current = false;
        if (isCurrentScope(operation.key, operation.generation)) setRetryPending(false);
      }
    }
  }

  async function download(documentId: string) {
    const operation = { ...scope.current };
    setDownloading(documentId);
    setError('');
    try {
      const link = await createTemporaryDocumentDownloadLink(documentId);
      if (!isCurrentScope(operation.key, operation.generation)) return;
      window.location.assign(link.downloadUrl);
    } catch {
      if (isCurrentScope(operation.key, operation.generation)) setError(t('error'));
    } finally {
      if (isCurrentScope(operation.key, operation.generation)) setDownloading(null);
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
  const [open, setOpen] = React.useState(Boolean(props.initialTask));
  const recovery = React.useRef<{ scope: string; generation: number; seenTaskId: string | null; manuallyClosed: boolean } | null>(null);
  const onRecoveryStateChange = React.useCallback((next: LiteratureRecoveryState) => {
    const current = recovery.current;
    const scopeChanged = !current || current.scope !== next.scope || current.generation !== next.generation;
    if (scopeChanged) {
      recovery.current = { scope: next.scope, generation: next.generation, seenTaskId: null, manuallyClosed: false };
    }
    const state = recovery.current!;
    if (next.status === 'failed') {
      if (!state.manuallyClosed) setOpen(true);
      return;
    }
    if (!next.task) {
      if (scopeChanged) setOpen(false);
      return;
    }
    if (state.seenTaskId !== next.task.id) {
      state.seenTaskId = next.task.id;
      if (next.origin === 'task') {
        state.manuallyClosed = false;
        setOpen(true);
      } else if (!state.manuallyClosed) {
        setOpen(true);
      }
    }
  }, []);
  const toggle = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setOpen((wasOpen) => {
      if (wasOpen && recovery.current) recovery.current.manuallyClosed = true;
      return !wasOpen;
    });
  }, []);
  return (
    <details className={`border-y ${dark ? 'border-os-rule-dark' : 'border-os-rule-paper'}`} data-literature-entry="true" open={open}>
      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-focus-ring ${dark ? 'text-os-paper' : 'text-os-ink'}`} onClick={toggle}>
        {t('disclosure')}
        <span aria-hidden="true" className={dark ? 'text-os-vermilion' : 'text-os-vermilion-ink'}>＋</span>
      </summary>
      <LiteratureAcquisition {...props} onRecoveryStateChange={onRecoveryStateChange} />
    </details>
  );
}

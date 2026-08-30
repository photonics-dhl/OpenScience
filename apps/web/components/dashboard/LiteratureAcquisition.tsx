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

export function selectLiteratureRecoveryTask(
  tasks: LiteratureTask[],
  target: LiteratureAcquisitionTarget,
): LiteratureTask | null {
  const sourceTasks = tasks.filter((task) => task.kind === 'source.retrieve');
  if (target.kind === 'personal') return sourceTasks[0] ?? null;
  return sourceTasks.find((task) => task.researchObjectId === target.researchObjectId) ?? null;
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
  initialRequest?: { query: string; identifier?: string };
  initialTask?: LiteratureTask | null;
  instanceId?: string;
  onAuthenticationRequired: () => void;
  recoveryComplete?: boolean;
  target?: LiteratureAcquisitionTarget;
  tone?: 'paper' | 'dark';
  userId?: string;
  withinForm?: boolean;
}

function targetNamespace(target: LiteratureAcquisitionTarget): 'personal' | `research-object:${string}` {
  return target.kind === 'personal' ? 'personal' : `research-object:${target.researchObjectId}`;
}

export function LiteratureAcquisition({
  initialRequest,
  initialTask = null,
  instanceId = 'literature',
  onAuthenticationRequired,
  recoveryComplete,
  target = { kind: 'personal' },
  tone = 'paper',
  userId,
  withinForm = false,
}: LiteratureAcquisitionProps) {
  const t = useTranslations('dashboard.literature');
  const [query, setQuery] = React.useState(initialRequest?.query ?? '');
  const [task, setTask] = React.useState<LiteratureTask | null>(initialTask);
  const [error, setError] = React.useState('');
  const [reconnecting, setReconnecting] = React.useState(false);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [submissionPending, setSubmissionPending] = React.useState(false);
  const [retryPending, setRetryPending] = React.useState(false);
  const [resolvedUserId, setResolvedUserId] = React.useState(userId ?? '');
  const [internalRecoveryComplete, setInternalRecoveryComplete] = React.useState(recoveryComplete !== undefined);
  const submitting = React.useRef(false);
  const retrying = React.useRef(false);
  const userResolutionStarted = React.useRef(false);
  const initialRequestSubmitted = React.useRef(false);
  const recoveryNamespaceStarted = React.useRef('');
  const namespace = targetNamespace(target);
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
  const handlePermanentTaskError = React.useCallback((status: number) => {
    if (status === 401) {
      onAuthenticationRequired();
      return;
    }
    setTask(null);
    setReconnecting(false);
    setError(t('recoveryError'));
  }, [onAuthenticationRequired, t]);

  React.useEffect(() => {
    if (userId) {
      setResolvedUserId(userId);
      return;
    }
    if (userResolutionStarted.current) return;
    userResolutionStarted.current = true;
    void getCurrentUser()
      .then((current) => setResolvedUserId(current.userId))
      .catch(() => onAuthenticationRequired());
  }, [onAuthenticationRequired, userId]);

  React.useEffect(() => {
    if (recoveryComplete === undefined || !recoveryReady || !resolvedUserId) return;
    setTask(initialTask);
    if (initialTask && typeof window !== 'undefined') {
      settlePendingLiteratureIntent(window.sessionStorage, { userId: resolvedUserId, target: namespace }, { kind: 'recovered' });
    }
  }, [initialTask, namespace, recoveryComplete, recoveryReady, resolvedUserId]);

  React.useEffect(() => {
    if (recoveryComplete !== undefined || !resolvedUserId) return;
    const recoveryKey = `${resolvedUserId}:${namespace}`;
    if (recoveryNamespaceStarted.current === recoveryKey) return;
    recoveryNamespaceStarted.current = recoveryKey;
    setInternalRecoveryComplete(false);
    setTask(null);
    const recoveryTarget: LiteratureAcquisitionTarget = target.kind === 'personal'
      ? { kind: 'personal' }
      : { kind: 'research_object', researchObjectId: target.researchObjectId };
    void listSourceRetrieveTasks()
      .then(({ tasks }) => {
        if (recoveryNamespaceStarted.current !== recoveryKey) return;
        const recovered = selectLiteratureRecoveryTask(tasks, recoveryTarget);
        setTask(recovered);
        if (initialRequest && (recovered?.status === 'pending' || recovered?.status === 'running')) {
          initialRequestSubmitted.current = true;
        }
        if (recovered && typeof window !== 'undefined') {
          settlePendingLiteratureIntent(window.sessionStorage, { userId: resolvedUserId, target: namespace }, { kind: 'recovered' });
        }
      })
      .catch((cause) => {
        if (recoveryNamespaceStarted.current !== recoveryKey) return;
        if (cause instanceof ApiClientError && cause.status === 401) onAuthenticationRequired();
        else setError(t('recoveryError'));
      })
      .finally(() => {
        if (recoveryNamespaceStarted.current === recoveryKey) setInternalRecoveryComplete(true);
      });
  }, [initialRequest, namespace, onAuthenticationRequired, recoveryComplete, resolvedUserId, t, target.kind, target.kind === 'research_object' ? target.researchObjectId : null]);

  React.useEffect(() => {
    if (!task || !active) return undefined;
    return startLiteratureTaskPolling<AgentTaskView>({
      taskId: task.id,
      getTask: async (taskId, signal) => (await getAgentTask('', taskId, signal)).task,
      onTask: setTask,
      onReconnecting: setReconnecting,
      onPermanentError: handlePermanentTaskError,
    });
  }, [active, handlePermanentTaskError, task?.id]);

  const submit = React.useCallback(async (input: { query: string; identifier?: string }) => {
    if (submitting.current) return;
    if (typeof window === 'undefined' || !resolvedUserId || !recoveryReady) return;
    submitting.current = true;
    setSubmissionPending(true);
    setError('');
    try {
      const pendingIntent = await acquirePendingLiteratureIntent(
        window.sessionStorage,
        { userId: resolvedUserId, target: namespace, input },
        () => crypto.randomUUID(),
      );
      if (pendingIntent.status === 'blocked') {
        setError(t('pendingIntent'));
        return;
      }
      const acquisition = await submitLiteratureAcquisition(input, pendingIntent.key, target);
      setTask(acquisition.task);
      settlePendingLiteratureIntent(window.sessionStorage, { userId: resolvedUserId, target: namespace }, { kind: 'accepted' });
    } catch (cause) {
      settlePendingLiteratureIntent(window.sessionStorage, { userId: resolvedUserId, target: namespace }, {
        kind: 'failure', ...(cause instanceof ApiClientError ? { status: cause.status } : {}),
      });
      setError(t('error'));
    } finally {
      submitting.current = false;
      setSubmissionPending(false);
    }
  }, [namespace, recoveryReady, resolvedUserId, t, target]);

  React.useEffect(() => {
    if (!initialRequest || initialRequestSubmitted.current || !recoveryReady || !resolvedUserId || active) return;
    initialRequestSubmitted.current = true;
    void submit(initialRequest);
  }, [active, initialRequest, recoveryReady, resolvedUserId, submit]);

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
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    submitCurrentQuery();
  }

  async function retry() {
    if (!task || retrying.current || !isLiteratureTaskRetryEligible(task)) return;
    retrying.current = true;
    setRetryPending(true);
    setError('');
    try {
      const next = await retryAgentTask(task.id);
      setTask(next.task);
    } catch (cause) {
      const status = cause instanceof ApiClientError ? cause.status : undefined;
      const reconcile = status === undefined || status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
      if (!reconcile) {
        if (status === 401 || status === 403 || status === 404) handlePermanentTaskError(status);
        else setError(t('error'));
        return;
      }
      try {
        const authoritative = await getAgentTask('', task.id);
        setTask(authoritative.task);
      } catch (recoveryCause) {
        const recoveryStatus = recoveryCause instanceof ApiClientError ? recoveryCause.status : undefined;
        if (recoveryStatus === 401 || recoveryStatus === 403 || recoveryStatus === 404) handlePermanentTaskError(recoveryStatus);
        else setError(t('error'));
      }
    } finally {
      retrying.current = false;
      setRetryPending(false);
    }
  }

  async function download(documentId: string) {
    setDownloading(documentId);
    setError('');
    try {
      const link = await createTemporaryDocumentDownloadLink(documentId);
      window.location.assign(link.downloadUrl);
    } catch {
      setError(t('error'));
    } finally {
      setDownloading(null);
    }
  }

  const searchControls = <>
    <div>
      <label className={`block text-sm font-semibold ${ink}`} htmlFor={queryId}>{t('queryLabel')}</label>
      <input
        className={`mt-2 min-h-11 w-full border ${rule} bg-transparent px-3 text-base ${ink} outline-none transition-transform duration-150 focus:border-current focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`}
        disabled={active || submissionPending || !recoveryReady || !resolvedUserId}
        id={queryId}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('queryPlaceholder')}
        value={query}
      />
    </div>
    <button className={`min-h-11 border px-4 text-sm font-semibold ${dark ? 'border-os-paper text-os-paper' : 'border-os-ink text-os-ink'} transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`} disabled={active || submissionPending || !recoveryReady || !resolvedUserId || !query.trim()} onClick={withinForm ? submitCurrentQuery : undefined} type={withinForm ? 'button' : 'submit'}>
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
                    {identifier ? <button className={`min-h-11 min-w-11 border-b border-os-vermilion px-1 text-sm font-semibold ${ink} transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60`} disabled={active || submissionPending || !recoveryReady || !resolvedUserId} onClick={() => void submit({ query: source.title ?? query, identifier })} type="button">{t('getFullText')}</button> : null}
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

export function LiteratureAcquisitionDisclosure(props: LiteratureAcquisitionProps) {
  const t = useTranslations('dashboard.literature');
  const dark = props.tone === 'dark';
  return (
    <details className={`border-y ${dark ? 'border-os-rule-dark' : 'border-os-rule-paper'}`} data-literature-entry="true">
      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-focus-ring ${dark ? 'text-os-paper' : 'text-os-ink'}`}>
        {t('disclosure')}
        <span aria-hidden="true" className={dark ? 'text-os-vermilion' : 'text-os-vermilion-ink'}>＋</span>
      </summary>
      <LiteratureAcquisition {...props} />
    </details>
  );
}

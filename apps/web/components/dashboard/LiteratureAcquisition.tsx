'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { isSourceRetrieveIdentifier } from '@openscience/domain/browser-result';

import {
  ApiClientError,
  createTemporaryDocumentDownloadLink,
  getAgentTask,
  retryAgentTask,
  submitLiteratureAcquisition,
  type AgentTaskView,
} from '@/lib/api';

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
  state: 'pending' | 'running' | 'auth_required' | 'failed' | 'succeeded';
  messageKey: 'statusPending' | 'statusRunning' | 'statusAuthRequired' | 'statusFailed' | 'statusSucceeded';
};

export const isLiteratureIdentifier = isSourceRetrieveIdentifier;
const PENDING_INTENT_KEY = 'openscience:literature:personal:pending:v1';

function intentFingerprint(input: { query: string; identifier?: string }): string {
  return JSON.stringify({ query: input.query.trim(), identifier: input.identifier?.trim() ?? null });
}

function pendingKeyFor(input: { query: string; identifier?: string }): string | null {
  if (typeof window === 'undefined') return null;
  const fingerprint = intentFingerprint(input);
  const raw = window.sessionStorage.getItem(PENDING_INTENT_KEY);
  if (raw) {
    try {
      const pending = JSON.parse(raw) as { version?: number; key?: string; intentFingerprint?: string };
      if (pending.version === 1 && pending.key && pending.intentFingerprint === fingerprint) return pending.key;
      if (pending.version === 1 && pending.key) return null;
    } catch { window.sessionStorage.removeItem(PENDING_INTENT_KEY); }
  }
  const key = crypto.randomUUID();
  window.sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify({ version: 1, key, intentFingerprint: fingerprint }));
  return key;
}

function clearPendingIntent(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(PENDING_INTENT_KEY);
}

function hasAuthRequiredResult(result: Record<string, unknown> | null): boolean {
  if (!result || !Array.isArray(result.providers)) return false;
  return result.providers.some((entry) => entry && typeof entry === 'object'
    && (entry as Record<string, unknown>).code === 'auth_required');
}

export function describeLiteratureTask(task: LiteratureTask): LiteratureTaskDescription {
  if (task.status === 'pending') return { state: 'pending', messageKey: 'statusPending' };
  if (task.status === 'running') return { state: 'running', messageKey: 'statusRunning' };
  if (task.status === 'failed') return { state: 'failed', messageKey: 'statusFailed' };
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

export function LiteratureAcquisition({ initialTask = null, recoveryComplete = true }: { initialTask?: LiteratureTask | null; recoveryComplete?: boolean }) {
  const t = useTranslations('dashboard.literature');
  const [query, setQuery] = React.useState('');
  const [task, setTask] = React.useState<LiteratureTask | null>(initialTask);
  const [error, setError] = React.useState('');
  const [reconnecting, setReconnecting] = React.useState(false);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const submitting = React.useRef(false);

  const description = task ? describeLiteratureTask(task) : null;
  const active = description?.state === 'pending' || description?.state === 'running';
  const sources = resultSources(task?.result ?? null);

  React.useEffect(() => {
    if (recoveryComplete) setTask(initialTask);
  }, [initialTask, recoveryComplete]);

  React.useEffect(() => {
    if (!task || !active) return undefined;
    let disposed = false;
    let transientFailures = 0;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        controller = new AbortController();
        void getAgentTask('', task.id, controller.signal)
          .then(({ task: next }) => {
            if (disposed) return;
            transientFailures = 0;
            setReconnecting(false);
            setTask(next);
            if (next.status === 'pending' || next.status === 'running') schedule(1200);
          })
          .catch((cause) => {
            if (disposed || (cause instanceof DOMException && cause.name === 'AbortError')) return;
            const status = cause instanceof ApiClientError ? cause.status : 0;
            if ([401, 403, 404].includes(status)) return;
            transientFailures += 1;
            setReconnecting(true);
            schedule([1200, 2400, 4800, 9600, 15000][Math.min(transientFailures - 1, 4)]!);
          });
      }, delay);
    };
    schedule(1200);
    return () => { disposed = true; if (timer !== undefined) window.clearTimeout(timer); controller?.abort(); };
  }, [active, t, task]);

  async function submit(input: { query: string; identifier?: string }) {
    if (submitting.current) return;
    const idempotencyKey = pendingKeyFor(input);
    if (!idempotencyKey) {
      setError(t('pendingIntent'));
      return;
    }
    submitting.current = true;
    setError('');
    try {
      const acquisition = await submitLiteratureAcquisition(input, idempotencyKey);
      setTask(acquisition.task);
      clearPendingIntent();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status)) clearPendingIntent();
      setError(t('error'));
    } finally {
      submitting.current = false;
    }
  }

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    void submit({ query: normalized, ...(isLiteratureIdentifier(normalized) ? { identifier: normalized } : {}) });
  }

  async function retry() {
    if (!task) return;
    setError('');
    try {
      const next = await retryAgentTask(task.id);
      setTask(next.task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    }
  }

  async function download(documentId: string) {
    setDownloading(documentId);
    setError('');
    try {
      const link = await createTemporaryDocumentDownloadLink(documentId);
      window.location.assign(link.downloadUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="border-y border-os-rule-paper py-6" data-literature-acquisition="true">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p data-reading-role="caption" className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-os-vermilion-ink">{t('eyebrow')}</p>
          <h2 className="mt-2 font-editorial text-2xl text-os-ink">{t('title')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-os-muted-paper">{t('description')}</p>
        </div>
      </div>
      <form className="mt-5 grid gap-3 border-t border-os-rule-paper pt-5 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={onSearch}>
        <div>
          <label className="block text-sm font-semibold text-os-ink" htmlFor="literature-query">{t('queryLabel')}</label>
          <input
            className="mt-2 min-h-11 w-full border border-os-rule-paper bg-transparent px-3 text-base text-os-ink outline-none transition-transform duration-150 focus:border-os-ink focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
            disabled={active || !recoveryComplete}
            id="literature-query"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('queryPlaceholder')}
            value={query}
          />
        </div>
        <button className="min-h-11 border border-os-ink px-4 text-sm font-semibold text-os-ink transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60" disabled={active || !recoveryComplete || !query.trim()} type="submit">
          {t('search')}
        </button>
      </form>

      <div aria-atomic="true" aria-live="polite" className="mt-4 min-h-6 text-sm text-os-muted-paper" data-literature-state={description?.state ?? 'idle'}>
        {description ? t(description.messageKey) : null}
        {reconnecting ? <span className="ml-2">{t('reconnecting')}</span> : null}
        {error ? <span className="text-state-danger">{error}</span> : null}
      </div>

      {description?.state === 'failed' ? (
        <button className="mt-2 min-h-11 border-b border-os-vermilion-ink text-sm font-semibold text-os-ink transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring" onClick={() => void retry()} type="button">
          {t('retry')}
        </button>
      ) : null}

      {sources.length > 0 ? (
        <section className="mt-5 border-t border-os-rule-paper pt-5" aria-label={t('metadata')}>
          <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-os-muted-paper">{t('metadata')}</h3>
          <ol className="mt-3 divide-y divide-os-rule-paper">
            {sources.map((source, index) => {
              const identifier = sourceIdentifier(source);
              return (
                <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={source.id ?? `${source.title ?? 'source'}-${index}`}>
                  <div>
                    <p className="font-reading text-lg leading-7 text-os-ink">{source.title ?? t('untitled')}</p>
                    {source.sourceUrl ? <a className="mt-1 inline-block text-sm text-os-muted-paper underline decoration-os-rule-paper underline-offset-4 focus-visible:ring-2 focus-visible:ring-focus-ring" href={source.sourceUrl}>{t('source')}</a> : null}
                    {source.expiresAt ? <p className="mt-2 font-mono text-xs text-os-muted-paper">{t('expires', { expiresAt: readableExpiry(source.expiresAt) })}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {identifier ? <button className="min-h-11 min-w-11 border-b border-os-vermilion-ink px-1 text-sm font-semibold text-os-ink transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring" disabled={active || !recoveryComplete} onClick={() => void submit({ query: source.title ?? query, identifier })} type="button">{t('getFullText')}</button> : null}
                    {source.temporaryDocumentId ? <button className="min-h-11 border border-os-ink px-3 text-sm font-semibold text-os-ink transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60" disabled={downloading === source.temporaryDocumentId} onClick={() => void download(source.temporaryDocumentId!)} type="button">{t('download')}</button> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : task && description?.state === 'succeeded' ? <p className="mt-5 border-t border-os-rule-paper pt-5 text-sm text-os-muted-paper">{t('noResults')}</p> : null}
    </section>
  );
}

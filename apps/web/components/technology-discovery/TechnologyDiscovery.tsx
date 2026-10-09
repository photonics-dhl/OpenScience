'use client';

import * as React from 'react';
import { ArrowRight, ExternalLink, Search, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from '@/components/auth/SessionProvider';
import { ApiClientError } from '@/lib/api';
import { contactEmail, consultationMailto, consultationText } from '@/lib/technology-discovery/contact';
import { readDiscoveryTask, retryDiscoveryTask, startLiteratureTaskPolling, submitDiscoveryQuery } from '@/lib/technology-discovery/service';
import { anonymousDraftKey, loadDiscoveryDraft, saveDiscoveryDraft, transferAnonymousQuery, userDraftKey } from '@/lib/technology-discovery/storage';
import { selectedSources, sourcesFromTask, type DiscoveryAudience, type DiscoveryDraft } from '@/lib/technology-discovery/types';
import styles from './technology-discovery.module.css';

const emptyDraft = (audience: DiscoveryAudience): DiscoveryDraft => ({ version: 1, audience, turns: [], query: '', brief: '' });
const loginHref = (audience: DiscoveryAudience) => `/auth/login?returnTo=${encodeURIComponent(`/who-we-serve/${audience}`)}`;

function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TechnologyDiscovery({ audience }: { audience: DiscoveryAudience }) {
  const t = useTranslations('technologyDiscovery');
  const locale = useLocale();
  const { user, status, refresh } = useSession();
  const userId = status === 'authenticated' ? user?.userId : undefined;
  const scope = userId ? userDraftKey(userId, audience) : anonymousDraftKey(audience);
  const [loadedScope, setLoadedScope] = React.useState('');
  const [draft, setDraft] = React.useState<DiscoveryDraft>(() => emptyDraft(audience));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [reconnecting, setReconnecting] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contactScope, setContactScope] = React.useState('');
  const [contactError, setContactError] = React.useState('');
  const [restoreErrors, setRestoreErrors] = React.useState<Record<string, number>>({});
  const [contact, setContact] = React.useState({ name: '', organization: '', email: '', need: '' });
  const requestGeneration = React.useRef(0);
  const submitLock = React.useRef<{ scope: string; generation: number } | null>(null);
  const activeScope = React.useRef(scope);
  activeScope.current = scope;
  const visibleDraft = loadedScope === scope ? draft : emptyDraft(audience);
  const latestDraft = React.useRef({ scope, draft: visibleDraft });
  latestDraft.current = { scope, draft: visibleDraft };
  const visibleContactOpen = contactOpen && contactScope === scope && loadedScope === scope;
  const turns = visibleDraft.turns;
  const shortlist = selectedSources(turns);

  React.useEffect(() => {
    requestGeneration.current += 1;
    setError('');
    setBusy(false);
    setReconnecting(false);
    setContact({ name: '', organization: '', email: '', need: '' });
    setContactError('');
    setContactOpen(false);
    setContactScope('');
    setRestoreErrors({});
    if (!scope) { setLoadedScope(''); setDraft(emptyDraft(audience)); return; }
    const storage = window.sessionStorage;
    const initial = userId ? transferAnonymousQuery(storage, userId, audience) : loadDiscoveryDraft(storage, scope, audience);
    setDraft(initial);
    setLoadedScope(scope);
    const generation = requestGeneration.current;
    // Restore only exact task IDs saved by this user in this audience. Never pick the newest personal task.
    for (const turn of initial.turns) {
      void readDiscoveryTask(turn.taskId).then(task => {
        if (generation !== requestGeneration.current || activeScope.current !== scope) return;
        setDraft(current => ({ ...current, turns: current.turns.map(item => item.id === turn.id ? { ...item, task } : item) }));
        setRestoreErrors(current => { const next = { ...current }; delete next[turn.id]; return next; });
      }).catch(cause => {
        if (generation !== requestGeneration.current || activeScope.current !== scope) return;
        if (cause instanceof ApiClientError && cause.status === 401) { setLoadedScope(''); void refresh(true); }
        else setRestoreErrors(current => ({ ...current, [turn.id]: cause instanceof ApiClientError ? cause.status : 0 }));
      });
    }
  }, [audience, scope, userId, refresh]);

  const activeTurn = [...turns].reverse().find(turn => turn.task?.status === 'pending' || turn.task?.status === 'running');
  React.useEffect(() => {
    if (!activeTurn?.task || !userId || loadedScope !== scope) return;
    const generation = requestGeneration.current;
    return startLiteratureTaskPolling({
      taskId: activeTurn.taskId,
      getTask: readDiscoveryTask,
      onTask: task => { if (generation === requestGeneration.current) setDraft(current => ({ ...current, turns: current.turns.map(turn => turn.id === activeTurn.id ? { ...turn, task } : turn) })); },
      onReconnecting: next => { if (generation === requestGeneration.current) setReconnecting(next); },
      onPermanentError: code => {
        if (generation !== requestGeneration.current) return;
        if (code === 401) { setLoadedScope(''); void refresh(true); }
        setError(t('taskUnavailable'));
      },
    });
  }, [activeTurn?.id, activeTurn?.taskId, activeTurn?.task?.status, loadedScope, scope, userId, refresh, t]);

  const saveEditedDraft = (next: DiscoveryDraft) => {
    latestDraft.current = { scope, draft: next };
    setDraft(next);
    saveDiscoveryDraft(window.sessionStorage, scope, next);
  };
  const update = (changes: Partial<DiscoveryDraft>) => saveEditedDraft({ ...latestDraft.current.draft, ...changes });
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = visibleDraft.query.trim();
    if (!query || query.length > 500 || busy || (submitLock.current?.scope === scope && submitLock.current.generation === requestGeneration.current)) return;
    if (status === 'unavailable' || status === 'loading') { setError(t('serviceUnavailable')); return; }
    if (!userId) {
      if (scope) saveDiscoveryDraft(window.sessionStorage, scope, { ...visibleDraft, query });
      window.location.assign(loginHref(audience));
      return;
    }
    const generation = requestGeneration.current;
    const lock = { scope, generation };
    submitLock.current = lock;
    setBusy(true);
    setError('');
    try {
      const task = await submitDiscoveryQuery(window.sessionStorage, userId, audience, query);
      if (generation !== requestGeneration.current) return;
      const current = latestDraft.current.draft;
      saveEditedDraft({ ...current, query: current.query.trim() === query ? '' : current.query, turns: [...current.turns, { id: crypto.randomUUID(), query, taskId: task.id, task, selected: [], createdAt: new Date().toISOString() }].slice(-10) });
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof ApiClientError && cause.status === 401) {
        // Keep this query in the original user's scoped draft. A different account
        // signing in on the same browser must not inherit it through anonymous storage.
        saveDiscoveryDraft(window.sessionStorage, userDraftKey(userId, audience), { ...visibleDraft, query });
        setLoadedScope('');
        void refresh(true);
        setError(t('sessionExpired'));
      } else setError(cause instanceof Error && cause.message === 'pending-intent' ? t('pendingIntent') : t('requestFailed'));
    } finally { if (submitLock.current === lock) submitLock.current = null; if (generation === requestGeneration.current) setBusy(false); }
  }

  async function retry(taskId: string) {
    if (submitLock.current?.scope === scope && submitLock.current.generation === requestGeneration.current) return;
    const generation = requestGeneration.current;
    const lock = { scope, generation };
    submitLock.current = lock;
    setBusy(true);
    setError('');
    try {
      const task = await retryDiscoveryTask(taskId);
      if (generation === requestGeneration.current) setDraft(current => ({ ...current, turns: current.turns.map(turn => turn.taskId === taskId ? { ...turn, task } : turn) }));
    } catch (cause) {
      if (generation === requestGeneration.current) {
        const statusCode = cause instanceof ApiClientError ? cause.status : undefined;
        if (statusCode === 401) { setLoadedScope(''); void refresh(true); }
        else if (statusCode === undefined || [408, 409, 429].includes(statusCode) || statusCode >= 500) {
          try {
            const task = await readDiscoveryTask(taskId);
            if (generation === requestGeneration.current) setDraft(current => ({ ...current, turns: current.turns.map(turn => turn.taskId === taskId ? { ...turn, task } : turn) }));
          } catch (reconcileError) {
            if (generation === requestGeneration.current) {
              if (reconcileError instanceof ApiClientError && reconcileError.status === 401) { setLoadedScope(''); void refresh(true); }
              setError(t('requestFailed'));
            }
          }
        } else setError(t('requestFailed'));
      }
    } finally { if (submitLock.current === lock) submitLock.current = null; if (generation === requestGeneration.current) setBusy(false); }
  }

  async function restoreTurn(turnId: string, taskId: string) {
    setRestoreErrors(current => { const next = { ...current }; delete next[turnId]; return next; });
    const generation = requestGeneration.current;
    try {
      const task = await readDiscoveryTask(taskId);
      if (generation === requestGeneration.current) setDraft(current => ({ ...current, turns: current.turns.map(turn => turn.id === turnId ? { ...turn, task } : turn) }));
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof ApiClientError && cause.status === 401) { setLoadedScope(''); void refresh(true); }
      else setRestoreErrors(current => ({ ...current, [turnId]: cause instanceof ApiClientError ? cause.status : 0 }));
    }
  }

  function toggleSource(turnId: string, sourceId: string) {
    const current = latestDraft.current.draft;
    const selected = selectedSources(current.turns);
    if (selected.length >= 3 && !selected.some(source => source.id === sourceId)) return;
    saveEditedDraft({ ...current, turns: current.turns.map(turn => turn.id === turnId ? { ...turn, selected: turn.selected.includes(sourceId) ? turn.selected.filter(id => id !== sourceId) : [...turn.selected, sourceId] } : turn) });
  }

  const exportShortlist = () => downloadText(`openscience-${audience}-shortlist.txt`, [
    `OpenScience ${audience} research shortlist`, `Need / brief: ${visibleDraft.brief || t('notProvided')}`, '',
    ...shortlist.map((source, index) => `${index + 1}. ${source.title}\n${source.identifier || t('identifierUnknown')}\n${source.url || t('sourceUnknown')}\n${t('validationUnknown')}`),
  ].join('\n'));
  const contactBody = consultationText({ audience, locale: locale === 'zh' ? 'zh' : 'en', ...contact, need: contact.need || visibleDraft.brief || visibleDraft.query || turns.at(-1)?.query || '', brief: visibleDraft.brief, query: turns.at(-1)?.query || visibleDraft.query, sources: shortlist });
  const recipient = contactEmail(process.env.NEXT_PUBLIC_OPENSCIENCE_CONTACT_EMAIL);
  function validateContact() {
    if (!contact.name.trim() || !contact.organization.trim() || !contact.need.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
      setContactError(t('contactValidation'));
      return false;
    }
    setContactError('');
    return true;
  }

  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> OpenScience / {t('eyebrow')}</p>
      <h1>{t(`${audience}.title`)}</h1>
      <p className={styles.lead}>{t(`${audience}.lead`)}</p>
      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor="technology-query" className={styles.srOnly}>{t('queryLabel')}</label>
        <textarea id="technology-query" rows={3} maxLength={500} disabled={status === 'loading' || loadedScope !== scope} value={visibleDraft.query} onChange={event => update({ query: event.target.value })} placeholder={t(`${audience}.placeholder`)} aria-describedby="query-help" />
        <div className={styles.composerFooter}><span id="query-help">{t('queryHelp')}</span><button disabled={!visibleDraft.query.trim() || busy || status === 'loading' || status === 'unavailable'} type="submit"><Search size={17} aria-hidden="true" />{busy ? t('searching') : t('search')}</button></div>
      </form>
      <div className={styles.examples} aria-label={t('examplesLabel')}><span>{t('tryExample')}</span>{(['example1', 'example2', 'example3'] as const).map(key => <button key={key} type="button" disabled={status === 'loading' || loadedScope !== scope} onClick={() => update({ query: t(`${audience}.${key}`) })}>{t(`${audience}.${key}`)}</button>)}</div>
      {status === 'loading' && <p role="status" className={styles.accessNote}>{t('checkingSignIn')}</p>}
      {status === 'anonymous' && <p className={styles.accessNote}>{t('loginOnSearch')}</p>}
      {status === 'unavailable' && <p role="status" className={styles.accessNote}>{t('serviceUnavailable')} <button className={styles.inlineButton} type="button" onClick={() => void refresh(true)}>{t('retrySession')}</button></p>}
      <button className={styles.heroContact} type="button" onClick={() => { setContactScope(scope); setContactOpen(true); setContact(current => ({ ...current, need: current.need || visibleDraft.brief || visibleDraft.query || turns.at(-1)?.query || '' })); document.getElementById('technology-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t('getInTouch')} <ArrowRight size={15} aria-hidden="true" /></button>
    </header>

    <div className={styles.workspace}>
      <section className={styles.conversation} aria-label={t('conversation')}>
        <div className={styles.sectionHeading}><span>01 / {t('conversation')}</span><span>{turns.length ? t('queriesCount', { count: turns.length }) : t('ready')}</span></div>
        {turns.length === 0 ? <div className={styles.empty}><h2>{t(`${audience}.emptyTitle`)}</h2><p>{t(`${audience}.emptyBody`)}</p></div> : turns.map(turn => {
          const sources = sourcesFromTask(turn.task);
          const providerProblem = Array.isArray(turn.task?.result?.providers) && turn.task.result.providers.some(provider => provider && typeof provider === 'object' && !['ok', 'succeeded', 'success'].includes(String((provider as Record<string, unknown>).status)));
          return <article key={turn.id} className={styles.turn}>
            <div className={styles.userMessage}><span>{t('yourQuery')}</span><p>{turn.query}</p></div>
            <div className={styles.assistantMessage} aria-live="polite"><span>{t('sourceRetrieval')}</span>
              <p>{!turn.task ? restoreErrors[turn.id] !== undefined ? [403, 404].includes(restoreErrors[turn.id]!) ? t('taskUnavailable') : t('restoreFailed') : t('restoring') : turn.task.status === 'pending' ? t('queued') : turn.task.status === 'running' ? t('retrieving') : turn.task.status === 'failed' ? t('retrievalFailed') : sources.length ? t('metadataFound', { count: sources.length }) : providerProblem ? t('providerUnavailable') : t('noMetadata')}</p>
              {sources.length > 0 && providerProblem && <p className={styles.caveat}>{t('partialProviders')}</p>}
              {!turn.task && restoreErrors[turn.id] !== undefined && ![403, 404].includes(restoreErrors[turn.id]!) && <button className={styles.textAction} onClick={() => void restoreTurn(turn.id, turn.taskId)} type="button">{t('retryRestore')}</button>}
              {turn.task?.status === 'failed' && turn.task.canRetry && <button className={styles.textAction} disabled={busy} onClick={() => void retry(turn.taskId)} type="button">{t('retry')}</button>}
              {sources.length > 0 && <ul className={styles.sourceList}>{sources.map(source => <li key={source.id} className={styles.sourceCard}>
                <div><h3>{source.title}</h3><p>{source.identifier || t('identifierUnknown')}</p>{source.url && <a href={source.url} target="_blank" rel="noreferrer">{t('openSource')} <ExternalLink size={14} aria-hidden="true" /></a>}</div>
                <button type="button" aria-pressed={turn.selected.includes(source.id)} disabled={!turn.selected.includes(source.id) && shortlist.length >= 3} onClick={() => toggleSource(turn.id, source.id)}>{turn.selected.includes(source.id) ? t('remove') : t('shortlist')}</button>
              </li>)}</ul>}
              {turn.task?.status === 'succeeded' && <p className={styles.caveat}>{t('metadataCaveat')}</p>}
            </div>
          </article>;
        })}
        {reconnecting && <p role="status" className={styles.notice}>{t('reconnecting')}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section>

      <aside className={styles.sidebar} aria-label={t('researchBrief')}>
        <div className={styles.sectionHeading}><span>02 / {t('researchBrief')}</span></div>
        <label htmlFor="discovery-brief">{t(`${audience}.briefLabel`)}</label>
        <textarea id="discovery-brief" rows={5} maxLength={2000} disabled={status === 'loading' || loadedScope !== scope} value={visibleDraft.brief} onChange={event => update({ brief: event.target.value })} placeholder={t(`${audience}.briefPlaceholder`)} />
        <p className={styles.hint}>{t('briefHint')}</p>
        <div className={styles.shortlistHead}><h2>{t('shortlistTitle')}</h2><span>{shortlist.length}/3</span></div>
        {shortlist.length ? <ol className={styles.shortlist}>{shortlist.map(source => <li key={source.id}><strong>{source.title}</strong><span>{source.identifier || t('identifierUnknown')}</span></li>)}</ol> : <p className={styles.hint}>{t('shortlistEmpty')}</p>}
        {shortlist.length > 1 && <div className={styles.comparison}><h3>{t('compareTitle')}</h3><div className={styles.compareGrid}>{shortlist.map(source => <div key={source.id}><strong>{source.title}</strong><span>{source.identifier || t('identifierUnknown')}</span>{source.url && <a href={source.url} target="_blank" rel="noreferrer">{t('openSource')}</a>}<small>{t('validationUnknown')}</small></div>)}</div></div>}
        <p className={styles.hint}>{t(`${audience}.unknowns`)}</p>
        <button className={styles.outlineButton} disabled={!shortlist.length && !visibleDraft.brief.trim()} onClick={exportShortlist} type="button">{t('exportShortlist')}</button>
        <button id="technology-contact" className={styles.contactButton} onClick={() => { setContactScope(scope); setContactOpen(open => !open); setContact(current => ({ ...current, need: current.need || visibleDraft.brief || visibleDraft.query || turns.at(-1)?.query || '' })); }} aria-expanded={visibleContactOpen} type="button">{t('getInTouch')} <ArrowRight size={16} aria-hidden="true" /></button>
        {visibleContactOpen && <section className={styles.contact} aria-label={t('contactTitle')}><h2>{t('contactTitle')}</h2><p>{t('contactHelp')}</p>
          <label>{t('name')}<input value={contact.name} onChange={event => setContact(current => ({ ...current, name: event.target.value }))} /></label>
          <label>{t('organization')}<input value={contact.organization} onChange={event => setContact(current => ({ ...current, organization: event.target.value }))} /></label>
          <label>{t('email')}<input type="email" value={contact.email} onChange={event => setContact(current => ({ ...current, email: event.target.value }))} /></label>
          <label>{t('need')}<textarea rows={4} value={contact.need} onChange={event => setContact(current => ({ ...current, need: event.target.value }))} /></label>
          <details><summary>{t('previewDraft')}</summary><pre>{contactBody}</pre></details>
          {contactError && <p role="alert" className={styles.error}>{contactError}</p>}
          <div className={styles.contactActions}><button type="button" onClick={() => { if (validateContact()) downloadText('openscience-consultation-request.txt', contactBody); }}>{t('exportRequest')}</button><a href={consultationMailto(recipient, contactBody)} onClick={event => { if (!validateContact()) event.preventDefault(); }}>{t('openEmailDraft')}</a></div>
          <p className={styles.hint}>{t('mailNotice')}</p>
        </section>}
      </aside>
    </div>
  </div>;
}

'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiClientError, confirmIngestionClaims, listIngestionClaimPreviews, type IngestionClaimPreview, type PresentationClaim } from '@/lib/api';
import { createReviewRows, editReviewStatement, selectedReviewClaims, splitReviewRow, type ClaimReviewRow } from '@/lib/hermes/ingestion-claim-review';
import { SubmissionIntent } from '@/lib/hermes/presentation-action';

const control = 'min-h-11 w-full rounded border border-os-rule-paper bg-os-paper px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink';
interface Props {
  researchObjectId: string; versionId: string;
  onComplete: (claims: PresentationClaim[]) => void;
  onBusyChange?: (busy: boolean) => void;
}
export function IngestionClaimReview({ researchObjectId: ro, versionId, onComplete, onBusyChange }: Props) {
  const t = useTranslations('ingestionClaimReview');
  const scope = `${ro}:${versionId}`;
  const rendered = useRef(scope); rendered.current = scope;
  const callbacks = useRef({ onComplete, onBusyChange }); callbacks.current = { onComplete, onBusyChange };
  const controller = useRef<AbortController | null>(null);
  const intent = useRef(new SubmissionIntent());
  const [state, setState] = useState<{ scope: string; candidates: IngestionClaimPreview[]; chosen: string; rows: ClaimReviewRow[] }>({ scope, candidates: [], chosen: '', rows: [] });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    intent.current = new SubmissionIntent();
    setState({ scope, candidates: [], chosen: '', rows: [] }); setLoaded(false); setBusy(false); setUncertain(false); setError(''); setComplete(false);
    return () => { abort.abort(); callbacks.current.onBusyChange?.(false); };
  }, [scope]);
  const current = state.scope === scope;
  const rows = current ? state.rows : [];
  const candidates = current ? state.candidates : [];
  const candidate = candidates.find(item => item.taskId === state.chosen);
  const locked = busy || uncertain;
  let selections: ReturnType<typeof selectedReviewClaims> = [];
  let valid = true;
  let invalidReason = 'invalid';
  try { selections = selectedReviewClaims(rows); } catch (cause) { valid = false; if (cause instanceof Error && cause.message === 'DUPLICATE_SOURCE_ASSOCIATION') invalidReason = 'duplicateAssociation'; }
  const choose = (taskId: string, values = candidates) => {
    const next = values.find(item => item.taskId === taskId);
    setState({ scope, candidates: values, chosen: taskId, rows: next ? createReviewRows(next.suggestions) : [] });
    setComplete(false); setError('');
  };
  async function load() {
    if (locked) return;
    const abort = controller.current; setBusy(true); setError('');
    try {
      const result = await listIngestionClaimPreviews(ro, versionId, abort?.signal);
      if (abort?.signal.aborted || rendered.current !== scope) return;
      const values = result.candidates.filter(item => item.researchObjectId === ro && item.versionId === versionId);
      choose(values[0]?.taskId ?? '', values); setLoaded(true);
    } catch { if (!abort?.signal.aborted && rendered.current === scope) setError('loadError'); }
    finally { if (!abort?.signal.aborted && rendered.current === scope) setBusy(false); }
  }
  function update(key: string, edit: (row: ClaimReviewRow) => ClaimReviewRow) {
    if (locked) return;
    setState(previous => previous.scope === scope ? { ...previous, rows: previous.rows.map(row => row.clientKey === key ? edit(row) : row) } : previous);
  }
  async function confirm() {
    if (!candidate || !valid || !selections.length || busy || complete || error === 'stale' || error === 'submitError') return;
    const body = { snapshotToken: candidate.snapshotToken, selections };
    const key = intent.current.begin(JSON.stringify([scope, candidate.taskId, body]));
    if (!key) return;
    const abort = controller.current; setBusy(true); setError(''); callbacks.current.onBusyChange?.(true);
    try {
      const result = await confirmIngestionClaims(ro, versionId, candidate.taskId, body, key, abort?.signal);
      if (abort?.signal.aborted || rendered.current !== scope) return;
      intent.current.complete(); setUncertain(false); setComplete(true);
      callbacks.current.onComplete(result.claims.filter(claim => claim.researchObjectId === ro && claim.versionId === versionId));
      callbacks.current.onBusyChange?.(false);
    } catch (cause) {
      if (abort?.signal.aborted || rendered.current !== scope) return;
      const ambiguous = !(cause instanceof ApiClientError) || cause.status === 0 || cause.status === 408 || cause.status === 429 || cause.status >= 500;
      intent.current.fail(ambiguous); setUncertain(ambiguous);
      setError(ambiguous ? 'uncertain' : cause instanceof ApiClientError && cause.status === 409 ? 'stale' : 'submitError');
      callbacks.current.onBusyChange?.(ambiguous);
    } finally { if (!abort?.signal.aborted && rendered.current === scope) setBusy(false); }
  }
  return <section className="my-4 space-y-3 rounded-lg border border-os-rule-paper p-3" aria-label={t('title')}>
    <h4 className="text-base font-semibold">{t('title')}</h4><p className="text-sm leading-6">{t('boundary')}</p>
    <button type="button" className={control} disabled={locked} onClick={() => void load()}>{t(busy && !loaded ? 'loading' : loaded ? 'refresh' : 'load')}</button>
    {current && loaded && !candidates.length ? <p role="status">{t('empty')}</p> : null}
    {candidates.length ? <fieldset disabled={locked || complete} className="min-w-0 space-y-4 border-0 p-0">
      <p className="text-sm leading-6 text-os-muted-paper">{t('evidenceNotice')}</p>
      <label className="grid gap-2 text-sm">{t('source')}<select className={control} value={state.chosen} onChange={event => choose(event.target.value)}>{candidates.map(item => <option key={item.taskId} value={item.taskId}>{item.artifact.logicalPath}</option>)}</select></label>
      {rows.map((row, index) => <div key={row.clientKey} className="space-y-2 border-t border-os-rule-paper pt-3">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={row.selected} onChange={event => update(row.clientKey, value => ({ ...value, selected: event.target.checked }))}/>{t(`field_${row.sourceField}`)} · {index + 1}</label>
        <label className="grid gap-2 text-sm">{t('statement')}<textarea aria-label={t('statement')} className={control} maxLength={4000} value={row.statement} onChange={event => update(row.clientKey, value => editReviewStatement(value, event.target.value))}/></label>
        {row.statement !== row.originalStatement ? <details className="text-sm"><summary>{t('changed')}</summary><p className="whitespace-pre-wrap break-words">{row.originalStatement}</p></details> : null}
        <label className="grid gap-2 text-sm">{t('kind')}<select className={control} value={row.kind} onChange={event => update(row.clientKey, value => ({ ...value, kind: event.target.value as PresentationClaim['kind'], parentClientKey: undefined }))}>{(['core','supporting','method','boundary','counter'] as const).map(kind => <option key={kind} value={kind}>{t(`kind_${kind}`)}</option>)}</select></label>
        {row.kind !== 'core' ? <label className="grid gap-2 text-sm">{t('parent')}<select className={control} value={row.parentClientKey ?? ''} onChange={event => update(row.clientKey, value => ({ ...value, parentClientKey: event.target.value || undefined }))}><option value="">{t('chooseParent')}</option>{rows.filter(item => item.selected && item.clientKey !== row.clientKey).map(item => <option key={item.clientKey} value={item.clientKey}>{item.statement.slice(0, 90)}</option>)}</select></label> : null}
        {(['conditions','limitations'] as const).map(field => <label key={field} className="grid gap-2 text-sm">{t(field)}<textarea className={control} maxLength={4000} value={(row[field] ?? []).join('\n')} onChange={event => update(row.clientKey, value => ({ ...value, [field]: event.target.value.split('\n'), attachSourceQuote: false }))}/></label>)}
        {(row.sources ?? (row.source ? [row.source] : [])).length ? <><ol className="space-y-3 pl-5">{(row.sources ?? [row.source!]).map((source, segment) => <li key={segment}><blockquote className="m-0 whitespace-pre-wrap break-words border-l-2 border-os-rule-paper pl-3 text-sm">{source.quote}</blockquote><p className="text-xs">{source.locator.page ? t('page', { page: source.locator.page }) : t('sourceLocated')}</p></li>)}</ol><label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={row.attachSourceQuote} onChange={event => update(row.clientKey, value => ({ ...value, attachSourceQuote: event.target.checked }))}/>{t('associate')}</label></> : <p className="text-sm">{t('noQuote')}</p>}
        <button type="button" className="min-h-11 text-sm underline" disabled={rows.length >= 12} onClick={() => setState(previous => ({ ...previous, rows: [...previous.rows, splitReviewRow(row, crypto.randomUUID())] }))}>{t('split')}</button>
      </div>)}
    </fieldset> : null}
    {!valid ? <p role="alert" className="text-sm">{t(invalidReason)}</p> : null}
    {error ? <p role="alert" className="text-sm">{t(error)}</p> : null}
    {complete ? <p role="status" className="text-sm">{t('complete')}</p> : candidate ? <button type="button" className="min-h-11 w-full rounded bg-os-ink px-3 py-2 text-sm text-white disabled:opacity-40" disabled={busy || !valid || !selections.length || error === 'stale' || error === 'submitError'} onClick={() => void confirm()}>{t(busy ? 'saving' : uncertain ? 'retry' : 'confirm')}</button> : null}
  </section>;
}

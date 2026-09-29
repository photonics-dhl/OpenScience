'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getHermesImageArtStyleCapability, SESSION_CHANGED_EVENT, SESSION_INVALIDATED_EVENT,
  type HermesArtStyleCapability, type PresentationAsset } from '@/lib/api';
import { createManagedStyleOperation, discardRejectedManagedStyleOperation, loadManagedStyleOperation, managedStyleStorageKey, matchesManagedStyleCapability,
  saveManagedStyleOperation, submitManagedStyleOperation, type ManagedStyleOperation, type ManagedStyleScope } from '@/lib/presentation/managed-illustration-style';

interface Props {
  actorId: string;
  researchObjectId: string;
  versionId: string;
  image: PresentationAsset;
  parent: PresentationAsset;
  canWrite: boolean;
  disabled: boolean;
  fallback?: React.ReactNode;
  onSubmitted(runId: string): void;
  onBusyChange?(busy: boolean): void;
}

export function ManagedIllustrationStyleChoices(props: Props) {
  if (!props.canWrite || !props.image.sceneImage || props.parent.id !== props.image.sceneImage.storyboardAssetId) return null;
  const scope: ManagedStyleScope = { actorId: props.actorId, researchObjectId: props.researchObjectId,
    versionId: props.versionId, imageAssetId: props.image.id, storyboardAssetId: props.parent.id,
    sceneIndex: props.image.sceneImage.sceneIndex };
  return <ScopedManagedStyleChoices key={managedStyleStorageKey(scope)} {...props} scope={scope} />;
}

function ScopedManagedStyleChoices({ scope, image, parent, canWrite, disabled, fallback, onSubmitted, onBusyChange }: Props & { scope: ManagedStyleScope }) {
  const t = useTranslations('presentation.styleChoices');
  const [capability, setCapability] = useState<HermesArtStyleCapability | null>(null);
  const [capabilityResolved, setCapabilityResolved] = useState(false);
  const [operation, setOperation] = useState<ManagedStyleOperation>();
  const operationRef = useRef<ManagedStyleOperation>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const current = useRef(false);
  const controller = useRef<AbortController>();
  const permission = useRef(canWrite); permission.current = canWrite;
  const callbacks = useRef({ onSubmitted, onBusyChange }); callbacks.current = { onSubmitted, onBusyChange };
  const recommendations = parent.storyboard?.document.scenes[scope.sceneIndex]?.styleRecommendations;
  const selectedStyle = recommendations?.selectedStyleId;
  const currentChoice = recommendations?.choices.find(choice => choice.styleId === selectedStyle);
  const alternatives = capability?.choices.filter(choice => choice.styleId !== selectedStyle) ?? [];

  useEffect(() => {
    current.current = true;
    const reads = new AbortController();
    setReady(false); setError(''); setCapability(null); setCapabilityResolved(false);
    try {
      operationRef.current = loadManagedStyleOperation(window.sessionStorage, scope);
      setOperation(operationRef.current); setReady(true);
      if (operationRef.current?.rejection) setError('managedRequestStale');
    } catch { setError('styleStorageError'); }
    void getHermesImageArtStyleCapability(scope.researchObjectId, scope.versionId, scope.imageAssetId, reads.signal)
      .then(({ styleContinuation }) => {
        if (!current.current || reads.signal.aborted) return;
        if (styleContinuation && !matchesManagedStyleCapability(scope, styleContinuation)) { setError('styleScopeChanged'); return; }
        setCapability(styleContinuation);
        setCapabilityResolved(true);
      }).catch(() => { if (current.current && !reads.signal.aborted) setError(previous => previous || 'managedCapabilityFailed'); });
    const invalidate = () => {
      current.current = false; reads.abort(); controller.current?.abort(); setReady(false);
      setError('styleScopeChanged'); setBusy(false);
      if (busyRef.current) callbacks.current.onBusyChange?.(false);
      busyRef.current = false;
    };
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    window.addEventListener(SESSION_INVALIDATED_EVENT, invalidate);
    return () => {
      current.current = false; reads.abort(); controller.current?.abort();
      if (busyRef.current) callbacks.current.onBusyChange?.(false);
      busyRef.current = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
      window.removeEventListener(SESSION_INVALIDATED_EVENT, invalidate);
    };
  }, [scope.actorId, scope.researchObjectId, scope.versionId, scope.imageAssetId, scope.storyboardAssetId, scope.sceneIndex, reload]);

  async function start(style?: string) {
    if (!ready || !current.current || !permission.current || disabled || busyRef.current) return;
    if (image.researchObjectId !== scope.researchObjectId || image.versionId !== scope.versionId
      || parent.researchObjectId !== scope.researchObjectId || parent.versionId !== scope.versionId) return;
    busyRef.current = true; setBusy(true); setError(''); callbacks.current.onBusyChange?.(true);
    controller.current = new AbortController();
    try {
      let value = operationRef.current;
      if (style && (!value || value.childRunId)) {
        if (!capability || style === selectedStyle) throw new Error('styleScopeChanged');
        value = createManagedStyleOperation(scope, capability, style);
        saveManagedStyleOperation(window.sessionStorage, value);
        operationRef.current = value; setOperation(value);
      }
      if (!value) throw new Error('styleScopeChanged');
      const run = await submitManagedStyleOperation(value, window.sessionStorage,
        () => current.current && permission.current, controller.current.signal);
      if (current.current) { setOperation({ ...value }); callbacks.current.onSubmitted(run.id); }
    } catch (cause) {
      if (current.current) {
        const message = cause instanceof Error ? cause.message : '';
        setError(['styleScopeChanged', 'styleStorageError', 'managedRequestStale'].includes(message) ? message : 'styleOutcomeUnknown');
        setOperation(operationRef.current ? { ...operationRef.current } : undefined);
      }
    } finally {
      if (current.current) setBusy(false);
      if (busyRef.current) callbacks.current.onBusyChange?.(false);
      busyRef.current = false;
    }
  }

  function reloadRejected() {
    if (!ready || !current.current || !permission.current || disabled || busyRef.current || !operationRef.current?.rejection) return;
    try {
      discardRejectedManagedStyleOperation(window.sessionStorage, operationRef.current);
      operationRef.current = undefined; setOperation(undefined); setCapability(null); setReload(value => value + 1);
    } catch { setError('styleStorageError'); }
  }

  if (!capability && !operation && !error) return capabilityResolved && ready ? <>{fallback}</> : null;
  return <section className="mt-3 border-t border-os-rule-paper pt-3" aria-label={t('title')} aria-busy={busy} data-managed-style-image={scope.imageAssetId}>
    <p className="text-sm font-medium text-os-ink">{t('title')}</p>
    {currentChoice ? <div className="mt-2" data-current-illustration-style>
      <p className="text-sm font-medium">{currentChoice.name}<span className="ml-2 text-xs text-os-vermilion-ink">{t('active')}</span></p>
      <p className="text-sm text-os-muted-paper">{currentChoice.reason}</p>
    </div> : null}
    {alternatives.length ? <><p className="mt-3 text-sm leading-6 text-os-muted-paper">{t('managedScope')}</p>
      <ul className="mt-2 space-y-2">{alternatives.map(choice => <li key={choice.styleId} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{choice.name}</p>
          <p className="text-sm text-os-muted-paper">{choice.reason}</p></div>
        <button type="button" className="min-h-11 max-w-full justify-self-start rounded-control px-3 text-left text-sm font-medium text-os-vermilion-ink focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
          disabled={!ready || !canWrite || disabled || busy || Boolean(operation && !operation.childRunId)} onClick={() => void start(choice.styleId)}>{t('switchAndGenerate')}</button>
      </li>)}</ul></> : null}
    {busy ? <p role="status" className="mt-2 text-sm">{t('working')}</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm">{t(error)}</p> : null}
    {operation?.rejection && !busy ? <button type="button" className="mt-2 min-h-11 text-sm font-medium text-os-vermilion-ink disabled:opacity-50"
      disabled={!ready || !canWrite || disabled} onClick={reloadRejected}>{t('managedReload')}</button> : null}
    {operation && !operation.rejection && !busy ? <button type="button" className="mt-2 min-h-11 text-sm font-medium text-os-vermilion-ink disabled:opacity-50"
      disabled={!ready || !canWrite || disabled} onClick={() => void start()}>{t(operation.childRunId ? 'managedOpenRun' : 'continueSameOperation')}</button> : null}
    {error === 'managedCapabilityFailed' && !operation ? <button type="button" className="mt-2 min-h-11 text-sm text-os-vermilion-ink" onClick={() => setReload(value => value + 1)}>{t('managedReload')}</button> : null}
  </section>;
}

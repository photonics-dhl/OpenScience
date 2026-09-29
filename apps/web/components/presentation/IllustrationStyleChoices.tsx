'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SESSION_CHANGED_EVENT, SESSION_INVALIDATED_EVENT, type PresentationAsset } from '@/lib/api';
import { advanceStyleSwitch, canSwitchIllustrationStyle, createStyleSwitch, loadStyleSwitch, saveStyleSwitch,
  styleSwitchStorageKey, type StyleSwitchOperation, type StyleSwitchScope } from '@/lib/presentation/illustration-style-switch';

export interface IllustrationStyleChoicesProps {
  actorId: string;
  researchObjectId: string;
  versionId: string;
  /** The exact parent storyboard of the displayed image, never the newest unrelated plan. */
  asset: PresentationAsset;
  sceneIndex?: number;
  canWrite: boolean;
  /** Existing standalone image-generation capability (currently platform administrator). */
  canGenerate: boolean;
  onSubmitted(taskId: string): void;
  onBusyChange?(busy: boolean): void;
}
export function IllustrationStyleChoices(props: IllustrationStyleChoicesProps) {
  const scope = { actorId: props.actorId, researchObjectId: props.researchObjectId, versionId: props.versionId, baseAssetId: props.asset.id };
  return <ScopedStyleChoices key={styleSwitchStorageKey(scope)} {...props} scope={scope} />;
}
function ScopedStyleChoices({ scope, asset, sceneIndex = 0, canWrite, canGenerate, onSubmitted, onBusyChange }: IllustrationStyleChoicesProps & { scope: StyleSwitchScope }) {
  const t = useTranslations('presentation.styleChoices');
  const [operation, setOperation] = useState<StyleSwitchOperation>();
  const operationRef = useRef<StyleSwitchOperation>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const current = useRef(true);
  const controller = useRef<AbortController>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callbacks = useRef({ onSubmitted, onBusyChange }); callbacks.current = { onSubmitted, onBusyChange };
  const permission = useRef(canWrite && canGenerate); permission.current = canWrite && canGenerate;
  const metadata = asset.storyboard?.document.scenes[sceneIndex]?.styleRecommendations;
  const eligible = canSwitchIllustrationStyle(asset, sceneIndex)
    && asset.researchObjectId === scope.researchObjectId && asset.versionId === scope.versionId;
  useEffect(() => {
    current.current = true;
    try {
      const stored = loadStyleSwitch(window.sessionStorage, scope);
      operationRef.current = stored; setOperation(stored); setReady(true);
    } catch { setError('styleStorageError'); }
    const invalidate = () => {
      current.current = false; controller.current?.abort(); clearTimeout(timer.current);
      busyRef.current = false; setBusy(false); setError('styleScopeChanged'); setReady(false);
      callbacks.current.onBusyChange?.(false);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    window.addEventListener(SESSION_INVALIDATED_EVENT, invalidate);
    return () => {
      current.current = false; controller.current?.abort(); clearTimeout(timer.current);
      callbacks.current.onBusyChange?.(false);
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
      window.removeEventListener(SESSION_INVALIDATED_EVENT, invalidate);
    };
  }, [scope.actorId, scope.researchObjectId, scope.versionId, scope.baseAssetId]);
  async function advance(value: StyleSwitchOperation, resume = false) {
    if (!current.current || !permission.current) return;
    controller.current = new AbortController();
    try {
      const status = await advanceStyleSwitch(value, window.sessionStorage,
        () => current.current && permission.current, { resume, signal: controller.current.signal });
      if (!current.current) return;
      setOperation({ ...value });
      if (status === 'waiting') { timer.current = setTimeout(() => { void advance(value); }, 1800); return; }
      if (status === 'done') callbacks.current.onSubmitted(value.imageTaskId!);
      busyRef.current = false; setBusy(false); callbacks.current.onBusyChange?.(false);
    } catch (cause) {
      if (!current.current) return;
      setOperation({ ...value });
      const message = cause instanceof Error ? cause.message : '';
      setError(['styleScopeChanged', 'styleStorageError', 'stylePermissionRequired', 'styleReviewBlocked'].includes(message) ? message : 'styleOutcomeUnknown');
      busyRef.current = false; setBusy(false); callbacks.current.onBusyChange?.(false);
    }
  }
  function start(style?: string) {
    if (!ready || !eligible || !permission.current || busyRef.current || !current.current) return;
    try {
      let value = operationRef.current;
      if (!value) {
        if (!style) return;
        value = createStyleSwitch(scope, asset, style);
        saveStyleSwitch(window.sessionStorage, value);
        operationRef.current = value;
      }
      busyRef.current = true; setBusy(true); setError(''); setOperation({ ...value }); callbacks.current.onBusyChange?.(true);
      void advance(value, true);
    } catch { setError('styleStorageError'); }
  }
  if (!metadata?.choices.length) return null;
  return <section className="mt-3 border-t border-os-rule-paper pt-3" aria-label={t('title')} aria-busy={busy}>
    <p className="text-sm font-medium text-os-ink">{t('title')}</p>
    <ul className="mt-2 space-y-2">
      {metadata.choices.map(choice => <li key={choice.styleId} className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{choice.name}
          {choice.styleId === metadata.selectedStyleId && <span className="ml-2 text-xs text-os-vermilion-ink">{t('active')}</span>}</p>
          <p className="text-sm text-os-muted-paper">{choice.reason}</p></div>
        {choice.styleId !== metadata.selectedStyleId && <button type="button" className="min-h-11 rounded px-3 text-sm font-medium text-os-vermilion-ink focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
          disabled={!ready || !eligible || !canWrite || !canGenerate || busy || Boolean(operation)} onClick={() => start(choice.styleId)}>{t('switchAndGenerate')}</button>}
      </li>)}
    </ul>
    {!canGenerate && <p className="mt-2 text-sm text-os-muted-paper">{t('stylePermissionRequired')}</p>}
    {!eligible && <p className="mt-2 text-sm text-os-muted-paper">{t('singleSceneOnly')}</p>}
    {busy && <p role="status" className="mt-2 text-sm">{t('working')}</p>}
    {error && <p role="alert" className="mt-2 text-sm">{t(error)}</p>}
    {operation && !busy && operation.phase !== 'done' && <button type="button" className="mt-2 min-h-11 text-sm font-medium text-os-vermilion-ink"
      disabled={!ready || !canWrite || !canGenerate} onClick={() => start()}>{t('continueSameOperation')}</button>}
    {operation?.phase === 'done' && <p role="status" className="mt-2 text-sm">{t('imageQueued')}</p>}
  </section>;
}

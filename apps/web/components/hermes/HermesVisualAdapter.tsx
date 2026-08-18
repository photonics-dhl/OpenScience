'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { HermesPetMeshInput } from '@/lib/hermes/pet-mesh-renderer';
import type { HermesActionId } from '@/lib/hermes/action-catalog';
import type { HermesRuntimeStatus } from '@/lib/hermes/hermes-runtime-status';

import { HermesRiggedPortrait } from './HermesRiggedPortrait';
import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';

function HermesStaticPortrait({ state }: { state: HermesVisualState }) {
  const nodes = [
    [180, 76], [264, 128], [264, 226], [180, 278], [96, 226], [96, 128],
  ];

  return (
    <svg aria-hidden="true" className="hermes-portrait h-full w-full" viewBox="0 0 360 360">
      <defs>
        <linearGradient id="hermes-scan" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".5" stopColor="currentColor" stopOpacity=".85" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hermes-iris">
          <stop offset="0" stopColor="#ff4e22" stopOpacity=".95" />
          <stop offset=".28" stopColor="#ff4e22" stopOpacity=".18" />
          <stop offset="1" stopColor="#f1eee7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="hermes-orbit">
        <circle cx="180" cy="177" r="116" fill="none" stroke="currentColor" strokeDasharray="1 12" strokeOpacity=".2" />
        <path d="M70 177c42-29 72-43 110-43s68 14 110 43c-42 29-72 43-110 43s-68-14-110-43Z" fill="none" stroke="currentColor" strokeOpacity=".22" />
      </g>
      <g className="hermes-nodes">
        {nodes.map(([cx, cy], index) => <circle cx={cx} cy={cy} fill={index === 0 ? '#ff4e22' : 'currentColor'} key={`${cx}-${cy}`} opacity={index === 0 ? 1 : 0.5} r={index === 0 ? 3 : 2} style={{ animationDelay: `${index * 90}ms` }} />)}
      </g>
      <g className="hermes-gaze" data-hermes-gaze="true">
        <path d="M119 177c18-31 37-47 61-47s43 16 61 47c-18 31-37 47-61 47s-43-16-61-47Z" fill="#070a0d" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="180" cy="177" fill="url(#hermes-iris)" r="43" />
        <circle className="hermes-pupil" cx="180" cy="177" fill="currentColor" r="9" />
        <path d="M151 177h58M180 148v58" stroke="currentColor" strokeOpacity=".24" strokeWidth=".8" />
      </g>
      <path className="hermes-wave" d="M48 177h53m158 0h53" fill="none" stroke="currentColor" strokeDasharray="2 7" strokeOpacity=".36" />
      <path className="hermes-scan" d="M50 106h260" stroke="url(#hermes-scan)" strokeWidth="2" data-hermes-scan={state === 'scanning' ? 'active' : 'still'} />
      <g className="hermes-caption" fill="none" stroke="currentColor" strokeOpacity=".22">
        <path d="M113 307h134" />
        <path d="M139 320h82" />
      </g>
    </svg>
  );
}

export interface HermesVisualAdapterProps {
  action?: HermesActionId;
  actionStartedAtMs?: number;
  assistantOpen?: boolean;
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  onInvoke: () => void;
  onRuntimeStatus?: (status: HermesRuntimeStatus) => void;
  reducedMotion: boolean;
  rendererGeneration?: number;
}

export function HermesVisualAdapter({ action, actionStartedAtMs, assistantOpen = false, state, suggestion, onInvoke, onRuntimeStatus, reducedMotion, rendererGeneration }: HermesVisualAdapterProps) {
  const t = useTranslations('dashboard.hermes');
  const linkRef = useRef<HTMLButtonElement>(null);
  const engagedRef = useRef(false);
  const meshInputRef = useRef<HermesPetMeshInput>({ engaged: false, pointer: { x: 0, y: 0 }, state });
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const promptPlayedRef = useRef(false);
  const still = state === 'awaiting_approval';
  const presence = still ? 'still' : state === 'scanning' ? 'working' : assistantOpen ? 'open' : engaged ? 'attentive' : 'idle';
  meshInputRef.current.action = action;
  meshInputRef.current.actionStartedAtMs = actionStartedAtMs;

  const updateEngaged = (value: boolean) => {
    if (engagedRef.current === value) return;
    engagedRef.current = value;
    setEngaged(value);
  };

  const resetArticulation = () => {
    meshInputRef.current = { ...meshInputRef.current, engaged: false, pointer: { x: 0, y: 0 }, state };
    linkRef.current?.style.setProperty('--hermes-pointer-x', '0px');
    linkRef.current?.style.setProperty('--hermes-pointer-y', '0px');
  };

  const engageArticulation = (pointer = { x: .28, y: -.18 }) => {
    if (still || !interactiveReady) return;
    updateEngaged(true);
    meshInputRef.current = { ...meshInputRef.current, engaged: true, pointer, state };
    linkRef.current?.style.setProperty('--hermes-pointer-x', `${pointer.x * 14}px`);
    linkRef.current?.style.setProperty('--hermes-pointer-y', `${pointer.y * 10}px`);
  };

  useEffect(() => {
    if (assistantOpen) engageArticulation({ x: .42, y: -.12 });
  }, [assistantOpen, interactiveReady, still, state]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (still || reducedMotion) {
        setInteractiveReady(false);
        updateEngaged(false);
        resetArticulation();
        return;
      }
      timer = window.setTimeout(() => {
        if (!cancelled) setInteractiveReady(true);
      }, 0);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('load', schedule);
    };
  }, [reducedMotion, still]);

  useEffect(() => {
    if (still || assistantOpen) {
      setPromptVisible(false);
      return;
    }
    if (reducedMotion) {
      setPromptVisible(true);
      return;
    }
    if (promptPlayedRef.current) {
      setPromptVisible(false);
      return;
    }
    let revealTimer = 0;
    let hideTimer = 0;
    const schedule = () => {
      window.clearTimeout(revealTimer);
      if (document.hidden || promptPlayedRef.current) return;
      revealTimer = window.setTimeout(() => {
        promptPlayedRef.current = true;
        setPromptVisible(true);
        hideTimer = window.setTimeout(() => setPromptVisible(false), 7600);
      }, 1800);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(revealTimer);
        window.clearTimeout(hideTimer);
        setPromptVisible(false);
      } else schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(hideTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [assistantOpen, reducedMotion, still]);

  const setGaze = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (still || !interactiveReady) return;
    updateEngaged(true);
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    meshInputRef.current = { ...meshInputRef.current, engaged: true, pointer: { x, y }, state };
    linkRef.current?.style.setProperty('--hermes-pointer-x', `${x * 14}px`);
    linkRef.current?.style.setProperty('--hermes-pointer-y', `${y * 10}px`);
  };

  const resetGaze = () => {
    if (assistantOpen) {
      engageArticulation({ x: .42, y: -.12 });
      return;
    }
    updateEngaged(false);
    resetArticulation();
  };

  return (
    <button
      aria-label={t('guide.invoke')}
      className="hermes-visual group relative block min-h-72 w-full overflow-hidden border-b border-os-rule-dark text-left text-os-paper outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion"
      onClick={onInvoke}
      ref={linkRef}
      type="button"
      data-hermes-fallback="static"
      data-hermes-renderer="articulated-mesh"
      data-hermes-state={state}
      data-hermes-engaged={engaged ? 'true' : 'false'}
      data-hermes-presence={presence}
      data-motion={still ? 'still' : 'responsive'}
      data-hermes-input-ready={interactiveReady ? 'true' : 'false'}
      data-hermes-input-owner="true"
      onPointerEnter={() => engageArticulation()}
      onPointerLeave={resetGaze}
      onPointerMove={setGaze}
      onFocus={() => engageArticulation()}
      onBlur={resetGaze}
    >
      <span className="absolute left-0 top-0 z-10 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-os-muted-dark">Hermes / {state.replaceAll('_', ' ')}</span>
      <span className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-between gap-4 border-t border-os-rule-dark pt-3 text-xs text-os-muted-dark">
        <span className="truncate">{t(suggestion.titleKey)}</span><span className="shrink-0 text-os-vermilion transition-transform group-hover:translate-x-1 motion-reduce:transform-none">{t('guide.invoke')} →</span>
      </span>
      <span
        className="hermes-companion-actor absolute inset-x-2 bottom-9 top-9 flex justify-center text-os-paper"
        data-hermes-companion-actor="true"
        data-hermes-instance="single"
      >
        <HermesRiggedPortrait
          fallback={<HermesStaticPortrait state={state} />}
          inputRef={meshInputRef}
          onRuntimeStatus={onRuntimeStatus}
          reducedMotion={reducedMotion}
          rendererGeneration={rendererGeneration}
          state={state}
        />
      </span>
      <span aria-hidden={!promptVisible} className="hermes-guide-nudge" data-visible={promptVisible ? 'true' : 'false'}>{t(suggestion.bodyKey)}</span>
    </button>
  );
}

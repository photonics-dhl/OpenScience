'use client';

import { useEffect, useRef } from 'react';

import type { HermesAnchorId } from '@/lib/hermes/anchor-registry';

export type HermesDraftTarget = 'sdf-problem' | 'sdf-insight' | 'sdf-method' | 'sdf-evidence' | 'sdf-results' | 'sdf-limitations';
export interface HermesDraftAction { action: 'draft' | 'check'; target: HermesDraftTarget }

const TARGETS = new Set<HermesDraftTarget>(['sdf-problem', 'sdf-insight', 'sdf-method', 'sdf-evidence', 'sdf-results', 'sdf-limitations']);

export function parseHermesDraftAction(value: unknown): HermesDraftAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => key !== 'action' && key !== 'target')) return null;
  if (candidate.action !== 'draft' && candidate.action !== 'check') return null;
  if (typeof candidate.target !== 'string' || !TARGETS.has(candidate.target as HermesDraftTarget)) return null;
  return { action: candidate.action, target: candidate.target as HermesDraftTarget };
}

export function dispatchHermesGuideAction(action: 'explain' | 'draft' | 'check', target: HermesAnchorId) {
  window.dispatchEvent(new CustomEvent('hermes:guide-action', { detail: { action, target } }));
}

export function HermesDraftDiff({ disabled = false, onCheck, onDraft }: {
  disabled?: boolean;
  onCheck: (target: HermesDraftTarget) => void;
  onDraft: (target: HermesDraftTarget) => void;
}) {
  const dispatchingDraftRef = useRef(false);
  useEffect(() => {
    const receive = (event: Event) => {
      const action = parseHermesDraftAction((event as CustomEvent<unknown>).detail);
      if (!action || disabled) return;
      if (action.action === 'draft') {
        if (dispatchingDraftRef.current) return;
        dispatchingDraftRef.current = true;
        queueMicrotask(() => { dispatchingDraftRef.current = false; });
        onDraft(action.target);
      } else onCheck(action.target);
    };
    window.addEventListener('hermes:guide-action', receive);
    return () => window.removeEventListener('hermes:guide-action', receive);
  }, [disabled, onCheck, onDraft]);
  return null;
}

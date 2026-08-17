'use client';

import { useLayoutEffect, useRef } from 'react';

import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';
import { useHermesWorkspaceStage } from './HermesWorkspaceStage';

export function HermesDockAnchor({ assistantOpen = false, onInvoke, state, suggestion, workspaceId = 'workspace-current' }: {
  assistantOpen?: boolean;
  onInvoke: () => void;
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  workspaceId?: string;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const { register } = useHermesWorkspaceStage();
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    return register({ anchor, assistantOpen, onInvoke, state, suggestion, workspaceId });
  }, [assistantOpen, onInvoke, register, state, suggestion, workspaceId]);
  return <div aria-hidden="true" className="hermes-dock-anchor" data-hermes-dock-anchor="true" ref={anchorRef} />;
}

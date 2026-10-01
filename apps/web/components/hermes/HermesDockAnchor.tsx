'use client';

import * as React from 'react';

import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';
import { useOptionalHermesWorkspaceStage } from './HermesWorkspaceStage';

const useClientLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export function HermesDockAnchor({ assistantOpen = false, floating = true, onInvoke, state, suggestion, workspaceId = 'workspace-current' }: {
  assistantOpen?: boolean;
  floating?: boolean;
  onInvoke: () => void;
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  workspaceId?: string;
}) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const stage = useOptionalHermesWorkspaceStage();
  useClientLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !stage) return;
    return stage.register({ anchor, assistantOpen, floating, onInvoke, state, suggestion, workspaceId });
  }, [assistantOpen, floating, onInvoke, stage, state, suggestion, workspaceId]);
  return <div className={floating ? undefined : 'hermes-dock-anchor'} data-hermes-companion-margin={floating ? undefined : 'true'} data-hermes-dock-anchor="true" data-hermes-floating-owner={floating ? 'true' : undefined} hidden={floating} ref={anchorRef} />;
}

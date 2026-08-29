'use client';

import * as React from 'react';

import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';
import { useOptionalHermesWorkspaceStage } from './HermesWorkspaceStage';

export function HermesDockAnchor({ assistantOpen = false, onInvoke, state, suggestion, workspaceId = 'workspace-current' }: {
  assistantOpen?: boolean;
  onInvoke: () => void;
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  workspaceId?: string;
}) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const stage = useOptionalHermesWorkspaceStage();
  React.useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !stage) return;
    return stage.register({ anchor, assistantOpen, onInvoke, state, suggestion, workspaceId });
  }, [assistantOpen, onInvoke, stage, state, suggestion, workspaceId]);
  return <div className="hermes-dock-anchor" data-hermes-companion-margin="true" data-hermes-dock-anchor="true" ref={anchorRef} />;
}

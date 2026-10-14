'use client';

import { createContext, useContext, type MutableRefObject } from 'react';
import type { HermesAnchorId, HermesAnchorRegistration } from '@/lib/hermes/anchor-registry';
import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';

export interface HermesStagePresentation {
  anchor: HTMLElement;
  assistantOpen: boolean;
  floating?: boolean;
  usesFallbackAssistant?: boolean;
  presentation?: 'default' | 'dashboard-seat';
  invocationRef?: MutableRefObject<HTMLElement | null>;
  onInvoke: () => void;
  state?: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  workspaceId: string;
}

interface HermesWorkspaceStageContextValue {
  openCompanion(): void;
  register(presentation: HermesStagePresentation): () => void;
  registerAnchor(registration: HermesAnchorRegistration): () => void;
  requestGuide(target: HermesAnchorId | null): void;
  setRouteState(state: HermesVisualState): void;
  setWriting(writing: boolean): void;
  companionOpen: boolean;
}

export const HermesWorkspaceStageContext = createContext<HermesWorkspaceStageContextValue | null>(null);

export function useOptionalHermesWorkspaceStage() {
  return useContext(HermesWorkspaceStageContext);
}

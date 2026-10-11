'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { hermesStartsCompact, hermesUsesAvatarEntry } from '@/lib/hermes/companion-surface';

import type { HermesGuideSuggestion } from './hermes-guide';
import type { HermesVisualState } from './hermes-state';
import { useOptionalHermesWorkspaceStage } from './HermesWorkspaceStage';

const useClientLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export function HermesDockAnchor({ assistantOpen = false, floating = true, usesFallbackAssistant = false, onInvoke, state, suggestion, workspaceId = 'workspace-current' }: {
  assistantOpen?: boolean;
  floating?: boolean;
  usesFallbackAssistant?: boolean;
  onInvoke: () => void;
  state?: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  workspaceId?: string;
}) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const invocationRef = React.useRef<HTMLElement | null>(null);
  const pathname = usePathname();
  const compactContext = hermesStartsCompact(pathname);
  const avatarEntry = hermesUsesAvatarEntry(pathname);
  const t = useTranslations('hermesCompanion');
  const ts = useTranslations('dashboard.hermes.states');
  const entryState = state ?? 'idle';
  const stage = useOptionalHermesWorkspaceStage();
  useClientLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !stage) return;
    return stage.register({ anchor, assistantOpen, floating, usesFallbackAssistant, invocationRef, onInvoke, state, suggestion, workspaceId });
  }, [assistantOpen, floating, usesFallbackAssistant, onInvoke, stage, state, suggestion, workspaceId]);
  const anchor = <div className={floating && !avatarEntry ? 'hermes-dock-anchor hermes-dock-anchor--floating' : 'hermes-dock-anchor'} data-hermes-companion-margin={floating && !avatarEntry ? undefined : 'true'} data-hermes-dock-anchor="true" data-hermes-floating-owner={/\/edit\/?$/.test(pathname) ? 'editor' : floating ? 'true' : undefined} data-hermes-compact-context={compactContext ? 'true' : undefined} data-hermes-avatar-anchor={avatarEntry ? 'true' : undefined} ref={anchorRef} />;
  if (avatarEntry) return <div className="hermes-avatar-entry" data-hermes-avatar-entry="true" data-hermes-entry-open={assistantOpen ? 'true' : 'false'} data-hermes-entry-state={entryState}>
    {anchor}
    <button className="hermes-avatar-entry-label" type="button" aria-haspopup="dialog" aria-expanded={assistantOpen} aria-label={`${t('openConversation')} · ${ts(entryState)}`} onClick={(event) => { invocationRef.current = event.currentTarget; onInvoke(); }}>
      <span>Hermes</span><small>{entryState === 'idle' ? t('openConversation') : ts(entryState)}</small>
    </button>
  </div>;
  if (floating || !compactContext) return anchor;
  return <div className="hermes-anchored-entry">
    {anchor}
    <div className="hermes-anchored-entry-copy">
      <p>Hermes</p>
      <span>{t('entryHint')}</span>
      <button type="button" aria-haspopup="dialog" onClick={onInvoke}>{t('openConversation')}<ArrowUpRight size={15} aria-hidden="true" /></button>
    </div>
  </div>;
}

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { getDashboardPageCopy } from '@/lib/dashboard-page-copy';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import type { HermesGuideSuggestion } from '@/components/hermes/hermes-guide';
import type { HermesVisualState } from '@/components/hermes/hermes-state';
import styles from '@/app/dashboard/dashboard.module.css';

export function HermesConversationCard({ onInvoke, open = false, working = false, hasResearch = true, state, suggestion }: {
  onInvoke(): void; open?: boolean; working?: boolean; hasResearch?: boolean;
  state?: HermesVisualState; suggestion: HermesGuideSuggestion;
}) {
  const t = useTranslations('dashboard.hermes');
  const copy = getDashboardPageCopy(useLocale());
  return (
    <section className={`hermes-conversation-card ${styles.hermesConversation}`} aria-label={t('conversation.label')} data-hermes-protected="true">
      <HermesDockAnchor floating={false} assistantOpen={open} onInvoke={onInvoke}
        state={state} suggestion={suggestion} presentation="dashboard-seat"
        entryLabel={copy.openConversation} entryHint={working ? t('taskStates.working') : hasResearch ? copy.hermesBody : copy.hermesEmptyBody} />
    </section>
  );
}

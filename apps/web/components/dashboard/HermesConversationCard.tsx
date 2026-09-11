'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

export function HermesConversationCard({ children }: { children: React.ReactNode }) {
  const t = useTranslations('dashboard.hermes');

  return (
    <section className="hermes-conversation-card" aria-label={t('conversation.label')} data-hermes-protected="true">
      {children}
    </section>
  );
}

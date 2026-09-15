'use client';

import { useTranslations } from 'next-intl';

export function HermesConversationCard({ onInvoke, working = false }: { onInvoke(): void; working?: boolean }) {
  const t = useTranslations('dashboard.hermes');
  return <section className="hermes-conversation-card" aria-label={t('conversation.label')}>
    <img src="/hermes/wanko-static-transparent.png" width={104} height={120} alt="Hermes" />
    <div><h2>Hermes</h2><p>{t(working ? 'taskStates.working' : 'conversation.body')}</p>
      <button type="button" onClick={onInvoke}>{t('conversation.label')} <span aria-hidden="true">→</span></button>
    </div>
  </section>;
}

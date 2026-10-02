'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import styles from '@/app/dashboard/dashboard.module.css';

export function HermesConversationCard({ onInvoke, open = false, working = false }: { onInvoke(): void; open?: boolean; working?: boolean }) {
  const t = useTranslations('dashboard.hermes');
  return (
    <section className={`hermes-conversation-card ${styles.hermesConversation}`} aria-label={t('conversation.label')} data-hermes-protected="true">
      <div className={styles.hermesIdentity}>
        <div>
          <h2 className={styles.hermesTitle}>Hermes</h2>
          <p className={styles.hermesMessage} aria-live="polite">{t(working ? 'taskStates.working' : 'conversation.body')}</p>
        </div>
      </div>
      <button className={styles.primaryAction} type="button" onClick={onInvoke} aria-haspopup="dialog" aria-expanded={open}>
        {t('conversation.label')}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
}

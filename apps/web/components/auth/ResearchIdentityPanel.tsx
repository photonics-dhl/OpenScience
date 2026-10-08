'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import styles from './Identity.module.css';

interface ResearchIdentityPanelProps {
  description: string;
  eyebrow: string;
  intent: 'create' | 'return';
  tagline: string;
  title: string;
}

function ResearchIdentityPanel({ description, eyebrow, intent, tagline, title }: ResearchIdentityPanelProps) {
  const router = useRouter();
  const openDesk = React.useCallback(() => router.push('/dashboard'), [router]);
  return (
    <section className={styles.welcome} data-research-identity-context={intent}>
      <div data-hermes-protected="true">
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.companion}><HermesDockAnchor floating={false} onInvoke={openDesk} state="idle"
        suggestion={{ kind: 'neutral', bodyKey: 'guide.neutral.body', titleKey: 'guide.neutral.title' }} /></div>
      <p className={styles.tagline}>{tagline}</p>
    </section>
  );
}

export { ResearchIdentityPanel };

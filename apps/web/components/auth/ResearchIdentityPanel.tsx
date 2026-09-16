import * as React from 'react';
import Image from 'next/image';
import styles from './Identity.module.css';

interface ResearchIdentityPanelProps {
  description: string;
  eyebrow: string;
  intent: 'create' | 'return';
  tagline: string;
  title: string;
}

function ResearchIdentityPanel({ description, eyebrow, intent, tagline, title }: ResearchIdentityPanelProps) {
  return (
    <section className={styles.welcome} data-research-identity-context={intent}>
      <Image className={styles.mascot} src="/hermes/wanko-static.png" width={240} height={280} alt="" unoptimized />
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      <p className={styles.description}>{description}</p>
      <p className={styles.tagline}>{tagline}</p>
    </section>
  );
}

export { ResearchIdentityPanel };

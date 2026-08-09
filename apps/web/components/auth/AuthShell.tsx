import type { ReactNode } from 'react';
import Link from 'next/link';
import EvidenceField from '../landing/EvidenceField';

export default function AuthShell({ eyebrow, title, description, modeLabel, homeLabel, principlesLabel, principles, children }: {
  eyebrow: string;
  title: string;
  description: string;
  modeLabel: string;
  homeLabel: string;
  principlesLabel: string;
  principles: [string, string, string];
  children: ReactNode;
}) {
  return (
    <main className="auth-observatory">
      <EvidenceField />
      <div className="auth-observatory__veil" aria-hidden="true" />
      <header className="auth-brand">
        <Link href="/" aria-label={homeLabel}>
          <img src="/logo.svg" alt="" />
          <span>OpenScience</span>
        </Link>
        <span className="auth-brand__mode">{modeLabel}</span>
      </header>
      <section className="auth-observatory__layout">
        <div className="auth-thesis">
          <div className="auth-thesis__visual" aria-hidden="true">
            <img src="/hero/ro-symbol.webp" alt="" />
            <span className="auth-thesis__visual-label">RO / evolving research object</span>
          </div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <dl className="auth-ledger" aria-label={principlesLabel}>
            {principles.map((principle, index) => <div key={principle}><dt>0{index + 1}</dt><dd>{principle}</dd></div>)}
          </dl>
        </div>
        <div className="auth-panel">{children}</div>
      </section>
    </main>
  );
}

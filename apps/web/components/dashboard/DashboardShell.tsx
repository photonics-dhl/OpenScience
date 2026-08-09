'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import EvidenceField from '../landing/EvidenceField';

const roId = 'OS-RO-01J8YF7Q';

export default function DashboardShell() {
  const t = useTranslations('dashboard');
  return (
    <main className="cockpit-shell" data-cockpit="dashboard">
      <EvidenceField />
      <div className="cockpit-shell__inner">
        <header className="cockpit-header">
          <div><span className="eyebrow">OpenScience / research cockpit</span><h1>{t('title')}</h1></div>
          <div className="cockpit-header__status"><span className="status-dot" />{t('hermesReady')}</div>
        </header>
        <section className="cockpit-grid">
          <article className="next-action-panel" data-next-action>
            <span className="eyebrow">{t('nextAction.eyebrow')}</span>
            <h2>{t('nextAction.title')}</h2>
            <p>{t('nextAction.description')}</p>
            <Link className="button button-primary" href={`/research-objects/${roId}/workspace`}>{t('nextAction.cta')}</Link>
            <div className="action-progress"><span style={{ width: '68%' }} /></div>
            <small>{t('nextAction.progress')}</small>
          </article>
          <article className="ro-focus-card">
            <div className="ro-focus-card__top"><span className="badge badge-blue">{t('ro.draft')}</span><span className="mono">v0.4</span></div>
            <p className="eyebrow">Research object</p><h2>{t('ro.title')}</h2><p className="ro-focus-card__id mono">{roId}</p>
            <div className="evidence-ledger"><span>01 PAPER</span><span>02 DATA</span><span>03 CODE</span></div>
            <div className="ro-focus-card__footer"><span>{t('ro.updated')}</span><span className="mono">{t('ro.versioned')}</span></div>
          </article>
          <aside className="task-rail" data-task-rail>
            <div className="task-rail__heading"><span className="eyebrow">{t('tasks.eyebrow')}</span><span className="badge badge-muted">3</span></div>
            <div className="task-item task-item--active"><span className="task-index">01</span><div><strong>{t('tasks.extract')}</strong><small>{t('tasks.extractMeta')}</small></div><span className="task-state" /></div>
            <div className="task-item"><span className="task-index">02</span><div><strong>{t('tasks.review')}</strong><small>{t('tasks.reviewMeta')}</small></div></div>
            <div className="task-item"><span className="task-index">03</span><div><strong>{t('tasks.publish')}</strong><small>{t('tasks.publishMeta')}</small></div></div>
          </aside>
        </section>
      </div>
    </main>
  );
}

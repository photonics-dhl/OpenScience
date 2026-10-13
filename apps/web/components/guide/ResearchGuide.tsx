'use client';
import * as React from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowUpRight, ChevronDown, FolderOpen } from 'lucide-react';
import { GuideResearchWorkspace } from './GuideResearchWorkspace';
import { guidePageCopy } from '@/lib/guide-page-copy';
import styles from './research-guide.module.css';

export function ResearchGuide() {
  const locale = useLocale();
  const t = guidePageCopy[locale === 'en' ? 'en' : 'zh'];
  return <article className={styles.guide}>
    <header className={styles.hero}>
      <div className={styles.topline}>
        <p className={styles.eyebrow}>{t.pageName}</p>
        <Link href="/dashboard" className={styles.workspaceLink}><FolderOpen size={17} aria-hidden="true" />{t.workspace}<ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
      <h1 lang="en">{t.slogan}</h1>
      <p className={styles.lead}>{t.subtitle}</p>
    </header>
    <section className={styles.lifecycle} aria-labelledby="guide-lifecycle-title">
      <div className={styles.lifecycleIntro}>
        <p className={styles.eyebrow}>P04 → P05</p>
        <h2 id="guide-lifecycle-title">{t.lifecycle.title}</h2>
        <p>{t.lifecycle.intro}</p>
      </div>
      <ol className={styles.lifecycleList}>
        {t.lifecycle.nodes.map((node) => <li key={node.id} className={styles.lifecycleItem}>
          <details>
            <summary><span className={styles.nodeId}>{node.id}</span><span className={styles.nodeTitle}>{node.title}</span><ChevronDown size={16} aria-hidden="true" /></summary>
            <div className={styles.nodeBody}>
              <p className={styles.nodeSummary}>{node.summary}</p>
              <p>{node.detail}</p>
              <dl className={styles.nodeMeta}>
                <div><dt>{t.lifecycle.roleLabel}</dt><dd>{node.roles}</dd></div>
                <div><dt>{t.lifecycle.entryLabel}</dt><dd><Link href={node.href}>{node.entry}<ArrowUpRight size={14} aria-hidden="true" /></Link></dd></div>
              </dl>
            </div>
          </details>
        </li>)}
      </ol>
    </section>
    <GuideResearchWorkspace />
    <div className={styles.example}>
      <span>{t.exampleHint}</span>
      <Link href="/research/OSR-2026-000022/v/4" target="_blank" rel="noopener noreferrer">{t.example}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only">{t.newTab}</span></Link>
    </div>
    <section className={styles.support} aria-labelledby="guide-questions">
      <h2 id="guide-questions">{t.faqTitle}</h2>
      <div className={styles.questions}>{t.questions.map(question => <details key={question.title}>
        <summary>{question.title}<ChevronDown size={16} aria-hidden="true" /></summary>
        <p>{question.body}</p>
      </details>)}</div>
    </section>
  </article>;
}

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

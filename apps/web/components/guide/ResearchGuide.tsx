'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import styles from './research-guide.module.css';

const lessons = ['desk', 'start', 'hermes', 'confirm', 'express', 'publish'] as const;
const fieldKeys = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
function subscribeViewport(notify: () => void) {
  const query = window.matchMedia('(min-width:1024px)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
function wideViewport() { return window.matchMedia('(min-width:1024px)').matches; }

export function ResearchGuide() {
  const t = useTranslations('productGuide');
  const [selected, setSelected] = React.useState(0);
  const wide = React.useSyncExternalStore(subscribeViewport, wideViewport, () => true);
  const id = React.useId();
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const focusHeading = React.useRef(false);
  const lesson = lessons[selected];
  React.useEffect(() => {
    if (focusHeading.current) { heading.current?.focus(); focusHeading.current = false; }
  }, [selected]);
  function selectNext(index: number) { focusHeading.current = true; setSelected(index); }
  function moveFocus(event: React.KeyboardEvent, index: number) {
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % lessons.length;
    else if (event.key === 'ArrowUp') next = (index + lessons.length - 1) % lessons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lessons.length - 1;
    else return;
    event.preventDefault(); tabs.current[next]?.focus();
  }
  return <article className={styles.guide}>
    <header className={styles.intro}>
      <div>
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.lead}>{t('intro')}</p>
        <Link href="/dashboard" className={styles.primary}>{t('desk')}<ArrowUpRight size={18} aria-hidden="true" /></Link>
        <p className={styles.startNote}>{t('startNote')}</p>
        <p className={styles.boundary}>{t('boundary')}</p>
      </div>
      <figure className={styles.evolution}>
        <div className={styles.sheets} aria-hidden="true">{[0, 1, 2].map(index => <span className={styles.sheet} data-layer={index} key={index}><i /><i /><i /><i /><b /></span>)}</div>
        <figcaption><strong>{t('motifTitle')}</strong><span>{t('motifCaption')}</span></figcaption>
      </figure>
    </header>
    <section className={styles.manual} aria-label={t('journey')}>
      <div className={styles.index}>
        <p className={styles.eyebrow}>{t('journey')}</p>
        <div className={styles.desktopIndex} role="tablist" aria-orientation="vertical" aria-label={t('journey')}>
          {lessons.map((key, index) => <button key={key} type="button" role="tab" id={`${id}-tab-${key}`} aria-selected={index === selected} aria-controls={`${id}-lesson`} tabIndex={index === selected ? 0 : -1} ref={element => { tabs.current[index] = element; }} onKeyDown={event => moveFocus(event, index)} onClick={() => setSelected(index)}>
            <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{t(`lessons.${key}.title`)}</span><ArrowRight size={16} aria-hidden="true" />
          </button>)}
        </div>
        <label className={styles.mobileIndex}>{t('choose')}<select value={lesson} onChange={event => setSelected(lessons.indexOf(event.target.value as typeof lesson))}>{lessons.map((key, index) => <option key={key} value={key}>{String(index + 1).padStart(2, '0')} {t(`lessons.${key}.title`)}</option>)}</select></label>
        <p className={styles.indexNote}>{t('indexNote')}</p>
      </div>
      <section className={styles.lesson} role={wide ? 'tabpanel' : 'region'} id={`${id}-lesson`} aria-labelledby={wide ? `${id}-tab-${lesson}` : `${id}-heading`} tabIndex={wide ? 0 : undefined}>
        <div key={lesson} className={styles.lessonContent} data-guide-lesson={lesson}>
          <p className={styles.position}>{t('position', { current: selected + 1, total: lessons.length })}</p>
          <h2 id={`${id}-heading`} ref={heading} tabIndex={-1}>{t(`lessons.${lesson}.title`)}</h2>
          <p className={styles.task}>{t(`lessons.${lesson}.task`)}</p>
          <p className={styles.body}>{t(`lessons.${lesson}.body`)}</p>
          <figure className={styles.example}>
            <figcaption>{t('exampleTag')}</figcaption>
            <h3>{t('exampleTitle')}</h3>
            <p>{t(`lessons.${lesson}.example`)}</p>
          </figure>
          <details className={styles.detail} key={`${lesson}-detail`}>
            <summary>{t(`lessons.${lesson}.extraTitle`)}<ChevronDown size={16} aria-hidden="true" /></summary>
            {lesson === 'hermes' ? <dl>{fieldKeys.map(key => <div key={key}><dt>{t(`fieldList.${key}.title`)}</dt><dd>{t(`fieldList.${key}.body`)}</dd></div>)}</dl> : <p>{t(`lessons.${lesson}.extra`)}</p>}
          </details>
        </div>
        <footer className={styles.lessonFooter}>
          <div><button type="button" disabled={selected === 0} onClick={() => selectNext(selected - 1)}><ArrowLeft size={16} aria-hidden="true" />{t('previous')}</button><button type="button" disabled={selected === lessons.length - 1} onClick={() => selectNext(selected + 1)}>{t('next')}<ArrowRight size={16} aria-hidden="true" /></button></div>
          <Link href="/dashboard">{t('deskAgain')}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </footer>
      </section>
    </section>
    <footer className={styles.resources}><span>{t('readerPrompt')}</span><Link href="/explore">{t('explore')}<ArrowUpRight size={16} aria-hidden="true" /></Link><Link href="/developers">{t('developers')}<ArrowUpRight size={16} aria-hidden="true" /></Link></footer>
  </article>;
}

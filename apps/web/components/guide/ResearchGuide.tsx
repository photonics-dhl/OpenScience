'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, FileText, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScientificText, scientificTextExcerpt } from '@/components/content/ScientificText';
import { getExploreIndex, type ResearchIndexItemApi } from '@/lib/api';
import styles from './research-guide.module.css';

const scenes = ['start', 'read', 'revise'] as const;
const questions = ['blank', 'edit', 'source'] as const;

function HermesPortrait() {
  return <img className={styles.hermes} src="/hermes/wanko-static-transparent.png" width={156} height={190} alt="Hermes" />;
}

export function ResearchGuide() {
  const t = useTranslations('productGuide');
  const [selected, setSelected] = React.useState(0);
  const [example, setExample] = React.useState<ResearchIndexItemApi | null>(null);
  const [loadState, setLoadState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [attempt, setAttempt] = React.useState(0);
  const [imageFailed, setImageFailed] = React.useState(false);
  const id = React.useId();
  const tabs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const scene = scenes[selected];

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setLoadState('loading');
    void getExploreIndex({ limit: 3 }, controller.signal).then(result => {
      if (!active) return;
      const illustrated = result.items.filter(item => item.thumbnail);
      setExample(illustrated.find(item => item.publicId === 'OSR-2026-000022') ?? illustrated[0] ?? result.items[0] ?? null);
      setImageFailed(false);
      setLoadState('ready');
    }).catch(() => { if (active) setLoadState('unavailable'); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  function moveScene(event: React.KeyboardEvent, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % scenes.length;
    else if (event.key === 'ArrowLeft') next = (index + scenes.length - 1) % scenes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = scenes.length - 1;
    else return;
    event.preventDefault(); setSelected(next); tabs.current[next]?.focus();
  }

  const title = example ? <ScientificText as="h2" hideSourceMarkers className={styles.researchTitle}>{example.title}</ScientificText> : <h2 className={styles.researchTitle}>{t('exampleFallback')}</h2>;
  const image = example?.thumbnail && !imageFailed ? <img src={example.thumbnail.url} alt={t('exampleAlt', { title: example.title })} width={1280} height={720} decoding="async" onError={() => setImageFailed(true)} /> : null;

  return <article className={styles.guide}>
    <header className={styles.hero}>
      <div className={styles.intro}>
        <div className={styles.identity}><HermesPortrait /><p className={styles.eyebrow}>{t('eyebrow')}</p></div>
        <h1>{t('title')}</h1>
        <p className={styles.lead}>{t('intro')}</p>
        <Link href="/dashboard" className={styles.primary}>{t('desk')}<ArrowRight size={18} aria-hidden="true" /></Link>
        <p className={styles.startNote}>{t('startNote')}</p>
      </div>
      <section className={styles.proof} aria-label={t('exampleLabel')} aria-busy={loadState === 'loading'}>
        {loadState === 'loading' ? <div role="status" className={styles.proofLoading}><p>{t('loadingExample')}</p><div className={styles.skeleton} aria-hidden="true" /></div> : <>
          <div className={styles.proofMeta}><span>{t('exampleLabel')}</span>{example ? <span>{example.authors.join(' · ')} · v{example.latestVersion}</span> : null}</div>
          {title}
          {example?.insight ? <ScientificText as="p" hideSourceMarkers className={styles.readingHook}>{scientificTextExcerpt(example.insight, 130)}</ScientificText> : <p className={styles.readingHook}>{t('exampleFallbackBody')}</p>}
          {image ? <div className={styles.scienceImage}>{image}</div> : <p className={styles.noImage}>{t(loadState === 'unavailable' ? 'exampleUnavailable' : 'exampleNoImage')}</p>}
          <div className={styles.proofFooter}>
            {loadState === 'unavailable' ? <button type="button" onClick={() => setAttempt(value => value + 1)}>{t('retryExample')}</button> : <span>{t('figureLabel')}</span>}
            <Link href={example?.url ?? '/explore'} className={styles.textLink}>{t(example ? 'readExample' : 'explore')}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </>}
      </section>
    </header>

    <section className={styles.scenes} aria-labelledby={`${id}-scenes`}>
      <div className={styles.sectionHeading}><h2 id={`${id}-scenes`}>{t('sceneHeading')}</h2><p>{t('sceneIntro')}</p></div>
      <div className={styles.tabs} role="tablist" aria-label={t('sceneHeading')}>
        {scenes.map((key, index) => <button type="button" key={key} role="tab" id={`${id}-tab-${key}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} ref={element => { tabs.current[index] = element; }} onKeyDown={event => moveScene(event, index)} onClick={() => setSelected(index)}>{t(`scenes.${key}.label`)}</button>)}
      </div>
      <section role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${scene}`} tabIndex={0} className={styles.scenePanel}>
        <div key={scene} className={styles.sceneContent}>
          <div className={styles.sceneCopy}><h3>{t(`scenes.${scene}.title`)}</h3><p>{t(`scenes.${scene}.body`)}</p></div>
          <div className={styles.demonstration}>
            <div className={styles.demoHeader}><span>OpenScience.</span><span>{t(`scenes.${scene}.label`)}</span></div>
            {scene === 'read' ? <div className={styles.readDemo}>
              {image ? <div className={styles.demoImage}>{image}</div> : <FileText size={36} aria-hidden="true" />}
              <div><h3>{example ? <ScientificText hideSourceMarkers>{example.title}</ScientificText> : t('exampleFallback')}</h3><p>{t('readDemoBody')}</p><Link href={example?.url ?? '/explore'} className={styles.textLink}>{t(example ? 'readExample' : 'explore')}<ArrowRight size={17} aria-hidden="true" /></Link></div>
            </div> : <div className={styles.workDemo}>
              <div className={styles.paperRow}><FileText size={28} aria-hidden="true" /><div><h3>{example ? <ScientificText hideSourceMarkers>{example.title}</ScientificText> : t('materials')}</h3><p>{t(scene === 'start' ? 'materials' : 'continueExpression')}</p></div></div>
              {scene === 'start' ? <div className={styles.intake}><Plus size={22} aria-hidden="true" /><div><strong>{t('create')}</strong><p>{t('createBody')}</p></div></div> : <div className={styles.composer}><HermesPortrait /><p>{t('hermesPrompt')}</p></div>}
              <Link href="/dashboard" className={styles.textLink}>{t(scene === 'start' ? 'findEntry' : 'deskAgain')}<ArrowRight size={17} aria-hidden="true" /></Link>
            </div>}
          </div>
        </div>
      </section>
    </section>

    <section className={styles.support}><h2>{t('questionsHeading')}</h2><div>{questions.map(key => <details key={key}><summary>{t(`questions.${key}.title`)}<ChevronDown size={16} aria-hidden="true" /></summary><p>{t(`questions.${key}.body`)}</p></details>)}</div></section>
    <footer className={styles.invitation}><p>{t('invitation')}</p><Link href="/dashboard" className={styles.primary}>{t('desk')}<ArrowRight size={18} aria-hidden="true" /></Link></footer>
  </article>;
}

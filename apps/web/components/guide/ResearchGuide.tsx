'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, FileText, MessageCircle, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import type { HermesGuideSuggestion } from '@/components/hermes/hermes-guide';
import { GuideOpticalMargin } from './GuideOpticalMargin';
import { ScientificText, scientificTextExcerpt } from '@/components/content/ScientificText';
import { getPublicResearchVersion, type PublicResearchVersion } from '@/lib/api';
import styles from './research-guide.module.css';

const scenes = ['start', 'read', 'revise'] as const;
const questions = ['blank', 'edit', 'source'] as const;
const guideSuggestion: HermesGuideSuggestion = { kind: 'neutral', titleKey: 'guide.neutral.title', bodyKey: 'guide.neutral.body' };
gsap.registerPlugin(useGSAP);

export function ResearchGuide() {
  const t = useTranslations('productGuide');
  const router = useRouter();
  const guideRef = React.useRef<HTMLElement>(null);
  const openDesk = React.useCallback(() => router.push('/dashboard'), [router]);
  const [selected, setSelected] = React.useState(0);
  const [sceneMotion, setSceneMotion] = React.useState<'pointer' | 'keyboard'>('keyboard');
  const [example, setExample] = React.useState<PublicResearchVersion | null>(null);
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
    void getPublicResearchVersion('OSR-2026-000022', 4, controller.signal).then(({ research }) => {
      if (!active) return;
      setExample(research);
      setImageFailed(false);
      setLoadState('ready');
    }).catch(() => { if (active) setLoadState('unavailable'); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  useGSAP(() => {
    if (!guideRef.current || sceneMotion !== 'pointer') return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const panel = guideRef.current?.querySelector('[data-guide-demonstration]');
      if (panel) gsap.fromTo(panel, { opacity: .65, y: 6 }, { opacity: 1, y: 0, duration: .24, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => media.revert();
  }, { scope: guideRef, dependencies: [selected, sceneMotion], revertOnUpdate: true });

  function moveScene(event: React.KeyboardEvent, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % scenes.length;
    else if (event.key === 'ArrowLeft') next = (index + scenes.length - 1) % scenes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = scenes.length - 1;
    else return;
    event.preventDefault(); setSceneMotion('keyboard'); setSelected(next); tabs.current[next]?.focus();
  }

  const title = example ? <ScientificText as="h2" hideSourceMarkers className={styles.researchTitle}>{example.title}</ScientificText> : <h2 className={styles.researchTitle}>{t('exampleFallback')}</h2>;
  const illustration = example?.presentationAssets.find(asset => asset.kind === 'image') ?? example?.presentationAssets.find(asset => asset.kind === 'chart' || asset.kind === 'svg');
  const illustrationTitle = illustration?.reader?.title;
  const image = illustration && example && !imageFailed ? <img src={illustration.url} alt={illustrationTitle || t('exampleAlt', { title: example.title })} width={1280} height={720} decoding="async" onError={() => setImageFailed(true)} /> : null;

  return <article ref={guideRef} className={styles.guide}>
    <div className={styles.opening}>
    <GuideOpticalMargin className={styles.opticalMargin} />
    <header className={styles.hero}>
      <div className={styles.intro} data-hermes-protected="true">
        <h1>{t('title').split('\n').map((line, index) => <span key={line} className={index === 1 ? styles.titleAccent : undefined}>{line}</span>)}</h1>
        <p className={styles.lead}>{t('intro')}</p>
        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.primary}>{t('desk')}<ArrowRight size={18} aria-hidden="true" /></Link>
          <p className={styles.startNote}>{t('startNote')}</p>
        </div>
      </div>
      <a className={styles.chapterLink} href={`#${id}-scenes`}>{t('sceneHeading')}<ArrowRight size={17} aria-hidden="true" /></a>
    </header>

    <figure className={styles.proof} data-hermes-protected="true" aria-label={t('exampleLabel')} aria-busy={loadState === 'loading'}>
        {loadState === 'loading' ? <div role="status" className={styles.proofLoading}><p>{t('loadingExample')}</p><div className={styles.skeleton} aria-hidden="true" /></div> : <>
          {example ? <div className={styles.proofMeta}><span>{t('publicResearch')} · {example.publicId}</span><span>v{example.version.versionNo}</span></div> : null}
          <div className={styles.proofLayout}>
            <div className={styles.proofCopy}>
              {title}
              {example?.version.core.insight ? <ScientificText as="p" hideSourceMarkers className={styles.readingHook}>{scientificTextExcerpt(example.version.core.insight, 180)}</ScientificText> : <p className={styles.readingHook}>{t('exampleFallbackBody')}</p>}
            </div>
            {image ? <div className={styles.scienceImage}>{image}</div> : <p className={styles.noImage}>{t(loadState === 'unavailable' ? 'exampleUnavailable' : 'exampleNoImage')}</p>}
          </div>
          <figcaption className={styles.proofFooter}>
            {loadState === 'unavailable' || imageFailed ? <button type="button" onClick={() => setAttempt(value => value + 1)}>{t('retryExample')}</button> : <ScientificText as="p" hideSourceMarkers className={styles.figureCaption}>{illustration?.reader?.narration || illustrationTitle || t('figureLabel')}</ScientificText>}
            {example?.authors.length ? <p className={styles.authors}>{example.authors.map(author => author.displayName).join(' · ')}</p> : null}
            <Link href={example?.url ?? '/explore'} className={styles.textLink}>{t(example ? 'readExample' : 'explore')}<ArrowRight size={17} aria-hidden="true" /></Link>
          </figcaption>
        </>}
    </figure>
    </div>

    <aside className={styles.companionDock} aria-label="Hermes">
      <HermesDockAnchor floating={false} onInvoke={openDesk} state="idle" suggestion={guideSuggestion} workspaceId="guide" />
    </aside>

    <section className={styles.scenes} aria-labelledby={`${id}-scenes`}>
      <div className={styles.sectionHeading}><h2 id={`${id}-scenes`}>{t('sceneHeading')}</h2><p>{t('sceneIntro')}</p></div>
      <div className={styles.tabs} role="tablist" aria-label={t('sceneHeading')}>
        {scenes.map((key, index) => <button type="button" key={key} role="tab" id={`${id}-tab-${key}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} ref={element => { tabs.current[index] = element; }} onKeyDown={event => moveScene(event, index)} onClick={event => { if (selected === index) return; setSceneMotion(event.detail > 0 ? 'pointer' : 'keyboard'); setSelected(index); }}>{t(`scenes.${key}.label`)}</button>)}
      </div>
      <section role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${scene}`} tabIndex={0} className={styles.scenePanel}>
        <div key={scene} className={styles.sceneContent} data-scene-motion={sceneMotion}>
          <div className={styles.sceneCopy}><h3>{t(`scenes.${scene}.title`)}</h3><p>{t(`scenes.${scene}.body`)}</p></div>
          <div className={styles.demonstration} data-guide-demonstration="true">
            <div className={styles.demoHeader}><span>OpenScience.</span><span>{t(`scenes.${scene}.label`)}</span></div>
            {scene === 'read' ? <div className={styles.readDemo}>
              <div><h3>{example ? <ScientificText hideSourceMarkers>{example.title}</ScientificText> : t('exampleFallback')}</h3><p>{t('readDemoBody')}</p>{example?.version.core.problem ? <ScientificText as="p" hideSourceMarkers className={styles.demoNarrative}>{scientificTextExcerpt(example.version.core.problem, 160)}</ScientificText> : null}<Link href={example?.url ?? '/explore'} className={styles.textLink}>{t(example ? 'readExample' : 'explore')}<ArrowRight size={17} aria-hidden="true" /></Link></div>
            </div> : <div className={styles.workDemo}>
              <div className={styles.paperRow}><FileText size={28} aria-hidden="true" /><div><h3>{t(scene === 'start' ? 'materials' : 'continueExpression')}</h3></div></div>
              {scene === 'start' ? <div className={styles.intake}><Plus size={22} aria-hidden="true" /><div><strong>{t('create')}</strong><p>{t('createBody')}</p></div></div> : <div className={styles.composer}><MessageCircle size={24} aria-hidden="true" /><p>{t('hermesPrompt')}</p></div>}
              <Link href="/dashboard" className={styles.textLink}>{t(scene === 'start' ? 'findEntry' : 'deskAgain')}<ArrowRight size={17} aria-hidden="true" /></Link>
            </div>}
          </div>
        </div>
      </section>
    </section>

    <section className={styles.support}><h2>{t('questionsHeading')}</h2><div>{questions.map(key => <details key={key}><summary>{t(`questions.${key}.title`)}<ChevronDown size={16} aria-hidden="true" /></summary><p>{t(`questions.${key}.body`)}</p></details>)}</div></section>
    <footer className={styles.invitation}><p>{t('invitation')}</p><Link href="/dashboard" className={styles.textLink}>{t('desk')}<ArrowRight size={18} aria-hidden="true" /></Link></footer>
  </article>;
}

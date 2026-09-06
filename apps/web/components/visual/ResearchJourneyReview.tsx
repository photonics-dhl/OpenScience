'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, FileText, LayoutDashboard, MessageSquare, Play, Plus, Sparkles, Undo2, X } from 'lucide-react';
import { ResearchWorkbenchHermes } from './ResearchWorkbenchHermes';
import { researchJourneyCopy } from './research-journey-copy';
import styles from './research-journey-review.module.css';

type View = 'desk' | 'overview' | 'hermes';
type Locale = 'zh' | 'en';
const videoUrl = 'https://openscience.428312321.xyz/demos/science-video/d2nn/d2nn-science-explainer-v2.mp4?v=animated-restored-v1';
const paperUrl = 'https://doi.org/10.1126/science.aat8084';
const artwork = '/research-journey/d2nn-artwork.png';
function readView(): View {
  const value = new URLSearchParams(window.location.search).get('view');
  return value === 'overview' || value === 'hermes' ? value : 'desk';
}

export function ResearchJourneyReview({ initialView = 'desk', locale: initialLocale = 'zh' }: { initialView?: View; locale?: Locale }) {
  const [view, setView] = useState<View>(initialView);
  const pendingFocus = useRef<'title' | 'hermes' | null>(null);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [mobile, setMobile] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [quiet, setQuiet] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [request, setRequest] = useState('');
  const [preview, setPreview] = useState(false);
  const [applied, setApplied] = useState(false);
  const [notice, setNotice] = useState<'applied' | 'undone' | 'emptyRequest' | null>(null);
  const [evidence, setEvidence] = useState(false);
  const [video, setVideo] = useState(false);
  const [start, setStart] = useState(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const evidenceRef = useRef<HTMLDetailsElement>(null);
  const hermesButton = useRef<HTMLButtonElement>(null);
  const t = researchJourneyCopy[locale];

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setView(readView());
    const pop = () => {
      const next = readView();
      pendingFocus.current = next === 'hermes' ? 'hermes' : 'title';
      setView(next);
    };
    const media = window.matchMedia('(max-width: 900px)');
    const resize = () => setMobile(media.matches);
    resize(); window.addEventListener('popstate', pop); media.addEventListener('change', resize);
    return () => { window.removeEventListener('popstate', pop); media.removeEventListener('change', resize); };
  }, []);

  useEffect(() => {
    if (pendingFocus.current === 'title') document.getElementById('journey-title')?.focus();
    if (pendingFocus.current === 'hermes') hermesButton.current?.focus();
    pendingFocus.current = null;
  }, [view]);

  function navigate(next: View) {
    if (next === view) return;
    const url = new URL(window.location.href); url.searchParams.set('view', next);
    window.history.pushState(null, '', url);
    pendingFocus.current = next !== 'hermes' ? 'title' : null;
    setView(next);
  }
  function closeHermes() {
    const url = new URL(window.location.href); url.searchParams.set('view', 'overview');
    window.history.replaceState(null, '', url); pendingFocus.current = 'hermes'; setView('overview');
  }
  function openEvidence() {
    setEvidence(true); if (view === 'desk') navigate('overview');
    window.setTimeout(() => evidenceRef.current?.scrollIntoView({ behavior: 'instant', block: 'center' }), 0);
  }
  function preparePreview(event?: React.FormEvent) {
    event?.preventDefault();
    if (!prompt.trim()) { setPreview(false); setNotice('emptyRequest'); return; }
    setRequest(prompt.trim()); setPreview(true); setNotice(null);
  }
  function restore() { setApplied(false); setPreview(false); setNotice('undone'); }

  const avatar = <img className={styles.wankoAvatar} src="/hermes/wanko-static.png" alt="" aria-hidden="true" />;
  const still = reducedMotion || quiet || (preview && !applied);
  const character = <span className={styles.character} data-testid="journey-wanko" data-quiet={still} role="img" aria-label={t.companionIdentity}>
    <span hidden={still || (mobile && view === 'hermes')}>
      <ResearchWorkbenchHermes size={mobile ? 80 : 144} reducedMotion={false} state={view === 'hermes' ? 'guiding' : 'idle'} action={view === 'hermes' ? 'lamp-listen' : 'observe-left'} />
    </span>
    {still ? <img className={styles.stillCompanion} src="/hermes/wanko-static.png" alt="" /> : null}
  </span>;
  const companion = <div className={styles.companionDock}>
    <button className={styles.companionInvoke} type="button" data-testid="journey-companion" onClick={() => { setPrompt(t.explain); navigate('hermes'); }} aria-label={t.openHermes}>
      {character}<span><strong>Hermes</strong><small>{t.companionReady}</small></span>
    </button>
    <button className={styles.quietControl} type="button" aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>{quiet ? t.companionResume : t.companionQuiet}</button>
  </div>;
  const helper = <div className={styles.helperBody}>
    <p className={styles.helperLead}>{t.helperIntro}</p>
    <div className={styles.contextBox}><span className={styles.eyebrow}>{t.context}</span><strong>{t.contextLabel}</strong><p>{(applied ? t.revised : t.original).split(locale === 'zh' ? '。' : '. ')[0]}{locale === 'zh' ? '。' : '.'}</p></div>
    <p className={styles.simulation}>{t.simulation}</p>
    <form onSubmit={preparePreview} className={styles.promptForm}>
      <label htmlFor="journey-prompt">{t.prompt}</label>
      <textarea id="journey-prompt" data-testid="journey-prompt" value={prompt} maxLength={1000} placeholder={t.promptHint} onChange={event => { setPrompt(event.target.value); setPreview(false); setNotice(null); }} />
      <button className={styles.suggestion} type="button" onClick={() => { setPrompt(t.explain); setPreview(false); }} data-testid="journey-suggestion"><Plus size={16} aria-hidden="true" />{t.explain}</button>
      <button className={styles.primary} type="submit" data-testid="journey-preview"><Sparkles size={17} aria-hidden="true" />{t.preview}<ArrowRight size={17} aria-hidden="true" /></button>
    </form>
    {preview ? <section className={styles.preview} data-testid="journey-diff"><h3>{t.previewTitle}</h3><span className={styles.sampleLabel}>{t.sample}</span><p className={styles.request}><strong>{t.request}</strong>{request}</p><div className={styles.before}><span>{t.before}</span><p>{t.original}</p></div><div className={styles.after}><span>{t.after}</span><p>{t.revised}</p></div><button className={styles.primary} type="button" disabled={applied} data-testid="journey-apply" onClick={() => { setApplied(true); setNotice('applied'); }}><Check size={17} aria-hidden="true" />{t.apply}</button></section> : null}
    {applied ? <button className={styles.textButton} type="button" onClick={restore} data-testid="journey-undo"><Undo2 size={17} aria-hidden="true" />{t.undo}</button> : null}
    <p role="status" className={styles.notice}>{notice ? t[notice] : ''}</p>
    {!preview ? <div className={styles.helperFoot}><BookOpen size={20} aria-hidden="true" /><strong>{t.focus}</strong><p>{t.focusBody}</p></div> : null}
  </div>;

  return <div className={styles.root} lang={locale} data-testid="research-journey" data-view={view}>
    <div className={styles.reviewBar}><span><span className={styles.reviewDot} />{t.prototype}</span><div className={styles.viewTabs} aria-label={t.prototype}>{(['desk','overview','hermes'] as const).map(mode => <button key={mode} type="button" aria-current={view === mode ? 'page' : undefined} onClick={() => navigate(mode)} data-testid={`journey-view-${mode}`}>{t[mode]}</button>)}</div><button type="button" className={styles.localeButton} onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>{t.changeLanguage}</button></div>
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label={t.workspace}>
        <a className={styles.brand} href="?view=desk" onClick={event => { event.preventDefault(); navigate('desk'); }}><span className={styles.brandMark}>O<span /></span>OpenScience<span className={styles.brandPeriod}>.</span></a>
        <div className={styles.spaceLabel}>{t.workspace}</div>
        <button className={`${styles.navItem} ${view === 'desk' ? styles.navActive : ''}`} type="button" onClick={() => navigate('desk')}><LayoutDashboard size={19} aria-hidden="true" />{t.desk}</button>
        <button className={`${styles.navItem} ${view !== 'desk' ? styles.navActive : ''}`} type="button" onClick={() => navigate('overview')}><FileText size={19} aria-hidden="true" />{t.project}</button>
        <button className={styles.navItem} type="button" onClick={openEvidence}><BookOpen size={19} aria-hidden="true" />{t.library}</button>
        {companion}
        <div className={styles.profile}><span>R</span><div><strong>{t.profile}</strong><small>{t.workspace}</small></div></div>
      </nav>
      <div className={styles.page}>
        <header className={styles.pageHeader}><span>{view === 'desk' ? t.workspace : t.project}</span><div><span className={styles.statusDot} />{view === 'desk' ? t.demoCount : t.snapshot}</div></header>
        {view === 'desk' ? <main className={styles.desk}>
          <div className={styles.welcome}><button ref={startButton} type="button" className={styles.startButton} data-testid="journey-start" onClick={() => setStart(true)}><Plus size={17} aria-hidden="true" />{t.start}</button><p className={styles.eyebrow}>RESEARCH DESK</p><h1 id="journey-title" tabIndex={-1}>{t.welcome}</h1><p>{t.welcomeBody}</p></div>
          <article className={styles.feature}><div className={styles.featureImage}><img src={artwork} alt={t.artworkAlt} /></div><div className={styles.featureContent}><span className={styles.activeLabel}><span className={styles.statusDot}/>{t.active}</span><p className={styles.featureSubtitle}>{t.subtitle}</p><h2>{t.title}</h2><p>{t.description}</p><button className={styles.primary} type="button" onClick={() => navigate('overview')} data-testid="journey-continue">{t.resume}<ArrowRight size={18} aria-hidden="true" /></button></div></article>
          <section className={styles.nextSection}><div><h2>{t.next}</h2><p>{t.nextBody}</p></div><div className={styles.nextActions}><button type="button" onClick={() => { setPrompt(t.explain); navigate('hermes'); }}><span className={styles.actionIcon}><MessageSquare size={21} aria-hidden="true" /></span><span><strong>{t.nextOne}</strong><small>{t.nextOneBody}</small></span><ArrowRight size={18} aria-hidden="true" /></button><button type="button" onClick={openEvidence}><span className={styles.actionIcon}><BookOpen size={21} aria-hidden="true" /></span><span><strong>{t.nextTwo}</strong><small>{t.nextTwoBody}</small></span><ArrowRight size={18} aria-hidden="true" /></button></div></section>
          <section className={styles.recent}><h2>{t.recent}</h2><button type="button" onClick={() => navigate('overview')}><FileText size={19} aria-hidden="true" /><span>{t.recentItem}</span><small>{t.sampleTime}</small><ChevronRight size={18} aria-hidden="true" /></button></section>
        </main> : <div className={`${styles.researchLayout} ${view === 'hermes' ? styles.withHelper : ''}`}>
          <main className={styles.research}>
            <button className={styles.back} type="button" onClick={() => navigate('desk')}><ArrowLeft size={16} aria-hidden="true" />{t.back}</button>
            <div className={styles.researchTitle}><p className={styles.eyebrow}>{t.subtitle}</p><h1 id="journey-title" tabIndex={-1}>{t.title}</h1><p>{t.sourceLabel}</p></div>
            <div className={styles.articleTabs}><a href="#journey-insight">{t.overview}</a><a href="#journey-method">{t.method}</a><button type="button" onClick={openEvidence}>{t.library}<ArrowDown size={14} aria-hidden="true" /></button></div>
            <section className={`${styles.insight} ${view === 'hermes' ? styles.contextActive : ''}`} id="journey-insight"><div className={styles.sectionHeading}><h2>{t.insight}</h2><span className={styles.contextTag}>{view === 'hermes' ? t.contextLabel : t.draft}</span></div><p data-testid="journey-narrative">{applied ? t.revised : t.original}</p><div className={styles.insightActions}><button ref={hermesButton} className={styles.textButton} type="button" data-testid="journey-open-hermes" onClick={() => { setPrompt(t.explain); navigate('hermes'); }}>{avatar}{t.explain}<ArrowRight size={16} aria-hidden="true" /></button>{applied ? <button className={styles.textButton} type="button" onClick={restore}><Undo2 size={16} aria-hidden="true" />{t.undo}</button> : null}</div></section>
            <figure className={styles.artwork}><img src={artwork} alt={t.artworkAlt} /><figcaption>{t.artworkCaption}</figcaption><button ref={playButton} className={styles.playButton} type="button" onClick={() => setVideo(true)} data-testid="journey-play"><span><Play size={19} fill="currentColor" aria-hidden="true" /></span>{t.watch}<ArrowRight size={17} aria-hidden="true" /></button></figure>
            <div className={styles.explanation} id="journey-method">{(['method','results','limits'] as const).map((section,index) => <section key={section}><span className={styles.sectionNumber}>0{index+1}</span><div><h2>{t[section]}</h2><p>{t[`${section}Body`]}</p></div></section>)}</div>
            <details className={styles.evidence} ref={evidenceRef} open={evidence} onToggle={event => setEvidence(event.currentTarget.open)} data-testid="journey-evidence"><summary><BookOpen size={19} aria-hidden="true" />{t.evidence}<Plus size={17} aria-hidden="true" /></summary><div><span className={styles.eyebrow}>{t.originalPaper}</span><h3>{t.citation}</h3><p>{t.doi}</p><a href={paperUrl} target="_blank" rel="noreferrer">{t.openPaper}<ArrowRight size={17} aria-hidden="true" /></a><p className={styles.provenance}>{t.provenance}</p></div></details>
          </main>
          {view === 'hermes' && !mobile ? <aside className={styles.helper} aria-label={t.hermes}><header className={styles.helperHeader}>{avatar}<div><h2>Hermes</h2><p>{t.about}</p></div><button type="button" aria-label={t.close} onClick={closeHermes}><X size={19} /></button></header>{helper}</aside> : null}
        </div>}
      </div>
    </div>
    <Dialog.Root open={mobile && view === 'hermes'} onOpenChange={open => { if (!open) closeHermes(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay}/><Dialog.Content className={`${styles.mobileHelper} ${styles.root}`} onCloseAutoFocus={event => { event.preventDefault(); window.requestAnimationFrame(() => hermesButton.current?.focus()); }}><header className={styles.helperHeader}>{avatar}<div><Dialog.Title>Hermes</Dialog.Title><Dialog.Description>{t.about}</Dialog.Description></div><Dialog.Close aria-label={t.close}><X size={20}/></Dialog.Close></header>{helper}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={start} onOpenChange={setStart}><Dialog.Portal><Dialog.Overlay className={styles.overlay}/><Dialog.Content className={`${styles.startModal} ${styles.root}`} onCloseAutoFocus={event => { event.preventDefault(); startButton.current?.focus(); }}><div className={styles.videoHeading}><Dialog.Title>{t.startTitle}</Dialog.Title><Dialog.Close aria-label={t.close}><X size={21}/></Dialog.Close></div><Dialog.Description className={styles.videoNote}>{t.startNote}</Dialog.Description><ol className={styles.startSteps}>{t.startSteps.map(step => <li key={step}>{step}</li>)}</ol><button type="button" className={styles.primary} data-testid="journey-use-sample" onClick={() => { setStart(false); navigate('overview'); }}>{t.useSample}<ArrowRight size={17} aria-hidden="true" /></button></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={video} onOpenChange={setVideo}><Dialog.Portal><Dialog.Overlay className={styles.overlay}/><Dialog.Content className={`${styles.videoModal} ${styles.root}`} onCloseAutoFocus={event => { event.preventDefault(); playButton.current?.focus(); }}><div className={styles.videoHeading}><Dialog.Title>{t.videoTitle}</Dialog.Title><Dialog.Close aria-label={t.close}><X size={21}/></Dialog.Close></div><Dialog.Description className={styles.videoNote}>{t.videoNote}</Dialog.Description><video controls playsInline preload="metadata" src={videoUrl} aria-label={t.videoTitle}/></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

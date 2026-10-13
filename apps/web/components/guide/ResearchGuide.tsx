'use client';
import * as React from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ArrowRight, ArrowUpRight, ChevronDown, CodeXml, ImageIcon, PlaySquare, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPublicResearchVersion, type PublicPresentationAsset } from '@/lib/api';
import { guidePageCopy } from '@/lib/guide-page-copy';
import styles from './research-guide.module.css';

const STUDY_HREF = '/research/OSR-2026-000022/v/4';
const CHAPTER_IDS = ['guide-about', 'guide-start', 'guide-steps', 'guide-example', 'guide-questions'];
const MEDIA_ICONS = [ImageIcon, PlaySquare, CodeXml];

export function ResearchGuide() {
  const locale = useLocale();
  const t = guidePageCopy[locale === 'en' ? 'en' : 'zh'];
  const [step, setStep] = React.useState(2);
  const [format, setFormat] = React.useState(0);
  const [chapter, setChapter] = React.useState('guide-steps');
  const [commentHelp, setCommentHelp] = React.useState(false);
  const [image, setImage] = React.useState<PublicPresentationAsset | null>(null);
  const [imageStatus, setImageStatus] = React.useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const stepRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const formatRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();
    setImageStatus('loading');
    setImage(null);
    getPublicResearchVersion('OSR-2026-000022', 4, controller.signal).then(({ research }) => {
      if (controller.signal.aborted) return;
      // Only the fixed public version's media; never substitute generated mock
      // science or fetch a private asset for a public Guide.
      const asset = research.presentationAssets
        .filter(item => item.kind === 'image' || item.kind === 'chart')
        .sort((a, b) => (a.reader?.order ?? 0) - (b.reader?.order ?? 0))[0];
      setImage(asset ?? null);
      setImageStatus(asset ? 'ready' : 'missing');
    }).catch(() => { if (!controller.signal.aborted) setImageStatus('error'); });
    return () => controller.abort();
  }, [loadAttempt]);

  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, index: number, count: number,
    select: (index: number) => void, refs: React.RefObject<(HTMLButtonElement | null)[]>) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index + count - 1) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    select(next);
    const target = refs.current?.[next];
    target?.focus();
    // Focus alone can leave a partially visible lifecycle tab clipped on mobile.
    // Move only this rail; centering agrees with its existing scroll-snap target.
    if (refs === stepRefs && target) {
      const rail = target.closest<HTMLElement>('[role="tablist"]');
      if (rail && rail.scrollWidth > rail.clientWidth) {
        const bounds = target.getBoundingClientRect();
        const left = rail.getBoundingClientRect().left + rail.clientLeft;
        const right = left + rail.clientWidth;
        if (bounds.left < left || bounds.right > right) {
          rail.scrollTo({
            left: rail.scrollLeft + (bounds.left + bounds.right - left - right) / 2,
            behavior: 'instant',
          });
        }
      }
    }
  };

  const contents = <nav aria-label={t.contents} className={styles.chapterLinks}>
    {t.chapters.map((label, index) => <a key={CHAPTER_IDS[index]} href={'#' + CHAPTER_IDS[index]}
      aria-current={chapter === CHAPTER_IDS[index] ? 'location' : undefined}
      onClick={event => {
        setChapter(CHAPTER_IDS[index]);
        event.currentTarget.closest('details')?.removeAttribute('open');
      }}>{label}</a>)}
  </nav>;

  return <article className={styles.guide}>
    <aside className={styles.contents}>
      <div className={styles.desktopContents}><p>{t.contents}</p>{contents}</div>
      <details className={styles.mobileContents}><summary>{t.contents}<ChevronDown size={17} aria-hidden="true" /></summary>{contents}</details>
    </aside>
    <div className={styles.body}>
      <header className={styles.hero} id="guide-about">
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h1>{t.headline.map(line => <span key={line}>{line}</span>)}</h1>
        <p className={styles.lead}>{t.introduction.map(line => <span key={line}>{line}</span>)}</p>
      </header>

      <section className={styles.invitation} id="guide-start" aria-labelledby="guide-invitation-title">
        <h2 id="guide-invitation-title">{t.invitation}</h2>
        <p>{t.beginning}</p>
        <Button asChild className={styles.primaryAction}><Link href="/dashboard">{t.workspace}<ArrowRight size={18} aria-hidden="true" /></Link></Button>
      </section>

      <section className={styles.instructions} id="guide-steps" aria-labelledby="guide-lifecycle-title">
        <h2 className={styles.eyebrow} id="guide-lifecycle-title">{t.lifecycle}</h2>
        <div className={styles.lifecycle} role="tablist" aria-label={t.lifecycle}>
          {t.steps.map((node, index) => <button type="button" role="tab" key={node.title}
            id={'guide-step-' + index} aria-controls={'guide-panel-' + index} aria-selected={step === index}
            tabIndex={step === index ? 0 : -1} ref={element => { stepRefs.current[index] = element; }}
            onClick={() => setStep(index)} onKeyDown={event => moveTab(event, index, t.steps.length, setStep, stepRefs)}>
            <span className={styles.stepNumber}>{index + 1}</span><span className={styles.stepName}>{node.title}</span><span className={styles.roles}>{node.roles}</span>
          </button>)}
        </div>
        {t.steps.map((node, index) => <div key={node.title} id={'guide-panel-' + index} role="tabpanel"
          aria-labelledby={'guide-step-' + index} hidden={step !== index} tabIndex={0} className={styles.stepPanel}>
          {step === index && <>
            <p className={styles.eyebrow}>{t.step} {String(index + 1).padStart(2, '0')}</p>
            <h2>{node.heading}</h2>
            <div className={styles.notes}>{node.notes.map(note => <div key={note.title}><h3>{note.title}</h3><p>{note.body}</p></div>)}</div>
            {index === 2 && <>
              <div className={styles.studyPreview} data-guide-study-preview>
                <header><h3 lang="en">deep-sub-cycle pulse</h3><p className={styles.studyId}>OSR-2026-000022 / v4</p></header>
                <div role="tablist" aria-label={t.formatLabel} className={styles.mediaTabs}>
                  {t.formats.map((label, mediaIndex) => {
                    const Icon = MEDIA_ICONS[mediaIndex];
                    return <button key={label} type="button" role="tab" id={'guide-media-' + mediaIndex}
                      aria-controls={'guide-media-panel-' + mediaIndex} aria-selected={format === mediaIndex} tabIndex={format === mediaIndex ? 0 : -1}
                      ref={element => { formatRefs.current[mediaIndex] = element; }} onClick={() => setFormat(mediaIndex)}
                      onKeyDown={event => moveTab(event, mediaIndex, 3, setFormat, formatRefs)}><Icon size={20} aria-hidden="true" />{label}</button>;
                  })}
                </div>
                {t.formats.map((label, mediaIndex) => <div role="tabpanel" id={'guide-media-panel-' + mediaIndex} key={label}
                  aria-labelledby={'guide-media-' + mediaIndex} hidden={format !== mediaIndex} tabIndex={0} className={styles.mediaPanel}>
                  {mediaIndex === 0 ? imageStatus === 'ready' && image ? <figure>
                    {/* Scientific pixels stay intact, without cropping or overlays. */}
                    <img src={image.url} alt={image.reader?.title || t.imageAlt} onError={() => setImageStatus('error')} loading="lazy" />
                    {image.reader?.title && <figcaption>{image.reader.title}</figcaption>}
                  </figure> : <div className={styles.mediaEmpty} role="status">
                    <ImageIcon size={28} aria-hidden="true" /><p>{imageStatus === 'loading' ? t.loading : imageStatus === 'missing' ? t.missingImage : t.unavailable}</p>
                    {imageStatus === 'error' && <button type="button" onClick={() => setLoadAttempt(value => value + 1)}>{t.retry}</button>}
                  </div> : <div className={styles.formatExplanation}>
                    {mediaIndex === 1 ? <PlaySquare size={36} aria-hidden="true" /> : <CodeXml size={36} aria-hidden="true" />}
                    <h4>{label}</h4><p>{mediaIndex === 1 ? t.videoExplanation : t.htmlExplanation}</p><p className={styles.availability}>{t.sampleAvailability}</p>
                  </div>}
                </div>)}
                <section className={styles.discussion} aria-labelledby="guide-comments-title">
                  <div className={styles.discussionHeading}><h4 id="guide-comments-title">{t.discussion}</h4>
                    <button type="button" aria-expanded={commentHelp} aria-controls="guide-comment-help" onClick={() => setCommentHelp(value => !value)}>{t.commentButton}</button></div>
                  <div className={styles.comment}><span className={styles.avatar}><UserRound size={24} aria-hidden="true" /></span>
                    <div><div className={styles.commentLine}><span className={styles.quote}>{t.quote}</span><p>{t.comment}</p></div><p className={styles.exampleComment}>{t.exampleComment}</p></div>
                  </div>
                  <p id="guide-comment-help" className={styles.commentHelp} hidden={!commentHelp}>{t.commentHelp}</p>
                </section>
              </div>
              <p className={styles.illustration}>{t.illustration}</p>
            </>}
            <Link className={styles.textLink} href={node.href} {...(index === 2 ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {node.entry}<ArrowUpRight size={18} aria-hidden="true" />{index === 2 && <span className="sr-only">{t.newTab}</span>}
            </Link>
          </>}
        </div>)}
      </section>

      <section className={styles.example} id="guide-example" aria-labelledby="guide-example-title">
        <h2 id="guide-example-title">{t.exampleTitle}</h2><div><p className={styles.studyId}>OSR-2026-000022 / v4</p>
          <Link className={styles.textLink} href={STUDY_HREF} target="_blank" rel="noopener noreferrer">{t.exampleLink}<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">{t.newTab}</span></Link></div>
      </section>
      <section className={styles.support} id="guide-questions" aria-labelledby="guide-faq-title">
        <h2 id="guide-faq-title">{t.faqTitle}</h2>
        <div className={styles.questions}>{t.questions.map(question => <details key={question.title}>
          <summary>{question.title}<ChevronDown size={17} aria-hidden="true" /></summary><p>{question.body}</p>
        </details>)}</div>
      </section>
    </div>
    <footer className={styles.footer}><Link href="/" className={styles.brand}>OpenScience.</Link><nav aria-label={t.pageName}>
      <Link href="/explore">{t.explore}</Link><Link href="/journals">{t.journals}</Link><Link href="/guide">{t.pageName}</Link>
    </nav></footer>
  </article>;
}

'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import styles from './ResearchMediaDeck.module.css';

export interface ResearchMediaSlide {
  id: string;
  kind: 'image' | 'video';
  label: string;
  url: string;
  description?: string;
  details?: string[];
}

interface ResearchMediaDeckProps {
  title: string;
  slides: ResearchMediaSlide[];
  emptyTitle: string;
  emptyBody: string;
  previousLabel: string;
  nextLabel: string;
  positionLabel(current: number, total: number): string;
  detailsLabel?: string;
  emptyKind: 'image' | 'video';
  openImageLabel: string;
  eager?: boolean;
}

export function ResearchMediaDeck({ title, slides, emptyTitle, emptyBody, previousLabel, nextLabel, positionLabel, detailsLabel, emptyKind, openImageLabel, eager = false }: ResearchMediaDeckProps) {
  const [index, setIndex] = useState(0);
  const headingId = useId();
  const multiple = slides.length > 1;
  const slideKey = JSON.stringify(slides.map((slide) => slide.id));
  const activeIndex = slides.length ? Math.min(index, slides.length - 1) : 0;
  const active = slides[activeIndex];
  const EmptyIcon = emptyKind === 'video' ? VideoIcon : ImageIcon;

  useEffect(() => { setIndex(0); }, [slideKey]);

  const previous = () => setIndex((value) => (value - 1 + slides.length) % slides.length);
  const next = () => setIndex((value) => (value + 1) % slides.length);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!multiple || (event.target instanceof HTMLElement && event.target !== event.currentTarget)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  };

  return <section className={styles.deck} aria-labelledby={headingId} aria-roledescription={multiple ? 'carousel' : undefined} onKeyDown={onKeyDown} tabIndex={multiple ? 0 : undefined}>
    <h3 className={styles.heading} id={headingId}>{title}</h3>
    {!active ? <div className={styles.frame} data-media-placeholder="true">
      <div className={styles.placeholder} aria-hidden="true"><EmptyIcon /></div>
      <div className={styles.caption}><strong>{emptyTitle}</strong><span>{emptyBody}</span></div>
    </div> : <div className={styles.frame}>
      <figure>
        <div className={styles.media}>
          {active.kind === 'video'
            ? <video controls playsInline preload="metadata" aria-label={active.label} src={active.url} />
            : <a href={active.url} target="_blank" rel="noreferrer" aria-label={`${active.label} — ${openImageLabel}`}><img src={active.url} alt={active.label} loading={eager ? 'eager' : 'lazy'} /></a>}
        </div>
        <figcaption className={styles.caption}><strong>{active.label}</strong>{active.description ? <span>{active.description}</span> : null}</figcaption>
      </figure>
      {multiple ? <div className={styles.controls} aria-label={title}>
        <button type="button" onClick={previous} aria-label={previousLabel}>←</button>
        <span aria-live="polite">{positionLabel(activeIndex + 1, slides.length)}</span>
        <button type="button" onClick={next} aria-label={nextLabel}>→</button>
      </div> : null}
      {detailsLabel && active.details?.length ? <details className={styles.details}><summary>{detailsLabel}</summary>{active.details.map((detail, detailIndex) => <p key={`${detailIndex}-${detail}`}>{detail}</p>)}</details> : null}
    </div>}
  </section>;
}

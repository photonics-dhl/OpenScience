'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { ScientificText } from '../content/ScientificText';
import styles from './ResearchMediaDeck.module.css';

export interface ResearchMediaSlide {
  id: string;
  kind: 'image' | 'video';
  label: string;
  url: string;
  description?: string;
}

interface ResearchMediaDeckProps {
  title: string;
  slides: ResearchMediaSlide[];
  emptyTitle: string;
  emptyBody: string;
  previousLabel: string;
  nextLabel: string;
  positionLabel(current: number, total: number): string;
  emptyKind: 'image' | 'video';
  openImageLabel: string;
  eager?: boolean;
  renderActions?: (slide: ResearchMediaSlide) => ReactNode;
  descriptionLabel?: string;
  activeSlideId?: string | null;
  pendingSlideId?: string;
  onActiveSlideChange?(id: string | null): void;
  missingSelectionBody?: string;
}

export function ResearchMediaDeck({ title, slides, emptyTitle, emptyBody, previousLabel, nextLabel, positionLabel, emptyKind, openImageLabel, eager = false, renderActions, descriptionLabel, activeSlideId, pendingSlideId, onActiveSlideChange, missingSelectionBody }: ResearchMediaDeckProps) {
  const [localId, setLocalId] = useState<string | null | undefined>(() => slides[0]?.id);
  const [index, setIndex] = useState(0);
  const managed = activeSlideId !== undefined || onActiveSlideChange !== undefined;
  const notify = useRef(onActiveSlideChange); notify.current = onActiveSlideChange;
  const headingId = useId();
  const multiple = slides.length > 1;
  const slideKey = JSON.stringify(slides.map((slide) => managed ? [slide.id, slide.label] : slide.id));
  const selectedId = activeSlideId === undefined ? localId : activeSlideId;
  const activeIndex = managed ? slides.findIndex(slide => slide.id === selectedId) : slides.length ? Math.min(index, slides.length - 1) : 0;
  const active = slides[activeIndex];
  const EmptyIcon = emptyKind === 'video' ? VideoIcon : ImageIcon;

  useEffect(() => {
    if (!managed) { setIndex(0); return; }
    const items = JSON.parse(slideKey) as Array<[string, string]>;
    if (selectedId === undefined && items.length) { setLocalId(items[0]![0]); notify.current?.(items[0]![0]); }
    else if (typeof selectedId === 'string' && !items.some(([id]) => id === selectedId)) {
      if (selectedId !== pendingSlideId) { setLocalId(null); notify.current?.(null); }
    }
    else if (selectedId !== undefined) notify.current?.(selectedId);
  }, [slideKey, selectedId, pendingSlideId, managed]);

  const select = (index: number) => { const id = slides[index]?.id ?? null; setLocalId(id); notify.current?.(id); };
  const previous = () => managed ? select(activeIndex < 0 ? slides.length - 1 : (activeIndex - 1 + slides.length) % slides.length)
    : setIndex(value => (value - 1 + slides.length) % slides.length);
  const next = () => managed ? select(activeIndex < 0 ? 0 : (activeIndex + 1) % slides.length) : setIndex(value => (value + 1) % slides.length);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!multiple || (event.target instanceof HTMLElement && event.target !== event.currentTarget)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  };
  const controls = slides.length > 0 && (multiple || !active) ? <div className={styles.controls} aria-label={title}>
    <button type="button" onClick={previous} aria-label={previousLabel}>←</button>
    <span aria-live="polite">{positionLabel(activeIndex + 1, slides.length)}</span>
    <button type="button" onClick={next} aria-label={nextLabel}>→</button>
  </div> : null;

  return <section className={styles.deck} data-research-media-kind={emptyKind} aria-labelledby={headingId} aria-roledescription={multiple ? 'carousel' : undefined} onKeyDown={onKeyDown} tabIndex={multiple ? 0 : undefined}>
    <h3 className={styles.heading} id={headingId}>{title}</h3>
    {!active ? <div className={styles.frame} data-media-placeholder="true">
      <div className={styles.placeholder} aria-hidden="true"><EmptyIcon /></div>
      <div className={styles.caption}><strong>{emptyTitle}</strong><span>{slides.length ? missingSelectionBody ?? emptyBody : emptyBody}</span></div>
      {controls}
    </div> : <div className={styles.frame}>
      <figure>
        <div className={styles.media}>
          {active.kind === 'video'
            ? <video controls playsInline preload="metadata" aria-label={active.label} src={active.url} />
            : <a href={active.url} target="_blank" rel="noreferrer" aria-label={`${active.label} — ${openImageLabel}`}><img src={active.url} alt={active.label} loading={eager ? 'eager' : 'lazy'} /></a>}
        </div>
        <figcaption className={styles.caption}><ScientificText as="strong" hideSourceMarkers>{active.label}</ScientificText>{active.description && !descriptionLabel ? <ScientificText as="span" hideSourceMarkers>{active.description}</ScientificText> : null}</figcaption>
      </figure>
      {active.description && descriptionLabel ? <details className={styles.details} key={`caption:${active.id}`}>
        <summary>{descriptionLabel}</summary>
        <ScientificText as="div" hideSourceMarkers>{active.description}</ScientificText>
      </details> : null}
      {renderActions ? <div className="border-t border-os-rule-paper px-4 py-3" key={active.id}>{renderActions(active)}</div> : null}
      {controls}
    </div>}
  </section>;
}

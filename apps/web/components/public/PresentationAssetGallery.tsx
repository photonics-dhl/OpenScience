'use client';

import { useTranslations } from 'next-intl';
import type { PublicPresentationAsset } from '../../lib/api';
import { ResearchMediaDeck, type ResearchMediaSlide } from '../presentation/ResearchMediaDeck';
import { ScientificText } from '../content/ScientificText';
import styles from './PublicReadingProduct.module.css';

export function PresentationAssetGallery({ assets, leading = false }: { assets: PublicPresentationAsset[]; leading?: boolean }) {
  const t = useTranslations('public.presentation');
  if (leading) {
    const toSlide = (asset: PublicPresentationAsset, kind: ResearchMediaSlide['kind'], label: string): ResearchMediaSlide => ({
      id: asset.id,
      kind,
      label: asset.reader?.title ?? label,
      url: asset.url,
      description: asset.reader?.narration ?? t('notEvidence'),
    });
    const imageSlides = assets.filter((asset) => asset.kind === 'image' || asset.kind === 'chart').map((asset, index) => toSlide(asset, 'image', index === 0 ? t('coreImageTitle') : t('imageNumber', { number: index + 1 })));
    const videoSlides = assets.filter((asset) => asset.kind === 'video').map((asset, index) => toSlide(asset, 'video', index === 0 ? t('videoTitle') : t('videoNumber', { number: index + 1 })));
    return <section className={`${styles.gallery} ${styles.leadingGallery}`} data-presentation-gallery="true" aria-label={t('title')}>
      <h2 className="sr-only">{t('title')}</h2>
      <div className={styles.leadingMedia} data-has-video={videoSlides.length > 0}>
        <ResearchMediaDeck title={t('coreImageTitle')} slides={imageSlides} emptyTitle={t('imagePlaceholderTitle')} emptyBody={t('imagePlaceholderBody')} emptyKind="image" openImageLabel={t('viewFullSize')} previousLabel={t('previousSlide')} nextLabel={t('nextSlide')} positionLabel={(current, total) => t('slidePosition', { current, total })} eager />
        <ResearchMediaDeck title={t('videoTitle')} slides={videoSlides} emptyTitle={t('videoPlaceholderTitle')} emptyBody={t('videoPlaceholderBody')} emptyKind="video" openImageLabel={t('viewFullSize')} previousLabel={t('previousSlide')} nextLabel={t('nextSlide')} positionLabel={(current, total) => t('slidePosition', { current, total })} />
      </div>
    </section>;
  }
  if (assets.length === 0) return null;
  const headingId = `public-presentation-${assets[0].id}`;
  return <section className={`pub-presentation-gallery ${styles.gallery}`} data-presentation-gallery="true" aria-labelledby={headingId}>
    <div className={styles.sectionTitle}>
      <h2 id={headingId}>{t('title')}</h2>
    </div>
    <div className={`pub-presentation-grid ${styles.presentationGrid}`}>
      {assets.map((asset) => <figure key={asset.id} className={`pub-presentation-card ${styles.presentationAsset}`} data-generator={`${asset.generator.name} ${asset.generator.version}`}>
        {(asset.kind === 'image' || asset.kind === 'chart') && <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`${asset.reader?.title ?? asset.label} — ${t('download')}`}><img src={asset.url} alt={asset.reader?.title ?? asset.label} loading="lazy" /></a>}
        {asset.kind === 'video' && <video controls preload="metadata" aria-label={asset.reader?.title ?? asset.label}><source src={asset.url} /></video>}
        {(asset.kind === 'interactive_html' || asset.kind === 'svg') && <div className="pub-presentation-fallback"><p>{t('downloadOnly')}</p><a href={asset.url} download>{t('download')}</a></div>}
        <figcaption>
          <ScientificText as="strong" hideSourceMarkers>{asset.reader?.title ?? asset.label}</ScientificText>
          {asset.reader?.narration ? <ScientificText as="span" hideSourceMarkers>{asset.reader.narration}</ScientificText>
            : <span data-presentation-label="not-evidence">{t('notEvidence')}</span>}
        </figcaption>
      </figure>)}
    </div>
  </section>;
}

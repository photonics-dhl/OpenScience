'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { PublicPresentationAsset } from '../../lib/api';

export function PresentationAssetGallery({ assets, leading = false }: { assets: PublicPresentationAsset[]; leading?: boolean }) {
  const t = useTranslations('public.presentation');
  if (assets.length === 0) return null;
  const headingId = `public-presentation-${assets[0].id}`;
  return <section className="pub-presentation-gallery" data-presentation-gallery="true" aria-label={leading ? t('title') : undefined} aria-labelledby={leading ? undefined : headingId}>
    {!leading && <div className="pub-section-intro">
      <p className="pub-kicker">{t('kicker')}</p>
      <h2 id={headingId}>{t('title')}</h2>
    </div>}
    <div className="pub-presentation-grid">
      {assets.map((asset) => <figure key={asset.id} className="pub-presentation-card" data-generator={`${asset.generator.name} ${asset.generator.version}`}>
        {(asset.kind === 'image' || asset.kind === 'chart') && <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`${asset.label} — ${t('download')}`}><img src={asset.url} alt={asset.label} loading={leading ? 'eager' : 'lazy'} /></a>}
        {asset.kind === 'video' && <video controls preload="metadata" aria-label={asset.label}><source src={asset.url} /></video>}
        {(asset.kind === 'interactive_html' || asset.kind === 'svg') && <div className="pub-presentation-fallback"><p>{t('downloadOnly')}</p><a href={asset.url} download>{t('download')}</a></div>}
        <figcaption>
          <strong>{asset.label}</strong>
          <span data-presentation-label="not-evidence">{t('notEvidence')}</span>
          <details><summary>{t('sourceClaims')}: {asset.sourceClaimIds.length}</summary><span>{t('generatedBy', { name: asset.generator.name, version: asset.generator.version })}</span></details>
        </figcaption>
      </figure>)}
    </div>
  </section>;
}

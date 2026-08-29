'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { PublicPresentationAsset } from '../../lib/api';

export function PresentationAssetGallery({ assets }: { assets: PublicPresentationAsset[] }) {
  const t = useTranslations('public.presentation');
  if (assets.length === 0) return null;
  return <section className="pub-presentation-gallery" data-presentation-gallery="true" aria-labelledby="public-presentation-heading">
    <div className="pub-section-intro">
      <p className="pub-kicker">{t('kicker')}</p>
      <h2 id="public-presentation-heading">{t('title')}</h2>
      <p data-presentation-label="not-evidence">{t('notEvidence')}</p>
    </div>
    <div className="pub-presentation-grid">
      {assets.map((asset) => <figure key={asset.id} className="pub-presentation-card" data-generator={`${asset.generator.name} ${asset.generator.version}`}>
        {(asset.kind === 'image' || asset.kind === 'chart') && <img src={asset.url} alt={asset.label} loading="lazy" />}
        {asset.kind === 'video' && <video controls preload="metadata" aria-label={asset.label}><source src={asset.url} /></video>}
        {(asset.kind === 'interactive_html' || asset.kind === 'svg') && <div className="pub-presentation-fallback"><p>{t('downloadOnly')}</p><a href={asset.url} download>{t('download')}</a></div>}
        <figcaption>
          <strong>{asset.label}</strong>
          <span>{t('generatedBy', { name: asset.generator.name, version: asset.generator.version })}</span>
          <span>{t('sourceClaims')}: {asset.sourceClaimIds.join(', ')}</span>
        </figcaption>
      </figure>)}
    </div>
  </section>;
}

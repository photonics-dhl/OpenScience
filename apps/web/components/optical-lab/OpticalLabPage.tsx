import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Archivo } from 'next/font/google';
import { getTranslations } from 'next-intl/server';

import { OpticalLabClientMount } from './OpticalLabClientMount';
import { AcceptedOpticalSurface } from './AcceptedOpticalSurface';

import styles from '@/app/_visual/optical-lab/optical-lab.module.css';
import { OPTICAL_ASSET_URLS } from '@/lib/optical-lab/asset-manifest.mjs';
import { OPTICAL_LAB_RENDER_PHASE } from '@/lib/optical-lab/runtime-policy';

export const opticalLabMetadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Optical Lab · OpenScience',
};

const archivo = Archivo({
  subsets: ['latin'],
  weight: '900',
  display: 'swap',
});

export async function OpticalLabPage({ candidate }: { candidate?: 'asset' } = {}) {
  const t = await getTranslations('opticalLab');
  const isAssetCandidate = candidate === 'asset';
  const renderMode = isAssetCandidate ? 'asset-static' : 'static-fallback';
  const displayMode = isAssetCandidate ? 'Asset/static' : 'DOM/static';
  const contextStatus = isAssetCandidate ? 'stable' : 'idle';
  const stableBounds = isAssetCandidate ? 'stable' : 'pending';

  return (
    <main
      className={`${styles.page} ${isAssetCandidate ? styles.assetPage : ''}`}
      data-optical-lab="true"
      data-optical-lab-asset-only={isAssetCandidate || undefined}
    >
      <header className={`${styles.header} ${isAssetCandidate ? styles.assetHeader : ''}`}>
        {isAssetCandidate ? (
          <Link className={styles.assetExit} data-optical-lab-exit="true" href="/">
            {t('backToLanding')}
          </Link>
        ) : (
          <>
            <p className={styles.eyebrow}>{t('eyebrow')}</p>
            <p className={styles.introduction}>{t('introduction')}</p>
            <div className={styles.scope}>
              <p>{t('scope')}</p>
              <Link data-optical-lab-exit="true" href="/">{t('backToLanding')}</Link>
            </div>
          </>
        )}
      </header>

      <section
        className={`${styles.comparison} ${isAssetCandidate ? styles.assetComparison : ''}`}
        aria-label={isAssetCandidate ? t('candidateTitle') : t('comparisonLabel')}
      >
        {!isAssetCandidate ? (
          <>
            <figure className={styles.panel} data-optical-lab-panel="target">
              <figcaption className={styles.caption}>
                <span>01</span>
                <strong>{t('targetTitle')}</strong>
                <small>{t('targetNote')}</small>
              </figcaption>
              <div className={styles.media}>
                <Image
                  alt={t('targetAlt')}
                  className={styles.image}
                  fill
                  priority
                  sizes="(min-width: 1280px) 33vw, 100vw"
                  src={OPTICAL_ASSET_URLS.targetReference}
                  unoptimized
                />
              </div>
            </figure>

            <figure className={styles.panel} data-optical-lab-panel="current">
              <figcaption className={styles.caption}>
                <span>02</span>
                <strong>{t('currentTitle')}</strong>
                <small>{t('currentNote')}</small>
              </figcaption>
              <div className={styles.media}>
                <Image
                  alt={t('currentAlt')}
                  className={styles.image}
                  fill
                  sizes="(min-width: 1280px) 33vw, 100vw"
                  src="/optical-lab/current-production.png"
                  unoptimized
                />
              </div>
            </figure>
          </>
        ) : null}

        <figure
          className={`${styles.panel} ${isAssetCandidate ? styles.assetPanel : ''}`}
          data-optical-lab-panel="candidate"
        >
          {!isAssetCandidate ? (
            <figcaption className={styles.caption}>
              <span>03</span>
              <strong>{t('candidateTitle')}</strong>
              <small>{t('candidateNote')}</small>
            </figcaption>
          ) : null}
          {isAssetCandidate ? (
            <AcceptedOpticalSurface
              diagnosticsId="optical-lab-diagnostics"
              labels={{
                bounds: t('bounds'),
                context: t('context'),
                fps: t('fps'),
                frameTime: t('frameTime'),
                gpuTime: t('gpuTime'),
                mode: t('mode'),
              }}
              stageId="optical-lab-candidate"
              surface="lab"
            />
          ) : (
            <>
              <div
                className={`${styles.candidate} ${styles.typographyArchivo} ${archivo.className}`}
                data-context-status={contextStatus}
                data-optical-ink="dom"
                data-optical-lab-candidate="true"
                data-optical-lab-candidate-stage="true"
                data-optical-render-phase={OPTICAL_LAB_RENDER_PHASE}
                data-render-mode={renderMode}
                data-stable-bounds={stableBounds}
                id="optical-lab-candidate"
              >
              <img
                alt=""
                aria-hidden="true"
                className={styles.staticFallback}
                data-optical-lab-static-fallback="true"
                src="/optical-lab/accepted-resting.png"
              />
                <h1 className={styles.headline} data-optical-lab-semantic-title="true">
                  <span className={styles.science} data-optical-lab-science="true"><span className={styles.scienceInk}>Science</span></span>{' '}
                  <span className={styles.evolves} data-optical-lab-evolves="true"><span className={styles.evolvesInk} data-optical-lab-evolves-ink="true">evolves<span className={styles.marker}>.</span></span></span>
                  <span aria-hidden="true" className={styles.baselineProbe} data-optical-lab-baseline-probe="true" />
                </h1>
                <div className={styles.clientSlot} data-optical-lab-client-slot="true">
                  <OpticalLabClientMount diagnosticsId="optical-lab-diagnostics" stageId="optical-lab-candidate" />
                </div>
              </div>
              <dl
                className={styles.diagnostics}
                data-aperture-x="0.58"
                data-bloom-scale="0.25"
                data-context-status={contextStatus}
                data-cpu-frame-ms="0"
                data-fps="0"
                data-frame-count="0"
                data-first-complete-frame="false"
                data-flow-texture="inactive"
                data-gpu-frame-ms="unavailable"
                data-gpu-timing="unavailable"
                data-optical-lab-diagnostics="true"
                data-particle-count="0"
                data-particle-renderer="unavailable"
                data-quality-tier="static"
                data-render-mode={renderMode}
                data-renderer={displayMode}
                data-resource-counts="{}"
                data-stable-bounds={stableBounds}
                id="optical-lab-diagnostics"
              >
                <div><dt>{t('mode')}</dt><dd data-diagnostic-value="mode">{displayMode}</dd></div>
                <div><dt>{t('context')}</dt><dd data-diagnostic-value="context">{contextStatus}</dd></div>
                <div><dt>{t('fps')}</dt><dd data-diagnostic-value="fps">0</dd></div>
                <div><dt>{t('frameTime')}</dt><dd data-diagnostic-value="frame-time">0 ms</dd></div>
                <div><dt>{t('gpuTime')}</dt><dd data-diagnostic-value="gpu-time">n/a</dd></div>
                <div><dt>{t('bounds')}</dt><dd data-diagnostic-value="bounds">{stableBounds}</dd></div>
              </dl>
            </>
          )}
        </figure>
      </section>
    </main>
  );
}

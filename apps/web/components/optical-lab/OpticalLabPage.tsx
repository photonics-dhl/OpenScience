import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { OpticalLabClientMount } from './OpticalLabClientMount';

import styles from '@/app/_visual/optical-lab/optical-lab.module.css';

export const opticalLabMetadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Optical Lab · OpenScience',
};

export async function OpticalLabPage() {
  const t = await getTranslations('opticalLab');

  return (
    <main className={styles.page} data-optical-lab="true">
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        <p className={styles.introduction}>{t('introduction')}</p>
        <div className={styles.scope}>
          <p>{t('scope')}</p>
          <Link data-optical-lab-exit="true" href="/">{t('backToLanding')}</Link>
        </div>
      </header>

      <section className={styles.comparison} aria-label={t('comparisonLabel')}>
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
              src="/optical-lab/target-reference.png"
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

        <figure className={styles.panel} data-optical-lab-panel="candidate">
          <figcaption className={styles.caption}>
            <span>03</span>
            <strong>{t('candidateTitle')}</strong>
            <small>{t('candidateNote')}</small>
          </figcaption>
          <div
            className={styles.candidate}
            data-context-status="idle"
            data-optical-ink="dom"
            data-optical-lab-candidate="true"
            data-optical-lab-candidate-stage="true"
            data-render-mode="dom-static"
            data-stable-bounds="pending"
            id="optical-lab-candidate"
          >
            <h1 className={styles.headline} data-optical-lab-semantic-title="true">
              <span className={styles.science} data-optical-lab-science="true">Science</span>
              {' '}
              <span className={styles.evolves} data-optical-lab-evolves="true">evolves<span className={styles.marker}>.</span></span>
            </h1>
            <div className={styles.clientSlot} data-optical-lab-client-slot="true">
              <OpticalLabClientMount diagnosticsId="optical-lab-diagnostics" stageId="optical-lab-candidate" />
            </div>
          </div>
          <dl
            className={styles.diagnostics}
            data-aperture-x="0.58"
            data-context-status="idle"
            data-cpu-frame-ms="0"
            data-fps="0"
            data-frame-count="0"
            data-flow-texture="inactive"
            data-gpu-frame-ms="unavailable"
            data-gpu-timing="unavailable"
            data-optical-lab-diagnostics="true"
            data-particle-count="0"
            data-particle-renderer="unavailable"
            data-render-mode="dom-static"
            data-renderer="DOM/static"
            data-stable-bounds="pending"
            id="optical-lab-diagnostics"
          >
            <div><dt>{t('mode')}</dt><dd data-diagnostic-value="mode">DOM/static</dd></div>
            <div><dt>{t('context')}</dt><dd data-diagnostic-value="context">idle</dd></div>
            <div><dt>{t('fps')}</dt><dd data-diagnostic-value="fps">0</dd></div>
            <div><dt>{t('frameTime')}</dt><dd data-diagnostic-value="frame-time">0 ms</dd></div>
            <div><dt>{t('gpuTime')}</dt><dd data-diagnostic-value="gpu-time">n/a</dd></div>
            <div><dt>{t('bounds')}</dt><dd data-diagnostic-value="bounds">pending</dd></div>
          </dl>
        </figure>
      </section>
    </main>
  );
}

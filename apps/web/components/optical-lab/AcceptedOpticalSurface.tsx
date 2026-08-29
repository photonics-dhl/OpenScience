import { Archivo } from 'next/font/google';

import { AssetInteractionMount } from './AssetInteractionMount';

import styles from '@/app/_visual/optical-lab/optical-lab.module.css';
import { OPTICAL_ASSET_URLS } from '@/lib/optical-lab/asset-manifest.mjs';
import { OPTICAL_LAB_RENDER_PHASE } from '@/lib/optical-lab/runtime-policy';

const archivo = Archivo({
  subsets: ['latin'],
  weight: '900',
  display: 'swap',
});

export interface AcceptedOpticalSurfaceLabels {
  bounds: string;
  context: string;
  fps: string;
  frameTime: string;
  gpuTime: string;
  mode: string;
}

export interface AcceptedOpticalSurfaceProps {
  diagnosticsId: string;
  labels: AcceptedOpticalSurfaceLabels;
  locale?: string;
  stageId: string;
  surface: 'lab' | 'landing';
}

export function AcceptedOpticalSurface({
  diagnosticsId,
  labels,
  locale,
  stageId,
  surface,
}: AcceptedOpticalSurfaceProps) {
  return (
    <>
      <div
        className={`${styles.candidate} ${styles.acceptedSurface} ${styles.typographyArchivo} ${archivo.className}`}
        data-accepted-optical-surface={surface}
        data-asset-candidate="true"
        data-context-status="stable"
        data-locale={locale}
        data-optical-ink="dom"
        data-optical-lab-candidate="true"
        data-optical-lab-candidate-stage="true"
        data-optical-local-active="false"
        data-optical-text-stage="true"
        data-optical-render-phase={OPTICAL_LAB_RENDER_PHASE}
        data-render-mode="asset-static"
        data-stable-bounds="stable"
        data-typography-coupling="reference-plate"
        id={stageId}
      >
        <img
          alt=""
          aria-hidden="true"
          className={styles.assetPlate}
          data-optical-lab-asset-plate="true"
          src={OPTICAL_ASSET_URLS.energyPlate}
        />
        <img
          alt=""
          aria-hidden="true"
          className={styles.targetTypographyPlate}
          data-optical-lab-target-typography-plate="true"
          src={OPTICAL_ASSET_URLS.targetReference}
        />
        <h1 className={styles.headline} data-optical-lab-semantic-title="true">
          <span className={styles.science} data-optical-lab-science="true">
            <span className={styles.scienceInk} data-optical-science="true">Science</span>
          </span>{' '}
          <span className={styles.evolves} data-optical-lab-evolves="true">
            <span
              className={styles.evolvesInk}
              data-optical-evolves="true"
              data-optical-lab-evolves-ink="true"
            >
              evolves<span className={styles.marker}>.</span>
            </span>
          </span>
          <span aria-hidden="true" className={styles.baselineProbe} data-optical-lab-baseline-probe="true" />
        </h1>
        <div className={styles.assetInteractionSlot}>
          <AssetInteractionMount diagnosticsId={diagnosticsId} stageId={stageId} />
        </div>
      </div>
      <dl
        aria-hidden="true"
        className={`${styles.diagnostics} ${styles.acceptedDiagnostics}`}
        hidden
        data-aperture-x="0.58"
        data-asset-active-raf="false"
        data-asset-caustic-gain="0"
        data-asset-follow="0"
        data-asset-patch-follow-px="0"
        data-asset-refraction-px='{"x":0,"y":0}'
        data-bloom-scale="0.25"
        data-context-status="stable"
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
        data-render-mode="asset-static"
        data-renderer="Asset/static"
        data-resource-counts="{}"
        data-stable-bounds="stable"
        id={diagnosticsId}
      >
        <div><dt>{labels.mode}</dt><dd data-diagnostic-value="mode">Asset/static</dd></div>
        <div><dt>{labels.context}</dt><dd data-diagnostic-value="context">stable</dd></div>
        <div><dt>{labels.fps}</dt><dd data-diagnostic-value="fps">0</dd></div>
        <div><dt>{labels.frameTime}</dt><dd data-diagnostic-value="frame-time">0 ms</dd></div>
        <div><dt>{labels.gpuTime}</dt><dd data-diagnostic-value="gpu-time">n/a</dd></div>
        <div><dt>{labels.bounds}</dt><dd data-diagnostic-value="bounds">stable</dd></div>
      </dl>
    </>
  );
}

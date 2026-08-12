'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  createCentralParticleLifecycle,
  createCentralParticleResizeObserver,
  handleCentralParticleContextLoss,
} from '@/lib/optical-prototype/lifecycle';
import {
  observeCentralParticlePolicy,
  probeCentralParticleWebGl2,
  resolveCentralParticleDebugTime,
} from '@/lib/optical-prototype/runtime-policy';

import styles from './central-particle.module.css';

export function CentralParticlePrototype() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const probe = document.createElement('canvas');
    const webgl2 = probeCentralParticleWebGl2(probe);
    const debugTimeMs = resolveCentralParticleDebugTime(window.location.search);

    let lifecycle: ReturnType<typeof createCentralParticleLifecycle> | null = null;
    let rendererFactory: typeof import('@/lib/optical-prototype/renderer')['createCentralParticleRenderer'] | null = null;
    let rendererImport: Promise<void> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;
    let dynamicAllowed = false;
    const visibility = () => lifecycle?.setVisible(!document.hidden);

    const stopRuntime = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      lifecycle?.dispose();
      lifecycle = null;
      if (!cancelled) setFrameReady(false);
    };

    const startRuntime = () => {
      if (cancelled || !dynamicAllowed || lifecycle || !rendererFactory) return;
      lifecycle = createCentralParticleLifecycle({
        createCanvas: () => document.createElement('canvas'),
        createRenderer: (canvas) => rendererFactory!(
          canvas as HTMLCanvasElement,
          undefined,
          debugTimeMs === null ? {} : { fixedTimeMs: debugTimeMs },
        ),
        mountCanvas: (canvas) => {
          const element = canvas as HTMLCanvasElement;
          const owner = lifecycle;
          element.setAttribute('aria-hidden', 'true');
          element.addEventListener('webglcontextlost', (event) => {
            if (!owner) return;
            handleCentralParticleContextLoss(event, {
              contextLost: owner.contextLost,
              isCancelled: () => cancelled,
              isCurrentOwner: () => lifecycle === owner,
              isRecoverable: () => owner.snapshot().active,
              replaceResizeObserver: () => {
                resizeObserver?.disconnect();
                resizeObserver = createCentralParticleResizeObserver({ owner, target: mount });
              },
              restore: owner.restore,
            });
          }, { once: true });
          mount.append(element);
        },
        publishFrame: () => setFrameReady(true),
        retractFrame: () => {
          if (!cancelled) setFrameReady(false);
        },
      });
      const owner = lifecycle;
      if (!owner.start()) {
        lifecycle = null;
        return;
      }
      resizeObserver = createCentralParticleResizeObserver({ owner, target: mount });
      visibility();
    };

    const startWhenLoaded = () => {
      if (rendererFactory) {
        startRuntime();
        return;
      }
      rendererImport ??= import('@/lib/optical-prototype/renderer')
        .then(({ createCentralParticleRenderer }) => {
          rendererFactory = createCentralParticleRenderer;
          startRuntime();
        })
        .catch(() => {
          if (!cancelled) setFrameReady(false);
        });
    };

    const stopPolicy = observeCentralParticlePolicy({
      motion,
      onMode: (mode) => {
        dynamicAllowed = mode === 'dynamic';
        if (mode === 'dynamic') startWhenLoaded();
        else stopRuntime();
      },
      source: window,
      webgl2,
    });
    document.addEventListener('visibilitychange', visibility);

    return () => {
      cancelled = true;
      stopPolicy();
      document.removeEventListener('visibilitychange', visibility);
      stopRuntime();
    };
  }, []);

  return (
    <main
      className={styles.shell}
      data-central-particle-shell="true"
      data-gpu-ready={String(frameReady)}
    >
      <h1 className={styles.title} data-central-particle-title="true">
        <span>Science evolves.</span>
        <img
          alt=""
          aria-hidden="true"
          className={styles.outline}
          height="935"
          src="/optical-prototype/title-outline.svg"
          width="1672"
        />
      </h1>
      <div
        aria-hidden="true"
        className={styles.mount}
        data-central-particle-mount="true"
        data-frame-ready={String(frameReady)}
        ref={mountRef}
      />
    </main>
  );
}

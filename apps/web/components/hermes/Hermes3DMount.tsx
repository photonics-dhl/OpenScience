'use client';

import React, { useEffect, useRef } from 'react';

import type {
  Hermes3DRendererHandle,
  Hermes3DSnapshot,
  Hermes3DSubjectBounds,
} from '@/lib/hermes/hermes-3d-renderer';
import { hermesActionForState } from '@/lib/hermes/hermes-action-map';

import type { HermesVisualState } from './hermes-state';

export interface Hermes3DMountProps {
  onFailure(): void;
  onFirstFrame(): void;
  onUnavailable(): void;
  state: HermesVisualState;
}

declare global {
  interface Window {
    __OPENSCIENCE_HERMES_3D__?: Hermes3DSnapshot;
    __OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__?: () => Promise<Hermes3DSubjectBounds>;
  }
}

export function Hermes3DMount({ onFailure, onFirstFrame, onUnavailable, state }: Hermes3DMountProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Hermes3DRendererHandle | null>(null);
  const generationRef = useRef(0);
  const failureRef = useRef(onFailure);
  const firstFrameRef = useRef(onFirstFrame);
  const unavailableRef = useRef(onUnavailable);
  const stateRef = useRef(state);

  failureRef.current = onFailure;
  firstFrameRef.current = onFirstFrame;
  unavailableRef.current = onUnavailable;
  stateRef.current = state;

  useEffect(() => {
    rendererRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const generation = ++generationRef.current;
    const link = host.closest('a');
    const motionPolicy = window.matchMedia('(prefers-reduced-motion: reduce)');
    let canvas: HTMLCanvasElement | null = null;
    let contextLost: ((event: Event) => void) | null = null;
    let disposed = false;
    let idleHandle: number | null = null;
    let intersecting = false;
    let observer: IntersectionObserver | null = null;
    let ownedRenderer: Hermes3DRendererHandle | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const ownsGeneration = () => generationRef.current === generation;
    const teardown = (notifyUnavailable = false) => {
      if (canvas && contextLost) canvas.removeEventListener('webglcontextlost', contextLost);
      if (rendererRef.current === ownedRenderer) rendererRef.current = null;
      ownedRenderer?.dispose();
      ownedRenderer = null;
      canvas?.remove();
      canvas = null;
      contextLost = null;
      if (ownsGeneration()) {
        Reflect.deleteProperty(window, '__OPENSCIENCE_HERMES_3D__');
        Reflect.deleteProperty(window, '__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__');
        if (notifyUnavailable) unavailableRef.current();
      }
    };

    const canRender = () => !disposed && intersecting && !document.hidden && !motionPolicy.matches;

    const initialize = async () => {
      if (!canRender() || rendererRef.current || canvas) return;
      const ownedCanvas = document.createElement('canvas');
      ownedCanvas.setAttribute('data-hermes-3d-canvas', 'true');
      ownedCanvas.setAttribute('aria-hidden', 'true');
      host.append(ownedCanvas);
      canvas = ownedCanvas;
      contextLost = (event) => {
        event.preventDefault();
        teardown(true);
        failureRef.current();
      };
      ownedCanvas.addEventListener('webglcontextlost', contextLost);
      try {
        const { createHermes3DRenderer } = await import('@/lib/hermes/hermes-3d-renderer');
        if (!canRender() || canvas !== ownedCanvas) {
          if (canvas === ownedCanvas) {
            ownedCanvas.removeEventListener('webglcontextlost', contextLost);
            ownedCanvas.remove();
            canvas = null;
            contextLost = null;
          }
          return;
        }
        ownedRenderer = createHermes3DRenderer({
          assetUrl: '/hermes/hermes-scholar.glb',
          canvas: ownedCanvas,
          onFailure: () => {
            if (!ownsGeneration()) return;
            teardown(true);
            failureRef.current();
          },
          onFirstFrame: () => firstFrameRef.current(),
          onSnapshot: (snapshot) => {
            window.__OPENSCIENCE_HERMES_3D__ = snapshot;
            host.dataset.contextStatus = snapshot.contextStatus;
            host.dataset.frameCount = String(snapshot.frameCount);
          },
          state: stateRef.current,
        });
        rendererRef.current = ownedRenderer;
        window.__OPENSCIENCE_HERMES_3D_CAPTURE_BOUNDS__ = () => {
          if (!ownedRenderer || rendererRef.current !== ownedRenderer) {
            return Promise.reject(new Error('Hermes renderer ownership changed'));
          }
          return ownedRenderer.captureBounds();
        };
      } catch {
        if (disposed || !ownsGeneration()) return;
        teardown(true);
        failureRef.current();
      }
    };

    const scheduleInitialize = () => {
      if (!canRender() || rendererRef.current || canvas) return;
      if ('requestIdleCallback' in window) {
        if (idleHandle !== null) return;
        idleHandle = window.requestIdleCallback(() => {
          idleHandle = null;
          void initialize();
        }, { timeout: 700 });
      } else {
        if (timeoutHandle !== null) return;
        timeoutHandle = globalThis.setTimeout(() => {
          timeoutHandle = null;
          void initialize();
        }, 0);
      }
    };

    const reconcile = () => {
      if (canRender()) {
        if (rendererRef.current) rendererRef.current.setVisible(true);
        else scheduleInitialize();
      } else if (rendererRef.current) {
        rendererRef.current.setVisible(false);
      }
      if (motionPolicy.matches) teardown(true);
    };

    const onPointerMove = (event: Event) => {
      if (!(event instanceof PointerEvent) || !link || !rendererRef.current) return;
      const bounds = link.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - .5) * 2;
      const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - .5) * 2;
      rendererRef.current.setPointer(x, y);
    };
    const onPointerLeave = () => rendererRef.current?.setPointer(0, 0);
    const onResize = () => rendererRef.current?.resize();
    const onVisibility = () => reconcile();
    const onMotionChange = () => reconcile();

    link?.addEventListener('pointermove', onPointerMove, { passive: true });
    link?.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    motionPolicy.addEventListener('change', onMotionChange);
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        intersecting = Boolean(entry?.isIntersecting);
        reconcile();
      }, { threshold: .01 });
      observer.observe(host);
    } else {
      intersecting = true;
      reconcile();
    }

    return () => {
      disposed = true;
      if (idleHandle !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      link?.removeEventListener('pointermove', onPointerMove);
      link?.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      motionPolicy.removeEventListener('change', onMotionChange);
      observer?.disconnect();
      teardown(false);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="hermes-3d-host absolute inset-0"
      data-hermes-3d-host="true"
      data-hermes-3d-policy={state === 'awaiting_approval' ? 'still' : 'animated'}
      data-hermes-action={hermesActionForState(state)}
      ref={hostRef}
    />
  );
}

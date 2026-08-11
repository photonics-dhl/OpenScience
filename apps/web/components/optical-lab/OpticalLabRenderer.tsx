'use client';

import { useEffect, useRef } from 'react';

import { createOpticalRendererOwnership } from '@/lib/optical-lab/ogl/lifecycle';
import { createOpticalOglRenderer, type OpticalOglRendererSnapshot } from '@/lib/optical-lab/ogl/renderer';
import {
  acquireOpticalWebGL2Context,
  chooseOpticalRuntime,
  type OpticalRuntime,
} from '@/lib/optical-lab/runtime-policy';

export interface OpticalLabRendererProps {
  diagnosticsId: string;
  stageId: string;
}

declare global {
  interface Window {
    __OPENSCIENCE_OPTICAL_LAB__?: {
      activeRaf: boolean;
      contextStatus: string;
      frameCount: number;
      mode: string;
      resourceCounts: OpticalOglRendererSnapshot['resourceCounts'];
    };
  }
}

function setText(diagnostics: HTMLElement, selector: string, value: string) {
  const node = diagnostics.querySelector<HTMLElement>(`[data-diagnostic-value="${selector}"]`);
  if (node) node.textContent = value;
}

function setOpticalInk(stage: HTMLElement, snapshot?: OpticalOglRendererSnapshot) {
  stage.dataset.opticalInk = snapshot?.firstCompleteFrame && snapshot.layoutStable ? 'gpu' : 'dom';
}

export function OpticalLabRenderer({ diagnosticsId, stageId }: OpticalLabRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const stage = document.getElementById(stageId);
    const diagnostics = document.getElementById(diagnosticsId);
    if (!host || !stage || !diagnostics) return;
    const motionPolicy = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ownership = createOpticalRendererOwnership();
    let runtime: OpticalRuntime = 'dom-only';

    const publishStatic = (nextRuntime: Exclude<OpticalRuntime, 'webgl2-full'>, status: string) => {
      runtime = nextRuntime;
      stage.dataset.renderMode = nextRuntime;
      stage.dataset.contextStatus = status;
      setOpticalInk(stage);
      diagnostics.dataset.renderMode = nextRuntime;
      diagnostics.dataset.contextStatus = status;
      diagnostics.dataset.firstCompleteFrame = 'false';
      diagnostics.dataset.qualityTier = 'static';
      diagnostics.dataset.renderer = nextRuntime === 'dom-only' ? 'DOM only' : 'DOM/static interim';
      setText(diagnostics, 'mode', nextRuntime);
      setText(diagnostics, 'context', status);
      window.__OPENSCIENCE_OPTICAL_LAB__ = {
        activeRaf: false,
        contextStatus: status,
        frameCount: 0,
        mode: nextRuntime,
        resourceCounts: {
          buffers: 0,
          framebuffers: 0,
          programs: 0,
          renderbuffers: 0,
          shaders: 0,
          textures: 0,
          vertexArrays: 0,
        },
      };
    };

    const update = (snapshot: OpticalOglRendererSnapshot) => {
      if (snapshot.contextStatus === 'unavailable') {
        ownership.teardownForUnavailable(() => publishStatic('static-fallback', 'unavailable'));
        return;
      }
      stage.dataset.renderMode = snapshot.mode;
      stage.dataset.contextStatus = snapshot.contextStatus;
      setOpticalInk(stage, snapshot);
      stage.dataset.stableBounds = snapshot.stableBounds;
      diagnostics.dataset.renderMode = snapshot.mode;
      diagnostics.dataset.contextStatus = snapshot.contextStatus;
      diagnostics.dataset.firstCompleteFrame = String(snapshot.firstCompleteFrame);
      diagnostics.dataset.frameCount = String(snapshot.frameCount);
      diagnostics.dataset.qualityTier = snapshot.qualityTier;
      diagnostics.dataset.renderer = 'OGL WebGL2 shell';
      diagnostics.dataset.resourceCounts = JSON.stringify(snapshot.resourceCounts);
      diagnostics.dataset.stableBounds = snapshot.stableBounds;
      setText(diagnostics, 'mode', snapshot.mode);
      setText(diagnostics, 'context', snapshot.contextStatus);
      setText(diagnostics, 'bounds', snapshot.stableBounds);
      window.__OPENSCIENCE_OPTICAL_LAB__ = {
        activeRaf: snapshot.activeRaf,
        contextStatus: snapshot.contextStatus,
        frameCount: snapshot.frameCount,
        mode: snapshot.mode,
        resourceCounts: snapshot.resourceCounts,
      };
    };

    const stop = () => ownership.teardown();

    const start = () => {
      stop();
      const reducedMotion = motionPolicy.matches;
      const lowPower = window.innerWidth <= 480;
      if (reducedMotion || lowPower) {
        publishStatic('static-fallback', 'idle');
        return;
      }
      if (typeof HTMLCanvasElement === 'undefined') {
        publishStatic('dom-only', 'unavailable');
        return;
      }

      const canvas = document.createElement('canvas');
      const webgl2 = acquireOpticalWebGL2Context(canvas);
      const chosenRuntime = chooseOpticalRuntime({
        canvas: true,
        initializationFailed: false,
        lowPower,
        reducedMotion,
        webgl2,
      });
      runtime = chosenRuntime;
      if (chosenRuntime !== 'webgl2-full') {
        publishStatic(chosenRuntime, 'unavailable');
        return;
      }

      canvas.dataset.opticalLabCanvas = 'true';
      canvas.setAttribute('aria-hidden', 'true');
      host.append(canvas);
      const ownedCanvas = canvas;
      const onContextLost = (event: Event) => {
        event.preventDefault();
        ownership.suspendForContextRestore();
        publishStatic('static-fallback', 'lost');
      };
      const onContextRestored = () => start();
      ownedCanvas.addEventListener('webglcontextlost', onContextLost);
      ownedCanvas.addEventListener('webglcontextrestored', onContextRestored);
      const removeCanvasListeners = () => {
        ownedCanvas.removeEventListener('webglcontextlost', onContextLost);
        ownedCanvas.removeEventListener('webglcontextrestored', onContextRestored);
      };

      try {
        const renderer = createOpticalOglRenderer(ownedCanvas, stage, update);
        ownership.attach(ownedCanvas, renderer, removeCanvasListeners);
      } catch {
        removeCanvasListeners();
        ownedCanvas.remove();
        const failedRuntime = chooseOpticalRuntime({
          canvas: true,
          initializationFailed: true,
          lowPower,
          reducedMotion,
          webgl2,
        });
        publishStatic(failedRuntime === 'webgl2-full' ? 'static-fallback' : failedRuntime, 'unavailable');
      }
    };

    const onResize = () => {
      const requiresStatic = motionPolicy.matches || window.innerWidth <= 480;
      if (requiresStatic !== (runtime !== 'webgl2-full')) start();
      else ownership.current().renderer?.resize();
    };
    start();
    motionPolicy.addEventListener('change', start);
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      motionPolicy.removeEventListener('change', start);
      window.removeEventListener('resize', onResize);
      stop();
    };
  }, [diagnosticsId, stageId]);

  return <div aria-hidden="true" data-optical-lab-canvas-host="true" ref={hostRef} />;
}

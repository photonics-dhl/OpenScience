'use client';

import { useEffect, useRef, useState } from 'react';

import { OPTICAL_LAB_APERTURE_X } from '@/lib/optical-lab/model';
import {
  createOpticalLabWebGLRenderer,
  type OpticalLabRendererSnapshot,
} from '@/lib/optical-lab/webgl-renderer';

const FLOW_TEXTURE_LABEL = '96x54 RGBA8 ping-pong · dissipation .955';

export interface OpticalLabRendererProps {
  diagnosticsId: string;
  stageId: string;
}

declare global {
  interface Window {
    __OPENSCIENCE_OPTICAL_LAB__?: {
      activeRaf: boolean;
      contextStatus: string;
      mode: string;
    };
  }
}

function setText(diagnostics: HTMLElement, selector: string, value: string) {
  const node = diagnostics.querySelector<HTMLElement>(`[data-diagnostic-value="${selector}"]`);
  if (node) node.textContent = value;
}

function setOpticalInk(stage: HTMLElement, contextStatus: string) {
  stage.dataset.opticalInk = contextStatus === 'ready' ? 'gpu' : 'dom';
}

export function OpticalLabRenderer({ diagnosticsId, stageId }: OpticalLabRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountCanvas, setMountCanvas] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const stage = document.getElementById(stageId);
    const diagnostics = document.getElementById(diagnosticsId);
    if (!stage || !diagnostics) return;
    const motionPolicy = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyPolicy = () => {
      const bounds = stage.getBoundingClientRect();
      const stableBounds = `${bounds.x.toFixed(1)},${bounds.y.toFixed(1)},${bounds.width.toFixed(1)},${bounds.height.toFixed(1)}`;
      stage.dataset.stableBounds = stableBounds;
      diagnostics.dataset.stableBounds = stableBounds;
      diagnostics.dataset.apertureX = String(OPTICAL_LAB_APERTURE_X);
      setText(diagnostics, 'bounds', stableBounds);
      const reducedMotion = motionPolicy.matches;
      const lowPower = window.innerWidth <= 480;
      if (!reducedMotion && !lowPower) {
        setMountCanvas(true);
        return;
      }
      setMountCanvas(false);
      stage.dataset.renderMode = 'dom-static';
      stage.dataset.contextStatus = 'idle';
      setOpticalInk(stage, 'idle');
      diagnostics.dataset.renderMode = 'dom-static';
      diagnostics.dataset.contextStatus = 'idle';
      diagnostics.dataset.renderer = reducedMotion ? 'DOM/static · reduced motion' : 'DOM/static · low power';
      setText(diagnostics, 'mode', 'DOM/static');
      setText(diagnostics, 'context', 'idle');
      window.__OPENSCIENCE_OPTICAL_LAB__ = { activeRaf: false, contextStatus: 'idle', mode: 'dom-static' };
    };
    applyPolicy();
    motionPolicy.addEventListener('change', applyPolicy);
    window.addEventListener('resize', applyPolicy, { passive: true });
    return () => {
      motionPolicy.removeEventListener('change', applyPolicy);
      window.removeEventListener('resize', applyPolicy);
    };
  }, [diagnosticsId, stageId]);

  useEffect(() => {
    const host = hostRef.current;
    const stage = document.getElementById(stageId);
    const diagnostics = document.getElementById(diagnosticsId);
    if (!mountCanvas || !host || !stage || !diagnostics) return;

    const update = (snapshot: OpticalLabRendererSnapshot) => {
      stage.dataset.renderMode = snapshot.contextStatus === 'ready' ? snapshot.mode : 'dom-static';
      stage.dataset.contextStatus = snapshot.contextStatus;
      setOpticalInk(stage, snapshot.contextStatus);
      stage.dataset.stableBounds = snapshot.bounds;
      diagnostics.dataset.renderMode = snapshot.contextStatus === 'ready' ? snapshot.mode : 'dom-static';
      diagnostics.dataset.contextStatus = snapshot.contextStatus;
      diagnostics.dataset.frameCount = String(snapshot.frameCount);
      diagnostics.dataset.flowTexture = `${FLOW_TEXTURE_LABEL}`;
      diagnostics.dataset.fps = snapshot.fps.toFixed(1);
      diagnostics.dataset.cpuFrameMs = snapshot.cpuFrameMs.toFixed(2);
      diagnostics.dataset.gpuFrameMs = snapshot.gpuFrameMs?.toFixed(2) ?? 'unavailable';
      diagnostics.dataset.gpuTiming = snapshot.gpuTiming;
      diagnostics.dataset.particleCount = String(snapshot.particleCount);
      diagnostics.dataset.particleRenderer = snapshot.particleRenderer;
      diagnostics.dataset.renderer = snapshot.renderer;
      diagnostics.dataset.stableBounds = snapshot.bounds;
      setText(diagnostics, 'mode', snapshot.contextStatus === 'ready' ? snapshot.mode : 'DOM/static');
      setText(diagnostics, 'context', snapshot.contextStatus);
      setText(diagnostics, 'fps', snapshot.fps.toFixed(1));
      setText(diagnostics, 'frame-time', `${snapshot.cpuFrameMs.toFixed(2)} ms`);
      setText(diagnostics, 'gpu-time', snapshot.gpuFrameMs === null ? 'n/a' : `${snapshot.gpuFrameMs.toFixed(2)} ms`);
      setText(diagnostics, 'bounds', snapshot.bounds);
      window.__OPENSCIENCE_OPTICAL_LAB__ = {
        activeRaf: snapshot.activeRaf,
        contextStatus: snapshot.contextStatus,
        mode: snapshot.contextStatus === 'ready' ? snapshot.mode : 'dom-static',
      };
    };

    let renderer: ReturnType<typeof createOpticalLabWebGLRenderer> = null;
    try {
      renderer = createOpticalLabWebGLRenderer(host, stage, update);
    } catch {
      // A viable context may still reject a shader or framebuffer. Preserve the semantic fallback.
    }
    if (!renderer) {
      setMountCanvas(false);
      stage.dataset.renderMode = 'dom-static';
      stage.dataset.contextStatus = 'unavailable';
      setOpticalInk(stage, 'unavailable');
      diagnostics.dataset.renderMode = 'dom-static';
      diagnostics.dataset.contextStatus = 'unavailable';
      setText(diagnostics, 'mode', 'DOM/static');
      setText(diagnostics, 'context', 'unavailable');
      window.__OPENSCIENCE_OPTICAL_LAB__ = {
        activeRaf: false,
        contextStatus: 'unavailable',
        mode: 'dom-static',
      };
      return;
    }

    const onContextLost = (event: Event) => {
      event.preventDefault();
      renderer.dispose();
      stage.dataset.renderMode = 'dom-static';
      stage.dataset.contextStatus = 'lost';
      setOpticalInk(stage, 'lost');
      diagnostics.dataset.renderMode = 'dom-static';
      diagnostics.dataset.contextStatus = 'lost';
      setText(diagnostics, 'mode', 'DOM/static');
      setText(diagnostics, 'context', 'lost');
      window.__OPENSCIENCE_OPTICAL_LAB__ = { activeRaf: false, contextStatus: 'lost', mode: 'dom-static' };
    };
    const onContextRestored = () => setGeneration((value) => value + 1);
    renderer.canvas.addEventListener('webglcontextlost', onContextLost);
    renderer.canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      renderer.canvas.removeEventListener('webglcontextlost', onContextLost);
      renderer.canvas.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.dispose();
    };
  }, [diagnosticsId, generation, mountCanvas, stageId]);

  if (!mountCanvas) return null;
  return <div aria-hidden="true" data-optical-lab-canvas-host="true" ref={hostRef} />;
}

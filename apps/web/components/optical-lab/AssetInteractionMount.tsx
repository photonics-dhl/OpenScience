'use client';

import { useEffect, useRef } from 'react';

import {
  mapAssetPointerVelocity,
  type AssetInteractionInput,
} from '@/lib/optical-lab/asset-interaction-model';
import {
  createAssetInteractionRenderer,
  type AssetInteractionFrameCapture,
  type AssetInteractionRenderer,
  type AssetInteractionSnapshot,
} from '@/lib/optical-lab/ogl/asset-interaction-renderer';

export interface AssetInteractionMountProps {
  diagnosticsId: string;
  stageId: string;
}

declare global {
  interface Window {
    __OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?: AssetInteractionSnapshot;
    __OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__?: () => Promise<AssetInteractionFrameCapture>;
  }
}

const emptySnapshot = (
  contextStatus: AssetInteractionSnapshot['contextStatus'],
  suspended = false,
): AssetInteractionSnapshot => ({
  activeRaf: false,
  ambientPhase: 0,
  ambientStrength: 0,
  apertureX: .58,
  causticGain: 0,
  contextStatus,
  follow: 0,
  patchFollowPx: 0,
  pointerX: .5,
  pointerY: .5,
  refractionPx: { x: 0, y: 0 },
  resourceCounts: {
    buffers: 0,
    framebuffers: 0,
    programs: 0,
    renderbuffers: 0,
    shaders: 0,
    textures: 0,
    vertexArrays: 0,
  },
  suspended,
});

export function AssetInteractionMount({ diagnosticsId, stageId }: AssetInteractionMountProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const stage = document.getElementById(stageId);
    const diagnostics = document.getElementById(diagnosticsId);
    if (!host || !stage || !diagnostics) return;

    const motionPolicy = window.matchMedia('(prefers-reduced-motion: reduce)');
    let canvas: HTMLCanvasElement | null = null;
    let contextLostListener: ((event: Event) => void) | null = null;
    let failed = false;
    let failureTeardownScheduled = false;
    let generation = 0;
    let intersecting = false;
    let intersectionObserver: IntersectionObserver | null = null;
    let mounted = true;
    let pendingInput: { input: AssetInteractionInput; now: number } | null = null;
    let previousPointer: { at: number; pointerId: number; x: number; y: number } | null = null;
    let renderer: AssetInteractionRenderer | null = null;
    let rendererPromise: Promise<AssetInteractionRenderer> | null = null;

    const publish = (snapshot: AssetInteractionSnapshot) => {
      window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__ = snapshot;
      stage.dataset.contextStatus = snapshot.contextStatus;
      stage.dataset.opticalLocalActive = String(snapshot.follow > 0);
      stage.dataset.renderMode = snapshot.activeRaf ? 'asset-interactive' : 'asset-static';
      diagnostics.dataset.apertureX = String(snapshot.apertureX);
      diagnostics.dataset.assetActiveRaf = String(snapshot.activeRaf);
      diagnostics.dataset.assetAmbientPhase = String(snapshot.ambientPhase);
      diagnostics.dataset.assetAmbientStrength = String(snapshot.ambientStrength);
      diagnostics.dataset.assetCausticGain = String(snapshot.causticGain);
      diagnostics.dataset.assetFollow = String(snapshot.follow);
      diagnostics.dataset.assetPatchFollowPx = String(snapshot.patchFollowPx);
      diagnostics.dataset.assetPointerX = String(snapshot.pointerX);
      diagnostics.dataset.assetPointerY = String(snapshot.pointerY);
      diagnostics.dataset.assetRefractionPx = JSON.stringify(snapshot.refractionPx);
      diagnostics.dataset.contextStatus = snapshot.contextStatus;
      diagnostics.dataset.flowTexture = snapshot.activeRaf ? '96x54-ping-pong' : 'inactive';
      diagnostics.dataset.renderMode = snapshot.activeRaf ? 'asset-interactive' : 'asset-static';
      diagnostics.dataset.resourceCounts = JSON.stringify(snapshot.resourceCounts);
      diagnostics.dataset.assetSuspended = String(snapshot.suspended);
      if (
        snapshot.contextStatus === 'unavailable'
        && !failureTeardownScheduled
        && Boolean(renderer || rendererPromise || canvas)
      ) {
        failureTeardownScheduled = true;
        queueMicrotask(() => {
          failureTeardownScheduled = false;
          if (window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__?.contextStatus !== 'unavailable') return;
          failed = true;
          teardown('unavailable');
        });
      }
    };

    const removeCanvas = () => {
      if (canvas && contextLostListener) {
        canvas.removeEventListener('webglcontextlost', contextLostListener);
      }
      canvas?.remove();
      canvas = null;
      contextLostListener = null;
    };

    const teardown = (status: AssetInteractionSnapshot['contextStatus'], suspended = false) => {
      generation += 1;
      Reflect.deleteProperty(window, '__OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__');
      const ownedRenderer = renderer;
      renderer = null;
      pendingInput = null;
      ownedRenderer?.setSuspended(true);
      ownedRenderer?.dispose();
      removeCanvas();
      publish(emptySnapshot(status, suspended));
    };

    const canRender = () => intersecting && !document.hidden && !motionPolicy.matches;

    const ensureRenderer = (input?: AssetInteractionInput, now = performance.now()) => {
      if (input) pendingInput = { input, now };
      if (renderer) {
        if (input) renderer.updatePointer(input, now);
        return;
      }
      if (!mounted || rendererPromise || failed || !canRender()) return;

      const ownedGeneration = ++generation;
      const ownedCanvas = document.createElement('canvas');
      ownedCanvas.dataset.opticalAssetInteractionCanvas = 'true';
      ownedCanvas.setAttribute('aria-hidden', 'true');
      host.append(ownedCanvas);
      canvas = ownedCanvas;
      contextLostListener = (event: Event) => {
        event.preventDefault();
        if (ownedGeneration !== generation) return;
        failed = true;
        teardown('unavailable');
      };
      ownedCanvas.addEventListener('webglcontextlost', contextLostListener);

      const publishOwned = (snapshot: AssetInteractionSnapshot) => {
        if (!mounted || ownedGeneration !== generation) return;
        publish(snapshot);
      };
      const creation = createAssetInteractionRenderer(ownedCanvas, stage, publishOwned);
      rendererPromise = creation;
      void creation.then((created) => {
        if (!mounted || ownedGeneration !== generation || rendererPromise !== creation) {
          created.dispose();
          return;
        }
        rendererPromise = null;
        if (!canRender()) {
          created.dispose();
          removeCanvas();
          return;
        }
        renderer = created;
        window.__OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__ = () => {
          if (!mounted || ownedGeneration !== generation || renderer !== created) {
            return Promise.reject(new Error('Interaction renderer ownership changed'));
          }
          return created.captureNextFrame();
        };
        if (!ownedCanvas.isConnected) host.append(ownedCanvas);
        if (pendingInput) renderer.updatePointer(pendingInput.input, pendingInput.now);
      }).catch(() => {
        if (rendererPromise === creation) rendererPromise = null;
        if (!mounted || ownedGeneration !== generation) return;
        failed = true;
        removeCanvas();
        publish(emptySnapshot('unavailable'));
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = stage.getBoundingClientRect();
      const now = performance.now();
      const sampleAt = event.timeStamp;
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const previous = previousPointer?.pointerId === event.pointerId ? previousPointer : null;
      previousPointer = { at: sampleAt, pointerId: event.pointerId, x, y };
      if (!previous) return;
      const { velocityX, velocityY } = mapAssetPointerVelocity(
        x - previous.x,
        y - previous.y,
        sampleAt - previous.at,
      );
      if (Math.hypot(velocityX, velocityY) < .002) return;
      ensureRenderer({
        pointerX: Math.min(1, Math.max(0, x / Math.max(1, bounds.width))),
        pointerY: Math.min(1, Math.max(0, y / Math.max(1, bounds.height))),
        velocityX,
        velocityY,
      }, now);
    };

    const onPointerDown = (event: PointerEvent) => {
      const bounds = stage.getBoundingClientRect();
      previousPointer = {
        at: event.timeStamp,
        pointerId: event.pointerId,
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional; passive whole-Hero velocity still works.
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (previousPointer?.pointerId === event.pointerId) previousPointer = null;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    };
    const onPointerLeave = () => {
      previousPointer = null;
    };
    const onResize = () => renderer?.resize();
    const reconcileVisibility = () => {
      if (canRender()) {
        if (canvas && !canvas.isConnected) host.append(canvas);
        ensureRenderer();
        return;
      }
      if (renderer) teardown('ready', true);
      else if (rendererPromise) {
        canvas?.remove();
        publish(emptySnapshot('ready', true));
      }
      else if (canvas) teardown('ready', true);
      else publish(emptySnapshot('ready', true));
    };
    const onVisibilityChange = () => reconcileVisibility();
    const onMotionChange = () => {
      failed = false;
      reconcileVisibility();
    };

    publish(emptySnapshot('ready'));
    stage.addEventListener('pointerdown', onPointerDown, { passive: true });
    stage.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('pointerup', onPointerEnd, { passive: true });
    stage.addEventListener('pointercancel', onPointerEnd, { passive: true });
    stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
    motionPolicy.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', onResize, { passive: true });
    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        intersecting = Boolean(entry?.isIntersecting);
        reconcileVisibility();
      }, { threshold: .01 });
      intersectionObserver.observe(stage);
    } else {
      intersecting = true;
      reconcileVisibility();
    }

    return () => {
      mounted = false;
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerEnd);
      stage.removeEventListener('pointercancel', onPointerEnd);
      stage.removeEventListener('pointerleave', onPointerLeave);
      motionPolicy.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      intersectionObserver?.disconnect();
      generation += 1;
      const ownedRenderer = renderer;
      renderer = null;
      pendingInput = null;
      ownedRenderer?.setSuspended(true);
      ownedRenderer?.dispose();
      removeCanvas();
      publish(emptySnapshot('disposed'));
      Reflect.deleteProperty(window, '__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__');
      Reflect.deleteProperty(window, '__OPENSCIENCE_OPTICAL_ASSET_CAPTURE_FRAME__');
    };
  }, [diagnosticsId, stageId]);

  return <div aria-hidden="true" data-optical-asset-interaction-host="true" ref={hostRef} />;
}

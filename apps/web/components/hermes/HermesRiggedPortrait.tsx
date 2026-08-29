'use client';

import * as React from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { HermesPetMeshInput, HermesPetMeshRenderer } from '@/lib/hermes/pet-mesh-renderer';
import {
  createHermesRuntimeStatus,
  getHermesRuntimeFailureReason,
  reduceHermesRuntimeStatus,
  type HermesRuntimeStatus,
} from '@/lib/hermes/hermes-runtime-status';

import type { HermesVisualState } from './hermes-state';
import { WankoCarrierScene } from './WankoCarrierScene';
export interface HermesRiggedPortraitProps {
  fallback: ReactNode;
  inputRef: MutableRefObject<HermesPetMeshInput>;
  reducedMotion: boolean;
  rendererGeneration?: number;
  state: HermesVisualState;
  onRuntimeStatus?: (status: HermesRuntimeStatus) => void;
}

export function HermesRiggedPortrait({ fallback, inputRef, onRuntimeStatus, reducedMotion, rendererGeneration = 0, state }: HermesRiggedPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HermesPetMeshRenderer | null>(null);
  const stageRef = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef(state);
  const [runtimeStatus, setRuntimeStatus] = useState<HermesRuntimeStatus>(() => createHermesRuntimeStatus(rendererGeneration));
  const staticPresentation = reducedMotion || state === 'awaiting_approval';
  stateRef.current = state;
  inputRef.current.state = state;

  const publishStatus = (next: HermesRuntimeStatus) => {
    setRuntimeStatus(next);
    onRuntimeStatus?.(next);
  };

  useEffect(() => {
    if (staticPresentation) return;
    rendererRef.current?.wake();
  }, [state, staticPresentation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const startingStatus = createHermesRuntimeStatus(rendererGeneration);
    publishStatus(startingStatus);
    const abortController = new AbortController();
    let cancelled = false;
    let contextLost = false;
    let renderer: HermesPetMeshRenderer | null = null;
    let staticFrameDrawn = false;
    let intersecting = false;
    let desiredSuspended = document.hidden;
    const applySuspension = () => {
      desiredSuspended = document.hidden || !stage.isConnected || !intersecting;
      renderer?.setSuspended(desiredSuspended);
    };
    const resizeObserver = new ResizeObserver(() => renderer?.resize());
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      intersecting = Boolean(entry?.isIntersecting);
      applySuspension();
    }, { threshold: .01 });
    const syncVisibility = () => applySuspension();
    resizeObserver.observe(stage);
    intersectionObserver.observe(stage);
    document.addEventListener('visibilitychange', syncVisibility);
    const stopOwnedRenderer = () => {
      abortController.abort();
      const ownedRenderer = renderer;
      renderer = null;
      if (rendererRef.current === ownedRenderer) rendererRef.current = null;
      ownedRenderer?.dispose();
      stage.dataset.hermesRuntimeOwner = 'stopped';
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (canvas.dataset.hermesRuntimeIntentionalContextLoss === 'true') return;
      contextLost = true;
      stopOwnedRenderer();
      publishStatus(reduceHermesRuntimeStatus(startingStatus, { reason: 'context-lost', type: 'failed' }));
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    stage.dataset.hermesRuntimeOwner = 'initializing';
    void import('@/lib/hermes/pet-mesh-renderer')
      .then(({ createWankoLive2DRenderer }) => createWankoLive2DRenderer(
        canvas,
        stage,
        () => ({
          ...inputRef.current,
          action: staticPresentation ? 'approval-still' : inputRef.current.action,
          state: stateRef.current,
        }),
        (snapshot) => {
          if (cancelled || contextLost) return;
          if (snapshot.status === 'ready') {
            publishStatus(reduceHermesRuntimeStatus(startingStatus, { at: snapshot.drawnAt, type: 'frame-drawn' }));
            if (staticPresentation) {
              staticFrameDrawn = true;
              renderer?.setSuspended(true);
            }
          }
          stage.dataset.hermesGesture = snapshot.gesture;
          canvas.dataset.hermesGesture = snapshot.gesture;
          canvas.dataset.hermesHead = `${snapshot.headAngle.toFixed(3)},0,0`;
          canvas.dataset.hermesTorso = `${(snapshot.headAngle * .35).toFixed(3)},0,0,${snapshot.torsoScale.toFixed(4)}`;
          canvas.dataset.hermesTail = `${(-snapshot.headAngle * .5).toFixed(3)},${snapshot.tailAngle.toFixed(3)}`;
        },
        abortController.signal,
      ))
      .then((created) => {
        if (cancelled || contextLost) created.dispose();
        else {
          renderer = created;
          rendererRef.current = created;
          renderer.setSuspended(desiredSuspended || staticFrameDrawn);
          stage.dataset.hermesRuntimeOwner = 'running';
        }
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        publishStatus(reduceHermesRuntimeStatus(startingStatus, {
          reason: getHermesRuntimeFailureReason(error),
          type: 'failed',
        }));
      });
    return () => {
      cancelled = true;
      abortController.abort();
      document.removeEventListener('visibilitychange', syncVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      stopOwnedRenderer();
    };
  }, [inputRef, rendererGeneration, staticPresentation]);

  return (
    <span
      className="hermes-rig-stage"
      data-hermes-gesture="still"
      data-hermes-rig="live2d-wanko"
      data-hermes-rig-status={runtimeStatus.phase}
      data-hermes-runtime-generation={runtimeStatus.generation}
      data-hermes-static-frame={staticPresentation ? 'true' : 'false'}
      data-hermes-last-draw-at={runtimeStatus.lastDrawAt ?? undefined}
      data-hermes-runtime-reason={runtimeStatus.phase === 'fallback' ? runtimeStatus.reason : undefined}
      ref={stageRef}
    >
      <span aria-hidden="true" className="hermes-rig-vector-fallback">{fallback}</span>
      <WankoCarrierScene>
        <canvas
          aria-hidden="true"
          className="hermes-rig-canvas"
          data-hermes-articulated-canvas="true"
          data-hermes-live2d-canvas="true"
          data-live2d-instance="wanko"
          key={`${staticPresentation ? 'still' : 'motion'}-${rendererGeneration}`}
          ref={canvasRef}
        />
      </WankoCarrierScene>
    </span>
  );
}

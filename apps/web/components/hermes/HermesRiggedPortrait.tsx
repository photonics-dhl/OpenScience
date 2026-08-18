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
  const runtimeActive = !reducedMotion && state !== 'awaiting_approval';
  stateRef.current = state;
  inputRef.current.state = state;

  const publishStatus = (next: HermesRuntimeStatus) => {
    setRuntimeStatus(next);
    onRuntimeStatus?.(next);
  };

  useEffect(() => {
    rendererRef.current?.wake();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !runtimeActive) return;
    const startingStatus = createHermesRuntimeStatus(rendererGeneration);
    publishStatus(startingStatus);
    const abortController = new AbortController();
    let cancelled = false;
    let contextLost = false;
    let renderer: HermesPetMeshRenderer | null = null;
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
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      publishStatus(reduceHermesRuntimeStatus(startingStatus, { reason: 'context-lost', type: 'failed' }));
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    void import('@/lib/hermes/pet-mesh-renderer')
      .then(({ createHermesPetMeshRenderer }) => createHermesPetMeshRenderer(
        canvas,
        stage,
        () => ({ ...inputRef.current, state: stateRef.current }),
        (snapshot) => {
          if (cancelled || contextLost) return;
          if (snapshot.status === 'ready') {
            publishStatus(reduceHermesRuntimeStatus(startingStatus, { at: snapshot.drawnAt, type: 'frame-drawn' }));
          }
          stage.dataset.hermesGesture = snapshot.gesture;
        },
        abortController.signal,
      ))
      .then((created) => {
        if (cancelled) created.dispose();
        else {
          renderer = created;
          rendererRef.current = created;
          renderer.setSuspended(desiredSuspended);
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
      renderer?.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
      renderer = null;
    };
  }, [inputRef, rendererGeneration, runtimeActive]);

  const fallbackSource = state === 'scanning'
    ? '/hermes/pet/hermes-pet-working.png'
    : '/hermes/pet/hermes-pet-idle.png';

  return (
    <span
      className="hermes-rig-stage"
      data-hermes-gesture="still"
      data-hermes-rig="mesh-2d"
      data-hermes-rig-status={runtimeActive ? runtimeStatus.phase : 'fallback'}
      data-hermes-runtime-generation={runtimeStatus.generation}
      data-hermes-last-draw-at={runtimeStatus.lastDrawAt ?? undefined}
      data-hermes-runtime-reason={runtimeStatus.phase === 'fallback' ? runtimeStatus.reason : undefined}
      ref={stageRef}
    >
      <span aria-hidden="true" className="hermes-rig-vector-fallback">{fallback}</span>
      <img
        alt=""
        aria-hidden="true"
        className="hermes-rig-image-fallback"
        data-hermes-frame={state === 'scanning' ? 'working' : 'idle'}
        draggable={false}
        height={824}
        src={fallbackSource}
        width={824}
      />
      <canvas
        aria-hidden="true"
        className="hermes-rig-canvas"
        data-hermes-articulated-canvas="true"
        key={`${runtimeActive ? 'motion' : 'still'}-${rendererGeneration}`}
        ref={canvasRef}
      />
    </span>
  );
}

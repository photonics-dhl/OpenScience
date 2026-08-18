'use client';

import * as React from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { HermesPetMeshInput, HermesPetMeshRenderer } from '@/lib/hermes/pet-mesh-renderer';

import type { HermesVisualState } from './hermes-state';
export interface HermesRiggedPortraitProps {
  fallback: ReactNode;
  inputRef: MutableRefObject<HermesPetMeshInput>;
  reducedMotion: boolean;
  state: HermesVisualState;
}

export function HermesRiggedPortrait({ fallback, inputRef, reducedMotion, state }: HermesRiggedPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HermesPetMeshRenderer | null>(null);
  const stageRef = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [contextGeneration, setContextGeneration] = useState(0);
  const runtimeActive = !reducedMotion && state !== 'awaiting_approval';
  stateRef.current = state;
  inputRef.current.state = state;

  useEffect(() => {
    rendererRef.current?.wake();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !runtimeActive) return;
    setReady(false);
    const abortController = new AbortController();
    let cancelled = false;
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
      setReady(false);
      setContextGeneration((generation) => generation + 1);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    void import('@/lib/hermes/pet-mesh-renderer')
      .then(({ createHermesPetMeshRenderer }) => createHermesPetMeshRenderer(
        canvas,
        stage,
        () => ({ ...inputRef.current, state: stateRef.current }),
        (snapshot) => {
          if (cancelled) return;
          if (snapshot.status === 'ready' && snapshot.firstFrame) setReady(true);
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
      .catch(() => { if (!cancelled) setReady(false); });
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
  }, [contextGeneration, inputRef, runtimeActive]);

  const fallbackSource = state === 'scanning'
    ? '/hermes/pet/hermes-pet-working.png'
    : '/hermes/pet/hermes-pet-idle.png';

  return (
    <span
      className="hermes-rig-stage"
      data-hermes-gesture="still"
      data-hermes-rig="mesh-2d"
      data-hermes-rig-status={ready && runtimeActive ? 'ready' : 'fallback'}
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
        key={`${runtimeActive ? 'motion' : 'still'}-${contextGeneration}`}
        ref={canvasRef}
      />
    </span>
  );
}

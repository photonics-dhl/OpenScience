'use client';

import { useEffect, useRef } from 'react';

import { renderOpticalField } from '@/lib/optical-field/canvas-renderer';
import {
  releaseOpticalInteraction,
  sampleOpticalField,
  smoothOpticalPoint,
  textDisplacementScale,
  type OpticalInteraction,
  type OpticalViewport,
} from '@/lib/optical-field/field-model';

declare global {
  interface Window {
    __OPENSCIENCE_VISUAL_CLOCK__?: number;
  }
}

export interface OpticalFieldProps {
  reducedMotion?: boolean;
}

function OpticalField({ reducedMotion = false }: OpticalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<OpticalInteraction | null>(null);
  const targetRef = useRef<OpticalInteraction | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const stage = canvas.closest<HTMLElement>('[data-optical-text-stage="true"]');
    const displace = stage?.querySelector<SVGElement>('[data-optical-displace="true"]');
    let frame = 0;
    let stopped = false;
    let visible = true;
    let previousFrameAt = 0;
    let pulseTimer = 0;
    let size: OpticalViewport = { width: 1, height: 1, dpr: 1 };

    const measure = () => {
      const width = Math.max(canvas.parentElement?.clientWidth ?? window.innerWidth, 1);
      const height = Math.max(canvas.parentElement?.clientHeight ?? window.innerHeight, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.25 : 1.5);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      size = { width, height, dpr };
    };

    const draw = (now: number) => {
      const target = targetRef.current;
      if (target) {
        const current = pointerRef.current ?? {
          ...target,
          x: size.width * 0.5,
          y: size.height * 0.46,
        };
        const point = smoothOpticalPoint(current, target, previousFrameAt ? now - previousFrameAt : 16);
        pointerRef.current = { ...target, ...point };
      }
      previousFrameAt = now;
      const visualClock = window.__OPENSCIENCE_VISUAL_CLOCK__;
      const sample = sampleOpticalField(pointerRef.current, size, visualClock ?? now);
      renderOpticalField(context, sample, size);
      if (stage) {
        stage.style.setProperty('--os-optical-pointer-x', `${pointerRef.current?.x ?? sample.origin.x}px`);
        stage.style.setProperty('--os-optical-x', `${sample.origin.x}px`);
        stage.style.setProperty('--os-optical-y', `${sample.origin.y}px`);
        stage.style.setProperty('--os-optical-radius', `${sample.radius}px`);
        stage.style.setProperty('--os-optical-focus', sample.evidence.toFixed(3));
        stage.style.setProperty('--os-optical-displacement', `${sample.displacement}px`);
      }
      if (displace) displace.setAttribute('scale', `${textDisplacementScale(sample)}`);
    };

    const shouldReduceMotion = () => reducedMotion || media.matches;

    const animate = (now: number) => {
      draw(now);
      if (!stopped && visible && !document.hidden) frame = window.requestAnimationFrame(animate);
    };

    const start = () => {
      window.cancelAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (shouldReduceMotion()) draw(0);
      else frame = window.requestAnimationFrame(animate);
    };

    const updatePointer = (event: PointerEvent, pressed = targetRef.current?.pressed ?? false) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;
      targetRef.current = { x, y, lastActiveAt: performance.now(), pressed };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!coarsePointer.matches) updatePointer(event);
    };
    const releasePointer = () => {
      const now = performance.now();
      const staticMode = shouldReduceMotion();
      targetRef.current = releaseOpticalInteraction(targetRef.current, now, staticMode);
      if (staticMode) pointerRef.current = null;
      if (staticMode) draw(0);
    };
    const onPointerDown = (event: PointerEvent) => {
      updatePointer(event, true);
      if (coarsePointer.matches) {
        window.clearTimeout(pulseTimer);
        pulseTimer = window.setTimeout(releasePointer, 650);
      }
      if (shouldReduceMotion()) draw(0);
    };
    const onVisibility = () => {
      if (!document.hidden) start();
    };

    const resizeObserver = new ResizeObserver(() => {
      measure();
      start();
    });
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else window.cancelAnimationFrame(frame);
    });

    stage?.addEventListener('pointermove', onPointerMove, { passive: true });
    stage?.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', releasePointer, { passive: true });
    window.addEventListener('pointercancel', releasePointer, { passive: true });
    window.addEventListener('blur', releasePointer);
    stage?.addEventListener('pointerleave', releasePointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', start);
    resizeObserver.observe(canvas.parentElement ?? canvas);
    intersectionObserver.observe(canvas.parentElement ?? canvas);
    measure();
    start();

    return () => {
      stopped = true;
      window.clearTimeout(pulseTimer);
      window.cancelAnimationFrame(frame);
      stage?.removeEventListener('pointermove', onPointerMove);
      stage?.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', releasePointer);
      stage?.removeEventListener('pointerleave', releasePointer);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', start);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [background-image:radial-gradient(circle_at_50%_46%,rgba(241,238,231,0.055)_0,transparent_34%),linear-gradient(rgba(241,238,231,0.025)_1px,transparent_1px)] [background-size:auto,100%_12px]"
      data-optical-field="true"
    >
      <canvas className="absolute inset-0 h-full w-full opacity-80 motion-reduce:opacity-45" ref={canvasRef} />
      <div className="optical-diffraction-aperture" data-diffraction-aperture="true" />
    </div>
  );
}

export { OpticalField };

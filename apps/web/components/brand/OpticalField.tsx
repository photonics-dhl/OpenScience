'use client';

import { useEffect, useRef } from 'react';

import { renderOpticalField } from '@/lib/optical-field/canvas-renderer';
import {
  releaseOpticalInteraction,
  sampleOpticalField,
  type OpticalInteraction,
  type OpticalViewport,
} from '@/lib/optical-field/field-model';

export interface OpticalFieldProps {
  reducedMotion?: boolean;
}

function OpticalField({ reducedMotion = false }: OpticalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<OpticalInteraction | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let stopped = false;
    let visible = true;
    let size: OpticalViewport = { width: 1, height: 1, dpr: 1 };

    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(canvas.parentElement?.clientWidth ?? window.innerWidth, 1);
      const height = Math.max(canvas.parentElement?.clientHeight ?? window.innerHeight, 1);
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
      renderOpticalField(context, sampleOpticalField(pointerRef.current, size, now), size);
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

    const updatePointer = (event: PointerEvent, pressed = pointerRef.current?.pressed ?? false) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;
      pointerRef.current = { x, y, lastActiveAt: performance.now(), pressed };
    };
    const onPointerMove = (event: PointerEvent) => updatePointer(event);
    const onPointerDown = (event: PointerEvent) => {
      updatePointer(event, true);
      if (shouldReduceMotion()) draw(0);
    };
    const releasePointer = () => {
      const now = performance.now();
      const staticMode = shouldReduceMotion();
      pointerRef.current = releaseOpticalInteraction(pointerRef.current, now, staticMode);
      if (staticMode) draw(0);
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

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', releasePointer, { passive: true });
    window.addEventListener('pointercancel', releasePointer, { passive: true });
    window.addEventListener('blur', releasePointer);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', start);
    resizeObserver.observe(canvas.parentElement ?? canvas);
    intersectionObserver.observe(canvas.parentElement ?? canvas);
    measure();
    start();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', releasePointer);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', start);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [background-image:radial-gradient(circle_at_50%_42%,rgba(241,238,231,0.055)_0,transparent_34%),linear-gradient(rgba(241,238,231,0.025)_1px,transparent_1px)] [background-size:auto,100%_12px]"
      data-optical-field="true"
    >
      <canvas className="absolute inset-0 h-full w-full opacity-80 motion-reduce:opacity-45" ref={canvasRef} />
    </div>
  );
}

export { OpticalField };

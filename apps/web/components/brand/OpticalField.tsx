'use client';

import { useEffect, useRef } from 'react';

import { renderOpticalField, type GlyphParticle } from '@/lib/optical-field/canvas-renderer';
import {
  releaseOpticalInteraction,
  sampleOpticalField,
  smoothOpticalPoint,
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
    let frame = 0;
    let stopped = false;
    let visible = true;
    let previousFrameAt = 0;
    let pulseTimer = 0;
    let size: OpticalViewport = { width: 1, height: 1, dpr: 1 };
    let glyphParticles: GlyphParticle[] = [];

    const rasterizeHeadline = (): GlyphParticle[] => {
      if (!stage) return [];
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = Math.max(1, Math.round(size.width));
      sourceCanvas.height = Math.max(1, Math.round(size.height));
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!sourceContext) return [];

      const fieldBounds = canvas.parentElement?.getBoundingClientRect() ?? stage.getBoundingClientRect();
      const sources = [
        stage.querySelector<HTMLElement>('[data-optical-science="true"]'),
        stage.querySelector<HTMLElement>('[data-optical-evolves="true"]'),
      ].filter((element): element is HTMLElement => Boolean(element));

      sourceContext.fillStyle = '#fff';
      for (const element of sources) {
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const text = element.textContent ?? '';
        sourceContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        sourceContext.textBaseline = 'alphabetic';
        const metrics = sourceContext.measureText(text);
        const ascent = metrics.actualBoundingBoxAscent || Number.parseFloat(style.fontSize) * 0.78;
        const descent = metrics.actualBoundingBoxDescent || Number.parseFloat(style.fontSize) * 0.18;
        const baseline = bounds.top - fieldBounds.top + (bounds.height - ascent - descent) / 2 + ascent;
        sourceContext.fillText(text, bounds.left - fieldBounds.left, baseline);
      }

      const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
      const particles: GlyphParticle[] = [];
      const spacing = size.width < 640 ? 4 : 3;
      const apertureX = size.width * 0.5;
      const fieldWidth = Math.min(size.width * 0.22, size.width < 640 ? 104 : 230);
      const minimumX = Math.max(0, Math.floor(apertureX - fieldWidth));
      const maximumX = Math.min(sourceCanvas.width, Math.ceil(apertureX + fieldWidth));

      for (let y = 0; y < sourceCanvas.height; y += spacing) {
        for (let x = minimumX; x < maximumX; x += spacing) {
          const alpha = pixels[(y * sourceCanvas.width + x) * 4 + 3] ?? 0;
          if (alpha < 42) continue;
          particles.push({ alpha: alpha / 255, x, y });
        }
      }
      return particles;
    };

    const rebuildGlyphParticles = () => {
      void document.fonts.ready.then(() => {
        if (stopped) return;
        glyphParticles = rasterizeHeadline();
        if (shouldReduceMotion() && visible && !document.hidden) draw(0);
      });
    };

    const measure = () => {
      const width = Math.max(canvas.parentElement?.clientWidth ?? window.innerWidth, 1);
      const height = Math.max(canvas.parentElement?.clientHeight ?? window.innerHeight, 1);
      const dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.25 : 1.5);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      size = { width, height, dpr };
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        rebuildGlyphParticles();
      }
    };

    const draw = (now: number) => {
      const target = targetRef.current;
      if (target) {
        const current = pointerRef.current ?? {
          ...target,
          x: size.width * 0.5,
          y: size.height * 0.5,
        };
        const point = smoothOpticalPoint(current, target, previousFrameAt ? now - previousFrameAt : 16);
        pointerRef.current = { ...target, ...point };
      }
      previousFrameAt = now;
      const visualClock = window.__OPENSCIENCE_VISUAL_CLOCK__;
      const sample = sampleOpticalField(pointerRef.current, size, visualClock ?? now);
      renderOpticalField(context, sample, size, glyphParticles);
      if (stage) {
        stage.style.setProperty('--os-optical-pointer-x', `${pointerRef.current?.x ?? sample.origin.x}px`);
        stage.style.setProperty('--os-optical-x', `${sample.aperture.x}px`);
        stage.style.setProperty('--os-optical-y', `${sample.aperture.y}px`);
        stage.style.setProperty('--os-optical-focus', sample.evidence.toFixed(3));
      }
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
      className="optical-field-viewport pointer-events-none absolute overflow-hidden [background-image:linear-gradient(rgba(241,238,231,0.025)_1px,transparent_1px)] [background-size:100%_12px]"
      data-optical-field="true"
    >
      <canvas className="absolute inset-0 h-full w-full opacity-90 motion-reduce:opacity-45" ref={canvasRef} />
      <div className="optical-diffraction-aperture" data-diffraction-aperture="true" />
    </div>
  );
}

export { OpticalField };

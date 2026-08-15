import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  releaseOpticalInteraction,
  sampleOpticalField,
  smoothOpticalPoint,
  OPTICAL_POINTER_RESPONSE_MS,
} from '../lib/optical-field/field-model';

describe('fixed-aperture glyph diffraction model', () => {
  it('pins the optical topology to the aperture for an active sample', () => {
    const sample = sampleOpticalField(
      { x: 720, y: 450, lastActiveAt: 1_250, pressed: true },
      { width: 1440, height: 900, dpr: 2 },
      1_250,
    );
    expect(sample.origin).toEqual({ x: 720, y: 450 });
    expect(sample.radius).toBeCloseTo(208.8, 5);
    expect(sample.evidence).toBe(1);
    expect(sample.aperture).toEqual({ x: 720, y: 450 });
    expect(sample.verticalBias).toBe(0);
    expect(Object.keys(sample).sort()).toEqual([
      'aperture', 'evidence', 'origin', 'phase', 'radius', 'verticalBias',
    ]);
  });

  it('never turns the pointer into a particle-field origin', () => {
    const sample = sampleOpticalField(
      { x: 180, y: 160, lastActiveAt: 500, pressed: true },
      { width: 1440, height: 900, dpr: 1 },
      500,
    );
    expect(sample.aperture).toEqual({ x: 720, y: 450 });
    expect(sample.origin).toEqual(sample.aperture);
    expect(Math.abs(sample.verticalBias)).toBeLessThanOrEqual(18);
  });

  it('stays within the optimized desktop optical envelope', () => {
    const sample = sampleOpticalField(
      { x: 720, y: 450, lastActiveAt: 400, pressed: false },
      { width: 1440, height: 900, dpr: 1 },
      400,
    );
    expect(sample.radius).toBeGreaterThanOrEqual(180);
    expect(sample.radius).toBeLessThanOrEqual(220);
    expect(sample.evidence).toBeGreaterThanOrEqual(0.8);
  });

  it('caps the mobile field while retaining a static focal origin', () => {
    const sample = sampleOpticalField(null, { width: 390, height: 844, dpr: 3 }, 0);
    expect(sample.radius).toBeGreaterThanOrEqual(90);
    expect(sample.radius).toBeLessThanOrEqual(115);
    expect(sample.origin.x).toBe(195);
    expect(sample.origin.y).toBe(422);
  });

  it('uses a fixed directional seam instead of a pointer-centered distortion lens', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).toContain("[data-optical-text-base='true']");
    expect(css).toContain('linear-gradient(');
    expect(css).toContain('to right,');
    expect(css).toContain('calc(50% - 210px)');
    expect(css).toContain('calc(50% + 145px)');
    expect(css).toContain('rgb(0 0 0 / .08) calc(50% - 70px)');
    expect(css).toContain('rgb(0 0 0 / .08) calc(50% + 42px)');
    expect(css).toContain('#000 calc(50% - 82px)');
    expect(css).toContain('#000 calc(50% + 76px)');
    expect(css).toContain('.optical-field-viewport');
    expect(css).not.toContain('radial-gradient(ellipse calc(var(--os-optical-radius)');
    expect(css).not.toContain("filter: url('#os-local-distortion')");
    expect(css).toContain("[data-optical-text-stage='true'][data-reduced-motion='true'] [data-optical-text-base='true']");
  });

  it('keeps the origin fixed while interaction energy recovers over 650ms', () => {
    const pointer = { x: 120, y: 100, lastActiveAt: 1_000, pressed: false };
    const viewport = { width: 1_000, height: 600, dpr: 1 };
    expect(sampleOpticalField(pointer, viewport, 1_000).origin).toEqual({ x: 500, y: 300 });
    expect(sampleOpticalField(pointer, viewport, 1_325).origin).toEqual({ x: 500, y: 300 });
    expect(sampleOpticalField(pointer, viewport, 1_650).origin).toEqual({ x: 500, y: 300 });
    expect(sampleOpticalField(pointer, viewport, 1_000).evidence).toBeGreaterThan(
      sampleOpticalField(pointer, viewport, 1_325).evidence,
    );
  });

  it('suspends animation offscreen and caches layout through observers', () => {
    const source = readFileSync(new URL('../components/brand/OpticalField.tsx', import.meta.url), 'utf8');
    expect(source).toContain('IntersectionObserver');
    expect(source).toContain('ResizeObserver');
  });

  it('releases held evidence on cancellation and restores the static reduced-motion field', () => {
    const held = { x: 120, y: 100, lastActiveAt: 1_000, pressed: true };
    expect(releaseOpticalInteraction(held, 1_100, false)).toEqual({
      ...held,
      lastActiveAt: 1_100,
      pressed: false,
    });
    expect(releaseOpticalInteraction(held, 1_100, true)).toBeNull();
  });

  it('eases toward pointer targets instead of binding the field directly to mousemove', () => {
    const current = { x: 0, y: 0 };
    const target = { x: 100, y: 50 };
    const first = smoothOpticalPoint(current, target, 16);
    const second = smoothOpticalPoint(first, target, 16);

    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(100);
    expect(first.y).toBeGreaterThan(0);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.x).toBeLessThan(100);
  });

  it('uses a responsive optical tracking constant without snapping to the target', () => {
    expect(OPTICAL_POINTER_RESPONSE_MS).toBe(58);
    const first = smoothOpticalPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 16);
    expect(first.x).toBeGreaterThan(20);
    expect(first.x).toBeLessThan(100);
  });

  it('renders sampled glyph particles without a mouse-radius ambient disk or radial repulsion', () => {
    const source = readFileSync(new URL('../lib/optical-field/canvas-renderer.ts', import.meta.url), 'utf8');
    expect(source).toContain('GlyphParticle');
    expect(source).toContain('glyphParticles');
    expect(source).toContain('sample.radius * 0.95');
    expect(source).not.toContain('normalizedDistance > 1');
    expect(source).not.toContain('radialX * offset');
    expect(source).not.toContain('quadraticCurveTo');
    expect(source).toContain('rgba(255, 78, 34');
    expect(source).toContain('rgba(87, 184, 204');
    expect(source).toContain('0.46 + proximity * 0.54');
  });

  it('rasterizes the real loaded headline fonts into glyph-alpha particles', () => {
    const source = readFileSync(new URL('../components/brand/OpticalField.tsx', import.meta.url), 'utf8');
    expect(source).toContain('document.fonts.ready');
    expect(source).toContain('getImageData');
    expect(source).toContain('[data-optical-science="true"]');
    expect(source).toContain('[data-optical-evolves="true"]');
    expect(source).toContain('optical-field-viewport');
    expect(source).toContain('if (shouldReduceMotion() && visible && !document.hidden) draw(0);');
  });

  it('updates viewport dimensions before rebuilding glyph particles after resize', () => {
    const source = readFileSync(new URL('../components/brand/OpticalField.tsx', import.meta.url), 'utf8');
    const measure = source.slice(source.indexOf('const measure ='), source.indexOf('const draw ='));
    expect(measure.indexOf('size = { width, height, dpr };')).toBeLessThan(measure.indexOf('rebuildGlyphParticles();'));
  });

});

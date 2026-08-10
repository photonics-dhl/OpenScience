import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  releaseOpticalInteraction,
  sampleDiffractionWavefront,
  sampleOpticalField,
  smoothOpticalPoint,
  textDisplacementScale,
  OPTICAL_POINTER_RESPONSE_MS,
} from '../lib/optical-field/field-model';

describe('pointer-local optical field model', () => {
  it('pins a known active sample instead of only comparing the function to itself', () => {
    const sample = sampleOpticalField(
      { x: 720, y: 360, lastActiveAt: 1_250, pressed: true },
      { width: 1440, height: 900, dpr: 2 },
      1_250,
    );
    expect(sample.origin).toEqual({ x: 720, y: 360 });
    expect(sample.radius).toBeCloseTo(187.2, 5);
    expect(sample.displacement).toBeCloseTo(13.846953858, 5);
    expect(sample.evidence).toBe(1);
  });

  it('stays within the optimized desktop optical envelope', () => {
    const sample = sampleOpticalField(
      { x: 720, y: 450, lastActiveAt: 400, pressed: false },
      { width: 1440, height: 900, dpr: 1 },
      400,
    );
    expect(sample.radius).toBeGreaterThanOrEqual(180);
    expect(sample.radius).toBeLessThanOrEqual(220);
    expect(sample.displacement).toBeGreaterThanOrEqual(36);
    expect(sample.displacement).toBeLessThanOrEqual(44);
    expect(sample.density).toBeLessThanOrEqual(1);
    expect(sample.evidence).toBeGreaterThanOrEqual(0.8);
    expect(textDisplacementScale(sample)).toBeLessThanOrEqual(44);
  });

  it('caps mobile density at 35% while retaining a static focal origin', () => {
    const sample = sampleOpticalField(null, { width: 390, height: 844, dpr: 3 }, 0);
    expect(sample.density).toBeLessThanOrEqual(0.35);
    expect(sample.radius).toBeGreaterThanOrEqual(105);
    expect(sample.radius).toBeLessThanOrEqual(120);
    expect(sample.origin.x).toBe(195);
    expect(sample.origin.y).toBeCloseTo(354.48, 8);
  });

  it('masks the readable base layer inside the local distortion lens', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).toContain("[data-optical-text-base='true']");
    expect(css).toContain('calc(1 - var(--os-optical-focus))');
  });

  it('returns to the aperture in the 650ms recovery window', () => {
    const pointer = { x: 120, y: 100, lastActiveAt: 1_000, pressed: false };
    const viewport = { width: 1_000, height: 600, dpr: 1 };
    expect(sampleOpticalField(pointer, viewport, 1_000).origin).toEqual({ x: 120, y: 100 });
    expect(sampleOpticalField(pointer, viewport, 1_325).origin).toEqual({ x: 310, y: 176 });
    expect(sampleOpticalField(pointer, viewport, 1_650).origin).toEqual({ x: 500, y: 252 });
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

  it('builds a slit diffraction wavefront that spreads symmetrically from the aperture', () => {
    const aperture = { x: 500, y: 250 };
    const upper = sampleDiffractionWavefront(aperture, 3, -1, 0);
    const lower = sampleDiffractionWavefront(aperture, 3, 1, 0);

    expect(upper.x).toBeGreaterThan(aperture.x);
    expect(lower.x).toBe(upper.x);
    expect(upper.y).toBeLessThan(aperture.y);
    expect(lower.y - aperture.y).toBeCloseTo(aperture.y - upper.y, 5);
  });
});

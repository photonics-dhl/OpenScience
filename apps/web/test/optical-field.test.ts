import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { releaseOpticalInteraction, sampleOpticalField, textDisplacementScale } from '../lib/optical-field/field-model';

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

  it('stays within the approved desktop radius and displacement envelope', () => {
    const sample = sampleOpticalField(
      { x: 720, y: 450, lastActiveAt: 400, pressed: false },
      { width: 1440, height: 900, dpr: 1 },
      400,
    );
    expect(sample.radius).toBeGreaterThanOrEqual(160);
    expect(sample.radius).toBeLessThanOrEqual(200);
    expect(sample.displacement).toBeGreaterThanOrEqual(8);
    expect(sample.displacement).toBeLessThanOrEqual(14);
    expect(sample.density).toBeLessThanOrEqual(1);
    expect(sample.evidence).toBeGreaterThanOrEqual(0.8);
    expect(textDisplacementScale(sample)).toBeLessThanOrEqual(14);
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

  it('returns to the static origin within the 500ms recovery window', () => {
    const pointer = { x: 120, y: 100, lastActiveAt: 1_000, pressed: false };
    const viewport = { width: 1_000, height: 600, dpr: 1 };
    expect(sampleOpticalField(pointer, viewport, 1_000).origin).toEqual({ x: 120, y: 100 });
    expect(sampleOpticalField(pointer, viewport, 1_250).origin).toEqual({ x: 310, y: 176 });
    expect(sampleOpticalField(pointer, viewport, 1_500).origin).toEqual({ x: 500, y: 252 });
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
});

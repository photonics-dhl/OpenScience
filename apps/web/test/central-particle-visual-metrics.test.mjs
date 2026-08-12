import { describe, expect, it } from 'vitest';

import {
  measureContinuousTitle,
  measureOpticalFieldTopology,
  measureRenderedField,
} from './visual/central-particle-visual-metrics.mjs';

function rectangleMask(width, height, inset = 2) {
  const mask = new Uint8Array(width * height);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

describe('central particle continuous-title visual metric', () => {
  it('accepts continuous ink outside the seam', () => {
    const width = 80;
    const height = 30;
    const idealMask = rectangleMask(width, height);
    const measured = measureContinuousTitle({
      candidateMask: idealMask.slice(), height, idealMask, seamMaxX: 44, seamMinX: 36, width,
    });
    expect(measured.interiorCoverage).toBe(1);
    expect(measured.interiorHoleRatio).toBe(0);
    expect(measured.occupiedColumnContinuity).toBe(1);
  });

  it('rejects an exposed five-pixel point lattice', () => {
    const width = 80;
    const height = 30;
    const idealMask = rectangleMask(width, height);
    const candidateMask = new Uint8Array(width * height);
    for (let y = 5; y < height - 2; y += 5) {
      for (let x = 5; x < width - 2; x += 5) candidateMask[y * width + x] = 1;
    }
    const measured = measureContinuousTitle({
      candidateMask, height, idealMask, seamMaxX: 44, seamMinX: 36, width,
    });
    expect(measured.interiorCoverage).toBeLessThan(0.14);
    expect(measured.interiorHoleRatio).toBeGreaterThan(0.86);
    expect(measured.occupiedColumnContinuity).toBeLessThan(0.3);
  });
});

function referenceLikeTopology() {
  const center = { x: 100, y: 50 };
  const curtainPoints = [];
  for (let row = 0; row <= 20; row += 1) {
    const y = row * 5;
    const halfWidth = 5 + Math.abs(y - center.y) * 0.55;
    for (let column = 0; column < 7; column += 1) {
      curtainPoints.push({
        column,
        id: row * 7 + column,
        opacity: 0.2 + ((row * 3 + column * 5) % 11) / 20,
        row,
        x: center.x + (column - 3) / 3 * halfWidth,
        y,
      });
    }
  }
  const fieldSamples = Array.from({ length: 30 }, (_, index) => {
    const angle = -1.1 + index / 29 * 2.2;
    const home = { x: 85 + index * 0.8, y: 50 + Math.sin(angle) * 35 };
    const radial = { x: home.x - center.x, y: home.y - center.y };
    const length = Math.max(0.001, Math.hypot(radial.x, radial.y));
    const tangent = { x: -radial.y / length, y: radial.x / length };
    return {
      energy: 1,
      home,
      position: {
        x: home.x + 18 + tangent.x * 8,
        y: home.y + tangent.y * 8,
      },
    };
  });
  return { center, curtainPoints, fieldSamples, viewport: { height: 100, width: 200 } };
}

describe('central particle field topology metric', () => {
  it('accepts a curved right-biased field and tapered non-uniform curtain', () => {
    const measured = measureOpticalFieldTopology(referenceLikeTopology());
    expect(measured.centerError).toBeLessThanOrEqual(0.005);
    expect(measured.curtainCoverage).toBeGreaterThan(0.9);
    expect(measured.outerSpreadRatio).toBeGreaterThan(0.16);
    expect(measured.waistRatio).toBeLessThan(0.45);
    expect(measured.opacityVariance).toBeGreaterThan(0.015);
    expect(measured.gridCoherence).toBeGreaterThan(0.95);
    expect(measured.rightwardEnergyRatio).toBeGreaterThan(1.25);
    expect(measured.tangentialDirectionality).toBeGreaterThan(0.3);
    expect(measured.ringScore).toBeLessThan(0.72);
  });

  it('rejects bars, symmetric fans, rings, uniform rectangles and random scatter', () => {
    const valid = referenceLikeTopology();
    const bar = measureOpticalFieldTopology({
      ...valid,
      curtainPoints: valid.curtainPoints.map((point) => ({ ...point, x: valid.center.x })),
    });
    expect(bar.outerSpreadRatio).toBeLessThan(0.03);

    const symmetric = measureOpticalFieldTopology({
      ...valid,
      fieldSamples: valid.fieldSamples.map((sample, index) => ({
        ...sample,
        position: { x: sample.home.x + (index % 2 ? 12 : -12), y: sample.home.y },
      })),
    });
    expect(symmetric.rightwardEnergyRatio).toBeLessThan(1.25);
    expect(symmetric.tangentialDirectionality).toBeLessThan(0.3);

    const ringPoints = Array.from({ length: 120 }, (_, index) => ({
      column: index,
      id: index,
      opacity: 0.5,
      row: index,
      x: valid.center.x + Math.cos(index / 120 * Math.PI * 2) * 30,
      y: valid.center.y + Math.sin(index / 120 * Math.PI * 2) * 30,
    }));
    const ring = measureOpticalFieldTopology({ ...valid, curtainPoints: ringPoints });
    expect(ring.ringScore).toBeGreaterThanOrEqual(0.72);

    const uniform = measureOpticalFieldTopology({
      ...valid,
      curtainPoints: valid.curtainPoints.map((point) => ({ ...point, opacity: 0.5, x: 70 + point.column * 10 })),
    });
    expect(uniform.opacityVariance).toBe(0);
    expect(uniform.waistRatio).toBeGreaterThan(0.8);

    const random = measureOpticalFieldTopology({
      ...valid,
      curtainPoints: valid.curtainPoints.map((point) => ({
        ...point,
        x: (point.id * 73) % 200,
        y: (point.id * 47) % 100,
      })),
    });
    expect(random.gridCoherence).toBeLessThan(0.7);
  });
});

describe('central particle rendered field metric', () => {
  it('distinguishes right-biased transfer energy from a symmetric fan', () => {
    const width = 40;
    const height = 20;
    const idealMask = new Uint8Array(width * height);
    const rightBiased = new Uint8Array(width * height);
    const symmetric = new Uint8Array(width * height);
    for (const [x, y] of [[14, 8], [15, 9], [24, 7], [25, 8], [26, 9], [27, 10], [28, 11], [29, 12]]) {
      rightBiased[y * width + x] = 1;
    }
    for (const [x, y] of [[14, 8], [15, 9], [16, 10], [17, 11], [23, 8], [24, 9], [25, 10], [26, 11]]) {
      symmetric[y * width + x] = 1;
    }
    const input = { centerX: 20, height, idealMask, titleMaxY: 15, titleMinY: 4, width };
    expect(measureRenderedField({ ...input, candidateMask: rightBiased }).rightwardEnergyRatio)
      .toBeGreaterThan(1.25);
    expect(measureRenderedField({ ...input, candidateMask: symmetric }).rightwardEnergyRatio)
      .toBeLessThanOrEqual(1.25);
  });
});

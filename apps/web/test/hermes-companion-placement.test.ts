import { describe, expect, it } from 'vitest';

import {
  resolveHermesBubblePlacement,
  resolveHermesSettledDock,
  type Point,
  type RectLike,
} from '@/lib/hermes/companion-placement';

const rect = (left: number, top: number, width: number, height: number): RectLike => ({
  bottom: top + height,
  left,
  right: left + width,
  top,
});

const rectForFootprint = (point: Point, footprint: { bottom: number; left: number; right: number; top: number }) => rect(
  point.x - footprint.left,
  point.y - footprint.top,
  footprint.left + footprint.right,
  footprint.top + footprint.bottom,
);

const overlaps = (a: RectLike, b: RectLike) => (
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
);

describe('Hermes companion placement', () => {
  it('keeps an unobstructed desired dock point', () => {
    expect(resolveHermesSettledDock({
      desired: { x: 420, y: 310 },
      footprint: { bottom: 100, left: 100, right: 100, top: 100 },
      obstacles: [],
      viewport: rect(0, 0, 1440, 900),
    })).toEqual({ point: { x: 420, y: 310 }, safe: true });
  });

  it('settles at the nearest point that keeps the actor clear of protected work', () => {
    const footprint = { bottom: 100, left: 100, right: 100, top: 100 };
    const protectedWork = rect(240, 120, 500, 380);
    const result = resolveHermesSettledDock({
      desired: { x: 420, y: 310 },
      footprint,
      obstacles: [protectedWork],
      viewport: rect(0, 0, 1440, 900),
    });

    expect(result.safe).toBe(true);
    expect(overlaps(rectForFootprint(result.point, footprint), protectedWork)).toBe(false);
    expect(result.point).toEqual({ x: 128, y: 310 });
  });

  it.each([
    [{ x: -40, y: 250 }, { x: 100, y: 250 }],
    [{ x: 1480, y: 250 }, { x: 1340, y: 250 }],
    [{ x: 420, y: -40 }, { x: 420, y: 100 }],
    [{ x: 420, y: 980 }, { x: 420, y: 800 }],
  ])('clamps a desired dock outside the viewport edge: %o', (desired, point) => {
    expect(resolveHermesSettledDock({
      desired,
      footprint: { bottom: 100, left: 100, right: 100, top: 100 },
      obstacles: [],
      viewport: rect(0, 0, 1440, 900),
    })).toEqual({ point, safe: true });
  });

  it('places a bubble in the open quadrant away from Continue Research', () => {
    expect(resolveHermesBubblePlacement({
      actor: rect(300, 300, 100, 100),
      bubble: { height: 92, width: 192 },
      obstacles: [rect(412, 412, 228, 108)],
      viewport: rect(0, 0, 1440, 900),
    })).toEqual({
      bounds: rect(96, 412, 192, 92),
      horizontal: 'left',
      vertical: 'below',
    });
  });

  it('places a bubble away from a protected right-rail task', () => {
    expect(resolveHermesBubblePlacement({
      actor: rect(1190, 520, 100, 100),
      bubble: { height: 92, width: 192 },
      obstacles: [rect(986, 416, 192, 204)],
      viewport: rect(0, 0, 1440, 900),
    })).toEqual({
      bounds: rect(986, 632, 192, 92),
      horizontal: 'left',
      vertical: 'below',
    });
  });

  it('uses an in-viewport bubble quadrant on a 390 by 844 viewport', () => {
    expect(resolveHermesBubblePlacement({
      actor: rect(250, 650, 350, 750),
      bubble: { height: 80, width: 120 },
      obstacles: [],
      viewport: rect(0, 0, 390, 844),
    })).toEqual({
      bounds: rect(118, 558, 120, 80),
      horizontal: 'left',
      vertical: 'above',
    });
  });

  it('falls back to a centered mobile bubble when diagonal quadrants are blocked', () => {
    expect(resolveHermesBubblePlacement({
      actor: rect(147, 637, 96, 94),
      bubble: { height: 55, width: 192 },
      obstacles: [rect(20, 294, 350, 283), rect(20, 818, 350, 204)],
      viewport: rect(0, 0, 390, 844),
    })).toEqual({
      bounds: rect(99, 743, 192, 55),
      horizontal: 'center',
      vertical: 'below',
    });
  });

  it('suppresses a bubble when no in-viewport quadrant avoids protected work', () => {
    expect(resolveHermesBubblePlacement({
      actor: rect(95, 322, 200, 200),
      bubble: { height: 92, width: 192 },
      obstacles: [rect(0, 0, 390, 844)],
      viewport: rect(0, 0, 390, 844),
    })).toBeNull();
  });
});

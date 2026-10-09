import { describe, expect, it } from 'vitest';

import {
  expandHermesFootprintForMotion,
  includeHermesControlFootprint,
  HERMES_PATROL_MOTION_ENVELOPE,
  HERMES_PATROL_TRANSLATION_ENVELOPE,
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
  it('keeps floating controls inside the viewport after dragging a smaller actor to an edge', () => {
    const actor = { bottom: 65, left: 70, right: 70, top: 115 };
    const controls = { bottom: 100, left: 100, right: 100, top: 100 };
    const footprint = includeHermesControlFootprint(actor, controls);
    const viewport = rect(0, 0, 390, 700);
    const settled = resolveHermesSettledDock({ desired: { x: 380, y: 690 }, footprint, obstacles: [], viewport });
    const occupied = rectForFootprint(settled.point, footprint);
    expect(settled.safe).toBe(true);
    expect(occupied.left).toBeGreaterThanOrEqual(viewport.left);
    expect(occupied.right).toBeLessThanOrEqual(viewport.right);
    expect(occupied.bottom).toBeLessThanOrEqual(viewport.bottom);
    expect(occupied.top).toBeGreaterThanOrEqual(viewport.top);
    expect(footprint.top).toBe(actor.top);
  });

  it('expands a dock footprint by the full patrol translation envelope', () => {
    expect(HERMES_PATROL_TRANSLATION_ENVELOPE).toEqual({ bottom: 0, left: 34, right: 34, top: 25 });
    expect(HERMES_PATROL_MOTION_ENVELOPE).toEqual({ bottom: 27, left: 52, right: 35, top: 30 });
    expect(expandHermesFootprintForMotion(
      { bottom: 42, left: 50, right: 48, top: 46 },
      'patrol',
    )).toEqual({ bottom: 69, left: 102, right: 83, top: 76 });
  });

  it('does not inflate a non-translating guide action on a narrow viewport', () => {
    expect(expandHermesFootprintForMotion(
      { bottom: 80, left: 120, right: 120, top: 80 },
      'guide-arrive',
    )).toEqual({ bottom: 80, left: 120, right: 120, top: 80 });
  });

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

  it.each([
    { viewport: rect(0, 0, 1440, 900), hat: { x: 1190, y: 500 } },
    { viewport: rect(0, 0, 390, 844), hat: { x: 110, y: 430 } },
    { viewport: rect(0, 180, 390, 320), hat: { x: 110, y: 360 } },
  ])('ends the short tail at the hat within the visible viewport', ({ viewport, hat }) => {
    const placement = resolveHermesBubblePlacement({
      actor: rect(hat.x - 70, hat.y - 40, 328, 328), hat,
      bubble: { height: 114, width: 224 }, obstacles: [], viewport,
    });
    expect(placement).not.toBeNull();
    const { bounds, tailRatio } = placement!;
    expect(bounds.left + 224 * tailRatio!).toBeCloseTo(hat.x);
    expect(bounds.top + 114 * 112 / 114).toBeCloseTo(hat.y);
    expect(bounds.left).toBeGreaterThanOrEqual(viewport.left);
    expect(bounds.right).toBeLessThanOrEqual(viewport.right);
    expect(bounds.top).toBeGreaterThanOrEqual(viewport.top);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.bottom);
  });

  it('suppresses decorative speech when it would cover reading or cross the hat from below', () => {
    const input = { actor: rect(100, 180, 328, 328), hat: { x: 198, y: 224 },
      bubble: { height: 114, width: 224 }, viewport: rect(0, 0, 390, 844) };
    expect(resolveHermesBubblePlacement({ ...input, obstacles: [rect(0, 80, 390, 120)] })).toBeNull();
    expect(resolveHermesBubblePlacement({ ...input, hat: { x: 198, y: 80 }, obstacles: [] })).toBeNull();
  });
});

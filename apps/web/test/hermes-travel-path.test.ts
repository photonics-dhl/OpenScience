import { describe, expect, it } from 'vitest';

import { createHermesTravelTimeline, planHermesTravel } from '@/lib/hermes/travel-path';

const rect = (x: number, y: number, width: number, height: number): DOMRectReadOnly => ({
  bottom: y + height,
  height,
  left: x,
  right: x + width,
  top: y,
  width,
  x,
  y,
  toJSON: () => ({}),
});

const overlaps = (a: DOMRectReadOnly, b: DOMRectReadOnly) => (
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
);

function sweptOverlaps(
  points: Array<{ x: number; y: number }>,
  actor: DOMRectReadOnly,
  editable: DOMRectReadOnly,
): boolean {
  for (let segment = 1; segment < points.length; segment += 1) {
    const from = points[segment - 1];
    const to = points[segment];
    for (let step = 0; step <= 100; step += 1) {
      const progress = step / 100;
      const centerX = from.x + (to.x - from.x) * progress;
      const centerY = from.y + (to.y - from.y) * progress;
      if (overlaps(rect(centerX - actor.width / 2, centerY - actor.height / 2, actor.width, actor.height), editable)) return true;
    }
  }
  return false;
}

describe('Hermes safe travel path', () => {
  it('preserves every safe waypoint as a separate travel segment', () => {
    expect(createHermesTravelTimeline([
      { x: 100, y: 100 },
      { x: 100, y: 500 },
      { x: 700, y: 500 },
    ], 360)).toEqual([
      { atMs: 0, point: { x: 100, y: 500 } },
      { atMs: 360, point: { x: 700, y: 500 } },
    ]);
  });

  it('routes from all four user docks to five target positions without sweeping across the editable field', () => {
    const viewport = rect(0, 0, 1200, 800);
    const starts = [rect(20, 20, 96, 96), rect(1084, 20, 96, 96), rect(20, 684, 96, 96), rect(1084, 684, 96, 96)];
    const targets = [rect(170, 120, 360, 72), rect(670, 120, 360, 72), rect(420, 330, 360, 72), rect(170, 570, 360, 72), rect(670, 570, 360, 72)];

    for (const from of starts) {
      for (const target of targets) {
        const route = planHermesTravel({ editable: target, from, preferredSides: ['right', 'left', 'top', 'bottom'], target, viewport });
        expect(route.mode).toBe('travel');
        expect(sweptOverlaps(route.points, from, target)).toBe(false);
        expect(route.points.at(-1)).toEqual(route.dock);
      }
    }
  });

  it('stops at the viewport edge for an off-screen target without including the target position', () => {
    const viewport = rect(0, 0, 1000, 700);
    const target = rect(300, 1_300, 400, 80);
    const route = planHermesTravel({ editable: target, from: rect(850, 40, 90, 90), preferredSides: ['right'], target, viewport });

    expect(route.mode).toBe('edge-stop');
    expect(route.dock.y).toBeLessThanOrEqual(655);
    expect(route.points.every((point) => point.y <= 655)).toBe(true);
  });

  it('keeps the arrival dock above a mobile keyboard inset', () => {
    const viewport = rect(0, 0, 390, 844);
    const target = rect(24, 650, 342, 64);
    const route = planHermesTravel({
      bottomInsetPx: 300,
      editable: target,
      from: rect(278, 60, 80, 80),
      preferredSides: ['top', 'right'],
      target,
      viewport,
    });

    expect(route.dock.y).toBeLessThanOrEqual(504);
    expect(route.points.every((point) => point.y <= 504)).toBe(true);
  });

  it('returns a stable missing-target result and clamps routes after a viewport resize', () => {
    const missing = planHermesTravel({
      editable: null,
      from: rect(900, 600, 90, 90),
      preferredSides: ['right'],
      target: null,
      viewport: rect(0, 0, 1000, 700),
    });
    expect(missing.mode).toBe('missing');
    expect(missing.points).toHaveLength(1);

    const resized = planHermesTravel({
      editable: rect(140, 240, 260, 60),
      from: rect(900, 600, 90, 90),
      preferredSides: ['top', 'left'],
      target: rect(140, 240, 260, 60),
      viewport: rect(0, 0, 640, 480),
    });
    expect(resized.points.every((point) => point.x >= 45 && point.x <= 595 && point.y >= 45 && point.y <= 435)).toBe(true);
  });
});

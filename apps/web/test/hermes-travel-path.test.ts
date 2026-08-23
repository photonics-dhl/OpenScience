import { describe, expect, it } from 'vitest';

import { createHermesTravelTimeline, planHermesTravel, rectForFootprint } from '@/lib/hermes/travel-path';

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
const actorFootprint = (actor: DOMRectReadOnly) => ({
  bottom: actor.height / 2,
  left: actor.width / 2,
  right: actor.width / 2,
  top: actor.height / 2,
});

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
  it('keeps the complete actor and guide-bubble footprint outside the editable field', () => {
    const editable = rect(520, 180, 500, 420);
    const footprint = { bottom: 150, left: 150, right: 150, top: 230 };
    const route = planHermesTravel({
      editable,
      footprint,
      from: rect(920, 610, 260, 230),
      preferredSides: ['right'],
      target: rect(520, 180, 500, 92),
      viewport: rect(0, 0, 1200, 800),
    });
    const occupied = rectForFootprint(route.dock, footprint);

    expect(overlaps(rect(occupied.left, occupied.top, occupied.right - occupied.left, occupied.bottom - occupied.top), editable)).toBe(false);
  });

  it('routes the measured asymmetric footprint around a wide editor field', () => {
    const editable = rect(305.59375, 350.1875, 742.40625, 199.59375);
    const footprint = { bottom: 107, left: 152, right: 152, top: 231.5 };
    const route = planHermesTravel({
      editable,
      footprint,
      from: rect(1_152, 594, 288, 288),
      preferredSides: ['top', 'right'],
      target: editable,
      viewport: rect(0, 0, 1_440, 900),
    });
    const collision = route.points.slice(1).find((point, index) => {
      const previous = route.points[index];
      return Array.from({ length: 101 }, (_, sample) => {
        const ratio = sample / 100;
        return {
          x: previous.x + (point.x - previous.x) * ratio,
          y: previous.y + (point.y - previous.y) * ratio,
        };
      }).some((center) => {
        const occupied = rectForFootprint(center, footprint);
        return overlaps(rect(occupied.left, occupied.top, occupied.right - occupied.left, occupied.bottom - occupied.top), editable);
      });
    });

    expect(route.points.length).toBeGreaterThan(2);
    expect(collision).toBeUndefined();
  });

  it.each([
    ['desktop', { bottom: 102, left: 148, right: 132, top: 176 }, rect(1_152, 594, 288, 288), rect(0, 0, 1_440, 900)],
    ['mobile', { bottom: 72, left: 94, right: 88, top: 116 }, rect(246, 548, 144, 144), rect(0, 0, 390, 844)],
  ] as const)('keeps the %s carrier travel hull clear of the target field', (_variant, footprint, from, viewport) => {
    const editable = viewport.width > 640
      ? rect(305, 350, 742, 200)
      : rect(24, 478, 342, 128);
    const route = planHermesTravel({
      editable,
      footprint,
      from,
      preferredSides: ['top', 'right', 'left', 'bottom'],
      target: editable,
      viewport,
    });

    for (const point of route.points.slice(1)) {
      const occupied = rectForFootprint(point, footprint);
      expect(overlaps(rect(occupied.left, occupied.top, occupied.right - occupied.left, occupied.bottom - occupied.top), editable)).toBe(false);
    }
  });

  it('leaves one physical pixel for animated footprint measurement variance', () => {
    const editable = rect(305.59375, 350.1875, 742.40625, 199.59375);
    const measured = { bottom: 107, left: 152, right: 152, top: 231.5 };
    const rendered = { bottom: 108, left: 153, right: 153, top: 232.5 };
    const route = planHermesTravel({
      editable,
      footprint: measured,
      from: rect(1_152, 594, 288, 288),
      preferredSides: ['top', 'right'],
      target: editable,
      viewport: rect(0, 0, 1_440, 900),
    });

    const collision = route.points.slice(1).some((point, index) => {
      const previous = route.points[index];
      return Array.from({ length: 101 }, (_, sample) => {
        const ratio = sample / 100;
        return rectForFootprint({
          x: previous.x + (point.x - previous.x) * ratio,
          y: previous.y + (point.y - previous.y) * ratio,
        }, rendered);
      }).some((occupied) => overlaps(rect(occupied.left, occupied.top, occupied.right - occupied.left, occupied.bottom - occupied.top), editable));
    });

    expect(collision).toBe(false);
  });

  it('rejects a preferred dock that would cover an evidence diff', () => {
    const target = rect(500, 220, 200, 90);
    const diff = rect(730, 120, 320, 520);
    const footprint = { bottom: 130, left: 150, right: 150, top: 220 };
    const route = planHermesTravel({
      editable: target,
      footprint,
      from: rect(850, 500, 260, 230),
      obstacles: [diff],
      preferredSides: ['right'],
      target,
      viewport: rect(0, 0, 1200, 800),
    });
    const occupied = rectForFootprint(route.dock, footprint);

    expect(overlaps(rect(occupied.left, occupied.top, occupied.right - occupied.left, occupied.bottom - occupied.top), diff)).toBe(false);
  });

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
        const route = planHermesTravel({ editable: target, footprint: actorFootprint(from), from, preferredSides: ['right', 'left', 'top', 'bottom'], target, viewport });
        expect(route.mode).toBe('travel');
        expect(sweptOverlaps(route.points, from, target)).toBe(false);
        expect(route.points.at(-1)).toEqual(route.dock);
      }
    }
  });

  it('stops at the viewport edge for an off-screen target without including the target position', () => {
    const viewport = rect(0, 0, 1000, 700);
    const target = rect(300, 1_300, 400, 80);
    const from = rect(850, 40, 90, 90);
    const route = planHermesTravel({ editable: target, footprint: actorFootprint(from), from, preferredSides: ['right'], target, viewport });

    expect(route.mode).toBe('edge-stop');
    expect(route.dock.y).toBeLessThanOrEqual(655);
    expect(route.points.every((point) => point.y <= 655)).toBe(true);
  });

  it('keeps an off-screen target edge-stop clear of a visible evidence diff', () => {
    const viewport = rect(0, 0, 320, 720);
    const target = rect(0, 0, 0, 0);
    const diff = rect(16, -66, 288, 466);
    const footprint = { bottom: 82, left: 144, right: 144, top: 144 };
    const route = planHermesTravel({
      editable: target,
      footprint,
      from: rect(0, 0, 160, 160),
      obstacles: [diff],
      preferredSides: ['right'],
      target,
      viewport,
    });
    const occupied = rectForFootprint(route.dock, footprint);

    expect(route.mode).toBe('edge-stop');
    expect(overlaps(rect(occupied.left, occupied.top, occupied.right - occupied.left, occupied.bottom - occupied.top), diff)).toBe(false);
  });

  it('reports when dense mobile evidence leaves no safe fixed guide position', () => {
    const viewport = rect(0, 0, 320, 720);
    const target = rect(0, 0, 0, 0);
    const route = planHermesTravel({
      editable: target,
      footprint: { bottom: 82, left: 144, right: 144, top: 144 },
      from: rect(0, 0, 160, 160),
      obstacles: [rect(16, -66, 288, 466), rect(16, 400, 288, 467)],
      preferredSides: ['right'],
      target,
      viewport,
    });

    expect(route.mode).toBe('edge-stop');
    expect(route.safe).toBe(false);
  });

  it('keeps the arrival dock above a mobile keyboard inset', () => {
    const viewport = rect(0, 0, 390, 844);
    const target = rect(24, 650, 342, 64);
    const route = planHermesTravel({
      bottomInsetPx: 300,
      editable: target,
      footprint: actorFootprint(rect(278, 60, 80, 80)),
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
      footprint: actorFootprint(rect(900, 600, 90, 90)),
      from: rect(900, 600, 90, 90),
      preferredSides: ['right'],
      target: null,
      viewport: rect(0, 0, 1000, 700),
    });
    expect(missing.mode).toBe('missing');
    expect(missing.points).toHaveLength(1);

    const resized = planHermesTravel({
      editable: rect(140, 240, 260, 60),
      footprint: actorFootprint(rect(900, 600, 90, 90)),
      from: rect(900, 600, 90, 90),
      preferredSides: ['top', 'left'],
      target: rect(140, 240, 260, 60),
      viewport: rect(0, 0, 640, 480),
    });
    expect(resized.points.every((point) => point.x >= 45 && point.x <= 595 && point.y >= 45 && point.y <= 435)).toBe(true);
  });
});

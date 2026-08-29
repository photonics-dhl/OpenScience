import { describe, expect, it } from 'vitest';

import {
  createHermesTravelFootprintVariants,
  resolveHermesGuideTravelMotionEnvelope,
  createHermesTravelTimeline,
  planHermesTravel,
  rectForFootprint,
  resolveHermesGuideSourceCandidate,
  resolveHermesStationaryGuidePlacement,
} from '@/lib/hermes/travel-path';

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
  it('binds guide travel planning to the full carrier rotation and hover envelope', () => {
    expect(resolveHermesGuideTravelMotionEnvelope(360)).toEqual({ bottom: 9, left: 12, right: 5, top: 11 });
    expect(resolveHermesGuideTravelMotionEnvelope(200)).toEqual({ bottom: 5, left: 7, right: 3, top: 7 });
  });
  it('selects a stationary composite guide placement whose bubble clears protected work', () => {
    const actor = { bottom: 40, left: 40, right: 40, top: 40 };
    const variants = [
      {
        footprint: { bottom: 120, left: 40, right: 150, top: 40 },
        parts: [actor, { bottom: 120, left: -50, right: 150, top: -50 }],
        placement: { horizontal: 'right' as const, vertical: 'below' as const },
      },
      {
        footprint: { bottom: 40, left: 150, right: 40, top: 120 },
        parts: [actor, { bottom: -50, left: 150, right: -50, top: 120 }],
        placement: { horizontal: 'left' as const, vertical: 'above' as const },
      },
    ];

    const selected = resolveHermesStationaryGuidePlacement({
      at: { x: 200, y: 200 },
      obstacles: [rect(240, 240, 130, 100)],
      variants,
      viewport: rect(0, 0, 400, 400),
    });

    expect(selected?.placement).toEqual({ horizontal: 'left', vertical: 'above' });
  });

  it('suppresses a stationary guide bubble when every composite placement is unsafe', () => {
    const actor = { bottom: 40, left: 40, right: 40, top: 40 };
    const variants = createHermesTravelFootprintVariants(
      actor,
      { bottom: 120, left: -50, right: 150, top: -50 },
      { horizontal: 'right', vertical: 'below' },
    );

    expect(resolveHermesStationaryGuidePlacement({
      at: { x: 200, y: 200 },
      obstacles: [rect(0, 0, 400, 400)],
      variants,
      viewport: rect(0, 0, 400, 400),
    })).toBeNull();
  });

  it('keeps the mobile insight top candidate between navigation controls and the target', () => {
    const actor = { bottom: 66.234375, left: 69.921875, right: 69.90625, top: 69.921875 };
    const bubble = { bottom: 182.125, left: 92, right: 100, top: -80 };
    const variants = createHermesTravelFootprintVariants(actor, bubble, { horizontal: 'left', vertical: 'below' });
    const controls = [
      rect(211.59375, 69.484375, 80, 36),
      rect(8, 120, 119.921875, 44), rect(127.921875, 120, 73.734375, 44),
      rect(201.65625, 120, 92.203125, 44), rect(293.859375, 120, 119.921875, 44),
      rect(295.875, 212.1875, 78.125, 40),
      rect(8, 788, 124, 48), rect(133, 788, 124, 48), rect(258, 788, 124, 48),
    ];
    const plan = planHermesTravel({
      editable: rect(16, 434.1875, 358, 199.59375),
      footprint: variants[0].footprint,
      footprintVariants: variants,
      from: rect(95, 136.0625, 200, 200),
      obstacles: controls,
      preferredSides: ['right', 'top'],
      target: rect(16, 434.1875, 358, 199.59375),
      viewport: rect(0, 0, 390, 844),
    });
    expect(plan.safe).toBe(true);
    expect(plan.mode).toBe('travel');
    expect(plan.dock).toEqual({ x: 195, y: 236.0625 });
  });

  it('retains a safe real source when target clearance would push the expanded bubble into a blocker', () => {
    const actor = { bottom: 72, left: 70, right: 70, top: 72 };
    const variants = createHermesTravelFootprintVariants(
      actor,
      { bottom: 239.8, left: 92, right: 100, top: -80 },
      { horizontal: 'left', vertical: 'below' },
    );
    const target = rect(16, 434, 358, 200);
    const route = planHermesTravel({
      editable: target,
      footprint: variants[0].footprint,
      footprintVariants: variants,
      from: rect(95, 252, 200, 200),
      obstacles: [rect(103, 73, 192, 34)],
      preferredSides: ['right', 'top'],
      target,
      viewport: rect(0, 0, 390, 844),
    });

    expect(route.safe).toBe(true);
    expect(route.dock).toEqual({ x: 195, y: 352 });
    expect(route.placement).toEqual({ horizontal: 'left', vertical: 'above' });
  });

  it('keeps source pre-clamp placement separate from the final arrival placement', () => {
    const footprint = { bottom: 100, left: 100, right: 100, top: 100 };
    const parts = [{ bottom: 50, left: 50, right: 50, top: 50 }];
    const variants = [
      { footprint, parts, placement: { horizontal: 'right' as const, vertical: 'above' as const } },
      { footprint, parts, placement: { horizontal: 'right' as const, vertical: 'below' as const } },
      { footprint, parts, placement: { horizontal: 'left' as const, vertical: 'above' as const } },
      { footprint, parts, placement: { horizontal: 'left' as const, vertical: 'below' as const } },
    ];
    const source = resolveHermesGuideSourceCandidate({
      current: { x: 1190, y: 10 },
      guardPx: 6,
      variants,
      viewport: rect(0, 0, 1200, 800),
    });
    expect(source).toEqual({
      placement: { horizontal: 'right', vertical: 'above' },
      point: { x: 1094, y: 106 },
      requiresMove: true,
    });

    const route = planHermesTravel({
      editable: rect(900, 600, 100, 50),
      footprint,
      footprintVariants: variants,
      from: rect(source.point.x - 50, source.point.y - 50, 100, 100),
      preferredSides: ['right'],
      target: rect(900, 600, 100, 50),
      viewport: rect(0, 0, 1200, 800),
    });
    expect(route.points[0]).toEqual(source.point);
    expect(route.placement).toEqual({ horizontal: 'left', vertical: 'above' });
    expect(route.placement).not.toEqual(source.placement);
  });

  it('pre-clamps an expanded bubble with a placement that is safe at the real source', () => {
    const actor = { bottom: 66.25, left: 70, right: 70, top: 70 };
    const variants = createHermesTravelFootprintVariants(
      actor,
      { bottom: 294.5, left: 92, right: 100, top: -80 },
      { horizontal: 'left', vertical: 'below' },
    );
    const target = rect(16, 434, 358, 192);

    const source = resolveHermesGuideSourceCandidate({
      current: { x: 195, y: 236 },
      editable: target,
      guardPx: 6,
      obstacles: [],
      variants,
      viewport: rect(0, 0, 390, 844),
    });

    expect(source).toEqual({
      placement: { horizontal: 'left', vertical: 'above' },
      point: { x: 195, y: 300.5 },
      requiresMove: true,
    });
  });

  it('builds four fixed bubble orientations from the measured source placement', () => {
    expect(createHermesTravelFootprintVariants(
      { bottom: 129, left: 137, right: 137, top: 138 },
      { bottom: -160, left: 172, right: 76, top: 315 },
      { horizontal: 'left', vertical: 'above' },
    )).toEqual([
      {
        footprint: { bottom: 129, left: 172, right: 137, top: 315 },
        parts: [{ bottom: 129, left: 137, right: 137, top: 138 }, { bottom: -160, left: 172, right: 76, top: 315 }],
        placement: { horizontal: 'left', vertical: 'above' },
      },
      {
        footprint: { bottom: 315, left: 172, right: 137, top: 138 },
        parts: [{ bottom: 129, left: 137, right: 137, top: 138 }, { bottom: 315, left: 172, right: 76, top: -160 }],
        placement: { horizontal: 'left', vertical: 'below' },
      },
      {
        footprint: { bottom: 129, left: 137, right: 172, top: 315 },
        parts: [{ bottom: 129, left: 137, right: 137, top: 138 }, { bottom: -160, left: 76, right: 172, top: 315 }],
        placement: { horizontal: 'right', vertical: 'above' },
      },
      {
        footprint: { bottom: 315, left: 137, right: 172, top: 138 },
        parts: [{ bottom: 129, left: 137, right: 137, top: 138 }, { bottom: 315, left: 76, right: 172, top: -160 }],
        placement: { horizontal: 'right', vertical: 'below' },
      },
    ]);
  });

  it('treats the measured actor and guide bubble as separate parts around the extract control', () => {
    const editable = rect(305.59375, 350.1875, 742.40625, 199.59375);
    const extract = rect(1349.515625, 189, 70.484375, 40);
    const actor = { bottom: 128.6810302734375, left: 137.0008544921875, right: 137.2574462890625, top: 138.39215087890625 };
    const bubble = { bottom: -160, left: 172, right: 76, top: 314.5 };
    const footprint = { bottom: actor.bottom, left: bubble.left, right: actor.right, top: bubble.top };
    const route = planHermesTravel({
      editable,
      footprint,
      footprintVariants: [{
        footprint,
        parts: [actor, bubble],
        placement: { horizontal: 'right', vertical: 'above' },
      }],
      from: rect(1122.5625, 589.40625, 360, 360),
      obstacles: [extract],
      preferredSides: ['right', 'top'],
      target: editable,
      viewport: rect(0, 0, 1440, 900),
    });
    const rightDock = { x: 1236, y: 449.984375 };
    const occupiedUnion = rectForFootprint(rightDock, footprint);

    expect(overlaps(rect(occupiedUnion.left, occupiedUnion.top, occupiedUnion.right - occupiedUnion.left, occupiedUnion.bottom - occupiedUnion.top), extract)).toBe(true);
    expect([actor, bubble].every((part) => {
      const occupiedPart = rectForFootprint(rightDock, part);
      return !overlaps(rect(occupiedPart.left, occupiedPart.top, occupiedPart.right - occupiedPart.left, occupiedPart.bottom - occupiedPart.top), extract);
    })).toBe(true);
    expect(route.mode).toBe('travel');
    expect((route as { placement?: unknown }).placement).toEqual({ horizontal: 'right', vertical: 'above' });
  });

  it('selects the below-bubble variant when only the above bubble conflicts', () => {
    const target = rect(400, 300, 200, 100);
    const actor = { bottom: 50, left: 50, right: 50, top: 50 };
    const aboveBubble = { bottom: -60, left: 150, right: 50, top: 160 };
    const belowBubble = { bottom: 160, left: 150, right: 50, top: -60 };
    const route = planHermesTravel({
      editable: target,
      footprint: { bottom: 50, left: 150, right: 50, top: 160 },
      footprintVariants: [
        {
          footprint: { bottom: 50, left: 150, right: 50, top: 160 },
          parts: [actor, aboveBubble],
          placement: { horizontal: 'right', vertical: 'above' },
        },
        {
          footprint: { bottom: 160, left: 150, right: 50, top: 50 },
          parts: [actor, belowBubble],
          placement: { horizontal: 'right', vertical: 'below' },
        },
      ],
      from: rect(900, 570, 100, 100),
      obstacles: [rect(650, 220, 100, 50)],
      preferredSides: ['right'],
      target,
      viewport: rect(0, 0, 1200, 800),
    });

    expect(route.mode).toBe('travel');
    expect(route.placement).toEqual({ horizontal: 'right', vertical: 'below' });
    expect(sweptOverlaps(route.points, rect(0, 0, 300, 210), target)).toBe(false);
  });

  it('keeps an edge-stop unsafe when every composite placement conflicts', () => {
    const target = rect(400, 300, 200, 100);
    const actor = { bottom: 50, left: 50, right: 50, top: 50 };
    const route = planHermesTravel({
      editable: target,
      footprint: actor,
      footprintVariants: [
        { footprint: actor, parts: [actor], placement: { horizontal: 'right', vertical: 'above' } },
        { footprint: actor, parts: [actor], placement: { horizontal: 'right', vertical: 'below' } },
      ],
      from: rect(900, 600, 100, 100),
      obstacles: [rect(0, 0, 1200, 800)],
      preferredSides: ['right'],
      target,
      viewport: rect(0, 0, 1200, 800),
    });

    expect(route.mode).toBe('edge-stop');
    expect(route.safe).toBe(false);
    expect(route.placement).toBeUndefined();
  });

  it('rejects a variant that would silently clamp away the real route start', () => {
    const target = rect(300, 220, 200, 80);
    const footprint = { bottom: 80, left: 80, right: 150, top: 80 };
    const route = planHermesTravel({
      editable: target,
      footprint,
      footprintVariants: [{
        footprint,
        parts: [footprint],
        placement: { horizontal: 'right', vertical: 'below' },
      }],
      from: rect(850, 500, 100, 100),
      preferredSides: ['right'],
      target,
      viewport: rect(0, 0, 1000, 700),
    });

    expect(route.mode).toBe('edge-stop');
    expect(route.safe).toBe(false);
    expect(route.points[0]).toEqual({ x: 900, y: 550 });
    expect(route.placement).toBeUndefined();
  });

  it('chooses bubble orientation from the actual safe candidate quadrant', () => {
    const target = rect(300, 180, 240, 100);
    const actor = { bottom: 50, left: 50, right: 50, top: 50 };
    const footprint = { bottom: 110, left: 110, right: 110, top: 110 };
    const route = planHermesTravel({
      editable: target,
      footprint,
      footprintVariants: [
        { footprint, parts: [actor], placement: { horizontal: 'left', vertical: 'above' } },
        { footprint, parts: [actor], placement: { horizontal: 'left', vertical: 'below' } },
        { footprint, parts: [actor], placement: { horizontal: 'right', vertical: 'above' } },
        { footprint, parts: [actor], placement: { horizontal: 'right', vertical: 'below' } },
      ],
      from: rect(700, 500, 100, 100),
      preferredSides: ['right'],
      target,
      viewport: rect(0, 0, 1200, 800),
    });

    expect(route.mode).toBe('travel');
    expect(route.dock.x).toBeGreaterThan(600);
    expect(route.placement).toEqual({ horizontal: 'left', vertical: 'below' });
  });

  it('treats an empty variant list as the legacy single-footprint plan', () => {
    const target = rect(400, 260, 200, 80);
    const footprint = { bottom: 50, left: 50, right: 50, top: 50 };
    const route = planHermesTravel({
      editable: target,
      footprint,
      footprintVariants: [],
      from: rect(850, 500, 100, 100),
      preferredSides: ['right'],
      target,
      viewport: rect(0, 0, 1200, 800),
    });

    expect(route.mode).toBe('travel');
    expect(route.safe).toBe(true);
    expect(route.points[0]).toEqual({ x: 900, y: 550 });
  });

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

import { describe, expect, it } from 'vitest';

import {
  createNeutralHermesPose,
  mixHermesMotion,
  shouldContinueHermesAnimation,
  type HermesMotionLayers,
} from '@/lib/hermes/motion-mixer';

const layers = (overrides: Partial<HermesMotionLayers> = {}): HermesMotionLayers => ({
  action: { pose: {}, weight: 0 },
  base: createNeutralHermesPose(),
  effect: { kind: 'none', progress: 0 },
  expression: { pose: {}, weight: 0 },
  settled: false,
  static: false,
  ...overrides,
});

describe('Hermes motion mixer', () => {
  it('keeps base breathing while independently adding action and expression joints', () => {
    const mixed = mixHermesMotion(layers({
      action: { pose: { head: { x: 6 }, tail: { angle: -8 } }, weight: .5 },
      base: { ...createNeutralHermesPose(), torso: { angle: 0, scale: 1.02, x: 0, y: -.6 } },
      expression: { pose: { gaze: { x: .5 }, head: { angle: 4 } }, weight: .4 },
    }));

    expect(mixed.torso).toEqual({ angle: 0, scale: 1.02, x: 0, y: -.6 });
    expect(mixed.head.x).toBe(3);
    expect(mixed.head.angle).toBeCloseTo(1.6, 5);
    expect(mixed.tail.angle).toBe(-4);
    expect(mixed.gaze.x).toBeCloseTo(.2, 5);
  });

  it('cross-fades an action from the current base pose instead of snapping', () => {
    const base = { ...createNeutralHermesPose(), head: { angle: 2, x: 1, y: -1 } };
    const entering = mixHermesMotion(layers({ action: { pose: { head: { x: 8 } }, weight: .25 }, base }));
    const active = mixHermesMotion(layers({ action: { pose: { head: { x: 8 } }, weight: 1 }, base }));

    expect(entering.head.x).toBe(3);
    expect(active.head.x).toBe(9);
    expect(entering.head.x).toBeGreaterThan(base.head.x);
    expect(entering.head.x).toBeLessThan(active.head.x);
  });

  it('clamps combined layers at the existing per-joint safety envelope', () => {
    const mixed = mixHermesMotion(layers({
      action: {
        pose: {
          crownAngle: 100,
          gaze: { x: 5, y: -5 },
          head: { angle: 100, x: 100, y: -100 },
          tail: { angle: -100, curl: 2 },
          torso: { angle: 50, scale: .5, x: 50, y: -50 },
        },
        weight: 1,
      },
    }));

    expect(mixed.head).toEqual({ angle: 12, x: 12, y: -8 });
    expect(mixed.torso).toEqual({ angle: 5, scale: .96, x: 4, y: -3 });
    expect(mixed.tail).toEqual({ angle: -18, curl: .16 });
    expect(mixed.crownAngle).toBe(14);
    expect(mixed.gaze).toEqual({ x: 1, y: -1 });
  });

  it('returns an exact neutral pose for approval or reduced static presentation', () => {
    const mixed = mixHermesMotion(layers({
      action: { pose: { head: { x: 9 }, tail: { angle: 12 } }, weight: 1 },
      effect: { kind: 'particles', progress: .8 },
      static: true,
    }));

    expect(mixed).toEqual(createNeutralHermesPose());
    expect(mixed.effect).toEqual({ kind: 'none', progress: 0 });
    expect(mixed.suspendable).toBe(true);
  });

  it('marks a fully settled failure as suspendable while leaving active effects drawable', () => {
    const settled = mixHermesMotion(layers({ settled: true }));
    const active = mixHermesMotion(layers({ effect: { kind: 'citation-arc', progress: .4 } }));

    expect(settled.suspendable).toBe(true);
    expect(active.suspendable).toBe(false);
  });

  it('stops drawing only after a suspendable pose has actually converged', () => {
    const target = { ...createNeutralHermesPose(), head: { angle: -1.8, x: 0, y: 1.8 } };
    const near = { ...target, head: { angle: -1.79, x: 0, y: 1.79 } };
    const far = { ...target, head: { angle: 0, x: 0, y: 0 } };

    expect(shouldContinueHermesAnimation(near, target)).toBe(false);
    expect(shouldContinueHermesAnimation(far, target)).toBe(true);
    expect(shouldContinueHermesAnimation(near, { ...target, suspendable: false })).toBe(true);
  });
});

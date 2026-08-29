import { describe, expect, it } from 'vitest';

import * as actionCatalog from '@/lib/hermes/action-catalog';
import { HERMES_ACTION_CATALOG, type HermesActionId } from '@/lib/hermes/action-catalog';

type WankoMotionGroup = 'Flick' | 'Flick3' | 'FlickLeft' | 'FlickUp' | 'Idle' | 'Shake' | 'Tap';
type WankoParameterId =
  | 'PARAM_ANGLE_X'
  | 'PARAM_ANGLE_Y'
  | 'PARAM_ANGLE_Z'
  | 'PARAM_BODY_ANGLE_X'
  | 'PARAM_BODY_ANGLE_Y'
  | 'PARAM_BODY_ANGLE_Z'
  | 'PARAM_BOWL_LID'
  | 'PARAM_BOWL_SWING'
  | 'PARAM_BREATH'
  | 'PARAM_EAR_L'
  | 'PARAM_EAR_R'
  | 'PARAM_EFFECT'
  | 'PARAM_EYE_L_OPEN'
  | 'PARAM_EYE_R_OPEN'
  | 'PARAM_FACE_01'
  | 'PARAM_HAND_L'
  | 'PARAM_HAND_R'
  | 'PARAM_MOUTH_FORM'
  | 'PARAM_MOUTH_OPEN_Y'
  | 'PARAM_SWING'
  | 'PARAM_TERE'
  | 'PARAM_YUGE_01'
  | 'PARAM_YUGE_02';

interface WankoPerformance {
  motion: { group: WankoMotionGroup; index: number; priority: 1 | 2 | 3 } | null;
  parameters: Readonly<Partial<Record<WankoParameterId, number>>>;
  presentation: 'celebrate' | 'evidence' | 'missing' | 'quiet' | 'trail';
}

type Resolver = (action: HermesActionId, seed?: number) => WankoPerformance;

function getResolver(): Resolver | undefined {
  return (actionCatalog as unknown as { resolveWankoPerformance?: Resolver }).resolveWankoPerformance;
}

function signature(performance: WankoPerformance): string {
  return JSON.stringify({
    motion: performance.motion,
    parameters: Object.entries(performance.parameters).sort(([left], [right]) => left.localeCompare(right)),
    presentation: performance.presentation,
  });
}

describe('Wanko action director', () => {
  it('exports a performance resolver for every production Hermes action', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    const actions = Object.keys(HERMES_ACTION_CATALOG) as HermesActionId[];
    const performances = actions.map((action) => resolve(action, 17));
    expect(performances).toHaveLength(actions.length);
    expect(new Set(performances.map(signature)).size).toBeGreaterThanOrEqual(29);
  });

  it('keeps every profile inside the Wanko motion and parameter envelope', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    const actions = Object.keys(HERMES_ACTION_CATALOG) as HermesActionId[];
    for (const action of actions) {
      const performance = resolve(action, 41);
      if (performance.motion) {
        expect(performance.motion.index, action).toBeGreaterThanOrEqual(0);
        expect(performance.motion.priority, action).toBeGreaterThanOrEqual(1);
        expect(performance.motion.priority, action).toBeLessThanOrEqual(3);
      }
      for (const [parameter, value] of Object.entries(performance.parameters)) {
        const isAngle = parameter.includes('ANGLE');
        const isBowlLid = parameter === 'PARAM_BOWL_LID';
        expect(value, `${action}:${parameter}`).toBeGreaterThanOrEqual(isBowlLid ? -10 : isAngle ? -30 : -1);
        expect(value, `${action}:${parameter}`).toBeLessThanOrEqual(isBowlLid ? 50 : isAngle ? 30 : 1.2);
      }
    }
  });

  it('keeps action profiles independent of the inseparable bowl lid and blob effects', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    const rejected = new Set(['PARAM_BOWL_LID', 'PARAM_BOWL_SWING', 'PARAM_EFFECT', 'PARAM_YUGE_01', 'PARAM_YUGE_02']);
    for (const action of Object.keys(HERMES_ACTION_CATALOG) as HermesActionId[]) {
      expect(Object.keys(resolve(action, 2).parameters).filter((id) => rejected.has(id)), action).toEqual([]);
    }
  });

  it('is deterministic by seed while retaining seeded idle variety', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    expect(resolve('observe-left', 9)).toEqual(resolve('observe-left', 9));
    expect(signature(resolve('blink-single', 1))).not.toBe(signature(resolve('blink-single', 2)));
  });

  it('gives left and right observation distinct Codex-Pet-like silhouettes', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    const left = resolve('observe-left');
    const right = resolve('observe-right');
    expect(left.motion).toBeNull();
    expect(right.motion).toBeNull();
    expect(left.parameters).toMatchObject({
      PARAM_ANGLE_X: -28, PARAM_ANGLE_Z: -9, PARAM_BODY_ANGLE_X: -10,
      PARAM_EAR_L: .9, PARAM_EAR_R: -.25, PARAM_EYE_L_OPEN: .65, PARAM_EYE_R_OPEN: 1.05,
    });
    expect(right.parameters).toMatchObject({
      PARAM_ANGLE_X: 28, PARAM_ANGLE_Z: 9, PARAM_BODY_ANGLE_X: 10,
      PARAM_EAR_L: -.25, PARAM_EAR_R: .9, PARAM_EYE_L_OPEN: 1.05, PARAM_EYE_R_OPEN: .65,
    });
  });

  it('makes the sleeping pose a recognisable full-body settle, not an eye-only change', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    expect(resolve('doze').motion).toMatchObject({ group: 'Idle', index: 2 });
    expect(resolve('doze').parameters).toMatchObject({
      PARAM_ANGLE_Y: 14,
      PARAM_ANGLE_Z: -10,
      PARAM_BODY_ANGLE_X: -12,
      PARAM_BODY_ANGLE_Y: 10,
      PARAM_EAR_L: -.85,
      PARAM_EAR_R: -.85,
      PARAM_EYE_L_OPEN: .08,
      PARAM_EYE_R_OPEN: .08,
    });
  });

  it('gives the thinking action a visible hand-led motion before its reflective hold', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    expect(resolve('thinking-pause').motion).toMatchObject({ group: 'Tap', index: 0 });
    expect(resolve('thinking-pause').parameters).toMatchObject({ PARAM_ANGLE_Z: -6, PARAM_HAND_L: .42 });
  });

  it('gives the five new lively ambient actions distinct bounded performances', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    const performances = ['cap-check', 'ear-perk', 'lamp-listen', 'happy-wiggle', 'thinking-pause']
      .map((action) => resolve(action as HermesActionId, 11));

    expect(new Set(performances.map(signature)).size).toBe(5);
    expect(performances.every((performance) => Object.keys(performance.parameters).length >= 2)).toBe(true);
  });

  it('locks decision states and product signatures to honest motion profiles', () => {
    const resolve = getResolver();
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    expect(resolve('approval-still', 0)).toEqual({ motion: null, parameters: {}, presentation: 'quiet' });
    expect(resolve('failed-settle', 0).motion).toBeNull();
    expect(resolve('failed-settle', 0).presentation).toBe('missing');
    expect(resolve('guide-travel', 0).presentation).toBe('trail');
    expect(resolve('read', 0).presentation).toBe('evidence');
    expect(resolve('milestone-dance', 0).presentation).toBe('celebrate');
    expect(resolve('milestone-dance', 0).motion?.group).toBe('Shake');
  });
});

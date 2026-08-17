import type { HermesEffect } from './action-catalog';

export interface HermesJointPose {
  blink: number;
  crownAngle: number;
  effect: { kind: HermesEffect; progress: number };
  gaze: { x: number; y: number };
  head: { angle: number; x: number; y: number };
  suspendable: boolean;
  tail: { angle: number; curl: number };
  torso: { angle: number; scale: number; x: number; y: number };
  working: boolean;
}

export interface HermesJointDelta {
  blink?: number;
  crownAngle?: number;
  gaze?: Partial<HermesJointPose['gaze']>;
  head?: Partial<HermesJointPose['head']>;
  tail?: Partial<HermesJointPose['tail']>;
  torso?: Partial<HermesJointPose['torso']>;
  working?: boolean;
}

export interface HermesMotionLayers {
  action: { pose: HermesJointDelta; weight: number };
  base: HermesJointPose;
  effect: { kind: HermesEffect; progress: number };
  expression: { pose: HermesJointDelta; weight: number };
  settled: boolean;
  static: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const add = (base: number, value: number | undefined, weight: number) => base + (value ?? 0) * weight;
const scale = (base: number, value: number | undefined, weight: number) => (
  value === undefined ? base : base + (value - base) * weight
);

export function createNeutralHermesPose(): HermesJointPose {
  return {
    blink: 0,
    crownAngle: 0,
    effect: { kind: 'none', progress: 0 },
    gaze: { x: 0, y: 0 },
    head: { angle: 0, x: 0, y: 0 },
    suspendable: true,
    tail: { angle: 0, curl: 0 },
    torso: { angle: 0, scale: 1, x: 0, y: 0 },
    working: false,
  };
}

export function mixHermesMotion(layers: HermesMotionLayers): HermesJointPose {
  if (layers.static) return createNeutralHermesPose();

  const actionWeight = clamp(layers.action.weight, 0, 1);
  const expressionWeight = clamp(layers.expression.weight, 0, 1);
  const base = layers.base;
  const action = layers.action.pose;
  const expression = layers.expression.pose;
  const effectProgress = clamp(layers.effect.progress, 0, 1);

  return {
    blink: clamp(add(add(base.blink, action.blink, actionWeight), expression.blink, expressionWeight), 0, 1),
    crownAngle: clamp(add(add(base.crownAngle, action.crownAngle, actionWeight), expression.crownAngle, expressionWeight), -14, 14),
    effect: effectProgress > 0 ? { kind: layers.effect.kind, progress: effectProgress } : { kind: 'none', progress: 0 },
    gaze: {
      x: clamp(add(add(base.gaze.x, action.gaze?.x, actionWeight), expression.gaze?.x, expressionWeight), -1, 1),
      y: clamp(add(add(base.gaze.y, action.gaze?.y, actionWeight), expression.gaze?.y, expressionWeight), -1, 1),
    },
    head: {
      angle: clamp(add(add(base.head.angle, action.head?.angle, actionWeight), expression.head?.angle, expressionWeight), -12, 12),
      x: clamp(add(add(base.head.x, action.head?.x, actionWeight), expression.head?.x, expressionWeight), -12, 12),
      y: clamp(add(add(base.head.y, action.head?.y, actionWeight), expression.head?.y, expressionWeight), -8, 8),
    },
    suspendable: layers.settled && effectProgress === 0,
    tail: {
      angle: clamp(add(add(base.tail.angle, action.tail?.angle, actionWeight), expression.tail?.angle, expressionWeight), -18, 18),
      curl: clamp(add(add(base.tail.curl, action.tail?.curl, actionWeight), expression.tail?.curl, expressionWeight), -.16, .16),
    },
    torso: {
      angle: clamp(add(add(base.torso.angle, action.torso?.angle, actionWeight), expression.torso?.angle, expressionWeight), -5, 5),
      scale: clamp(scale(scale(base.torso.scale, action.torso?.scale, actionWeight), expression.torso?.scale, expressionWeight), .96, 1.05),
      x: clamp(add(add(base.torso.x, action.torso?.x, actionWeight), expression.torso?.x, expressionWeight), -4, 4),
      y: clamp(add(add(base.torso.y, action.torso?.y, actionWeight), expression.torso?.y, expressionWeight), -3, 3),
    },
    working: base.working || (Boolean(action.working) && actionWeight > 0) || (Boolean(expression.working) && expressionWeight > 0),
  };
}

export function shouldContinueHermesAnimation(current: HermesJointPose, target: HermesJointPose): boolean {
  if (!target.suspendable) return true;
  const deltas = [
    current.blink - target.blink,
    current.crownAngle - target.crownAngle,
    current.gaze.x - target.gaze.x,
    current.gaze.y - target.gaze.y,
    current.head.angle - target.head.angle,
    current.head.x - target.head.x,
    current.head.y - target.head.y,
    current.tail.angle - target.tail.angle,
    current.tail.curl - target.tail.curl,
    current.torso.angle - target.torso.angle,
    current.torso.scale - target.torso.scale,
    current.torso.x - target.torso.x,
    current.torso.y - target.torso.y,
  ];
  return deltas.some((delta) => Math.abs(delta) > .025);
}

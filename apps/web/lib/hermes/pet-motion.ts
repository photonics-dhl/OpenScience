import { HERMES_ACTION_CATALOG, type HermesActionId } from './action-catalog';
import {
  createNeutralHermesPose,
  mixHermesMotion,
  type HermesJointDelta,
  type HermesJointPose,
} from './motion-mixer';

export type HermesPetVisualState = 'idle' | 'guiding' | 'suggesting' | 'scanning' | 'awaiting_approval' | 'failed';
export type HermesPetGesture = 'rest' | 'observe' | 'blink' | 'page-flick' | 'citation-swish' | 'evidence-check' | 'focus' | 'failed-settle' | 'still';

export interface HermesMotionInput {
  action?: HermesActionId;
  actionElapsedMs?: number;
  elapsedMs: number;
  engaged: boolean;
  pointer: { x: number; y: number };
  reducedMotion: boolean;
  state: HermesPetVisualState;
}

const ACTION_GESTURES: Record<HermesActionId, HermesPetGesture> = {
  'blink-single': 'blink',
  'blink-double': 'blink',
  'observe-left': 'observe',
  'observe-right': 'observe',
  'evidence-check': 'evidence-check',
  'page-tidy': 'page-flick',
  'citation-trace': 'citation-swish',
  stretch: 'observe',
  doze: 'rest',
  wake: 'observe',
  'surprise-settle': 'observe',
  'cap-check': 'page-flick',
  'ear-perk': 'observe',
  'lamp-listen': 'evidence-check',
  'happy-wiggle': 'citation-swish',
  'thinking-pause': 'focus',
  patrol: 'citation-swish',
  'return-dock': 'observe',
  'pointer-approach': 'focus',
  'pointer-avoid': 'observe',
  drag: 'focus',
  'guide-travel': 'citation-swish',
  'guide-arrive': 'observe',
  'quiet-write': 'focus',
  read: 'evidence-check',
  compare: 'evidence-check',
  draft: 'page-flick',
  'possible-issue': 'evidence-check',
  success: 'citation-swish',
  'milestone-dance': 'citation-swish',
  'failed-settle': 'failed-settle',
  'approval-still': 'still',
};

export interface HermesMotionSample extends HermesJointPose {
  gesture: HermesPetGesture;
  still: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const pulse = (progress: number) => {
  const p = clamp(progress, 0, 1);
  if (p < .2) return Math.sin((p / .2) * Math.PI * .5);
  if (p <= .65) return 1;
  return Math.cos(((p - .65) / .35) * Math.PI * .5);
};
const progressBetween = (value: number, start: number, end: number) => clamp((value - start) / (end - start), 0, 1);

interface DirectedActionPose {
  gesture: HermesPetGesture;
  pose: HermesJointDelta;
}

function sampleDirectedAction(action: HermesActionId, progress: number, pointer: { x: number; y: number }): DirectedActionPose {
  const p = clamp(progress, 0, 1);
  const motion = pulse(p);
  const oscillate = Math.sin(p * Math.PI * 2);
  const pointerDirection = Math.sign(pointer.x || 1);
  const gesture = ACTION_GESTURES[action];

  switch (action) {
    case 'blink-single':
      return { gesture, pose: { blink: p >= .24 && p <= .68 ? 1 : 0, head: { y: motion } } };
    case 'blink-double':
      return { gesture, pose: { blink: (p >= .14 && p <= .34) || (p >= .52 && p <= .76) ? 1 : 0, head: { y: motion * 1.2 } } };
    case 'observe-left':
      return { gesture, pose: { crownAngle: motion * 5.5, gaze: { x: -motion * .76 }, head: { angle: -motion * 8, x: -motion * 8, y: -motion * 3 }, tail: { angle: motion * 4 } } };
    case 'observe-right':
      return { gesture, pose: { crownAngle: -motion * 5.5, gaze: { x: motion * .76 }, head: { angle: motion * 8, x: motion * 8, y: -motion * 3 }, tail: { angle: -motion * 4 } } };
    case 'evidence-check':
      return { gesture, pose: { crownAngle: motion * 4.5, gaze: { x: -.25, y: motion * .55 }, head: { angle: -motion * 7, y: -motion * 6 }, tail: { angle: motion * 4, curl: motion * .04 } } };
    case 'page-tidy':
      return { gesture, pose: { crownAngle: oscillate * 14 * (1 - p * .18), gaze: { y: -.3 * motion }, head: { angle: -motion * 2.8 }, torso: { angle: motion * 1.5, x: motion * 1.5 } } };
    case 'citation-trace':
      return { gesture, pose: { gaze: { x: oscillate * .4 }, head: { angle: -motion * 2.2 }, tail: { angle: Math.sin(p * Math.PI) * 17, curl: motion * .15 } } };
    case 'stretch':
      return { gesture, pose: { crownAngle: -motion * 7, head: { angle: -motion * 4.5, y: -motion * 6 }, tail: { angle: -motion * 12, curl: -motion * .07 }, torso: { scale: 1 + motion * .05, y: -motion * 2.5 } } };
    case 'doze':
      return { gesture: 'blink', pose: { blink: motion > .3 ? 1 : 0, crownAngle: motion * 3, head: { angle: -motion * 5, y: motion * 4.5 }, tail: { angle: motion * 5, curl: motion * .09 }, torso: { scale: 1 - motion * .025, y: motion * 1.5 } } };
    case 'wake':
      return { gesture, pose: { blink: p < .18 ? 1 : 0, crownAngle: motion * 9.5, gaze: { y: -motion * .35 }, head: { angle: motion * 4, y: -motion * 6.5 }, tail: { angle: -motion * 7 }, torso: { scale: 1 + motion * .05, y: -motion * 2.8 } } };
    case 'surprise-settle':
      return { gesture, pose: { crownAngle: motion * 12, gaze: { y: -motion * .65 }, head: { angle: motion * 7, x: -motion * 7, y: -motion * 4 }, tail: { angle: motion * 11, curl: -motion * .08 }, torso: { scale: 1 - motion * .04, x: -motion * 2.5 } } };
    case 'cap-check':
      return { gesture, pose: { crownAngle: oscillate * 8, gaze: { y: -.25 }, head: { angle: motion * 3, y: -motion * 2 }, torso: { x: motion * 1.2 } } };
    case 'ear-perk':
      return { gesture, pose: { crownAngle: motion * 8, gaze: { y: -motion * .45 }, head: { angle: motion * 4, y: -motion * 4 }, tail: { angle: -motion * 5 } } };
    case 'lamp-listen':
      return { gesture, pose: { gaze: { x: -.45, y: .4 }, head: { angle: -motion * 6, x: -motion * 4, y: motion * 2 }, tail: { angle: motion * 4, curl: motion * .05 } } };
    case 'happy-wiggle':
      return { gesture, pose: { crownAngle: oscillate * 10, gaze: { y: -motion * .35 }, head: { angle: oscillate * 7, y: -motion * 4 }, tail: { angle: -oscillate * 15, curl: motion * .1 }, torso: { angle: oscillate * 3, y: -motion * 2 } } };
    case 'thinking-pause':
      return { gesture, pose: { crownAngle: -motion * 5, gaze: { x: -.32, y: .28 }, head: { angle: -motion * 7, x: -motion * 2 }, tail: { angle: motion * 3, curl: motion * .04 } } };
    case 'patrol':
      return { gesture, pose: { crownAngle: oscillate * 6, gaze: { x: oscillate * .8 }, head: { angle: oscillate * 6, x: oscillate * 10, y: -motion * 2.5 }, tail: { angle: -oscillate * 13, curl: motion * .1 }, torso: { angle: oscillate * 2, x: oscillate * 3.8 } } };
    case 'return-dock':
      return { gesture, pose: { crownAngle: motion * 7, gaze: { y: -motion * .3 }, head: { angle: -motion * 4, y: -motion * 6 }, tail: { angle: motion * 9 }, torso: { scale: 1 + motion * .035, y: -motion * 2.8 } } };
    case 'pointer-approach':
      return { gesture, pose: { crownAngle: pointerDirection * motion * 7, head: { angle: pointerDirection * motion * 5, x: pointerDirection * motion * 6, y: -motion * 4 }, tail: { angle: -pointerDirection * motion * 7 }, torso: { angle: pointerDirection * motion * 1.4, x: pointerDirection * motion * 2.5 } } };
    case 'pointer-avoid':
      return { gesture, pose: { crownAngle: -pointerDirection * motion * 9, head: { angle: -pointerDirection * motion * 8, x: -pointerDirection * motion * 12, y: motion * 2 }, tail: { angle: pointerDirection * motion * 14 }, torso: { angle: -pointerDirection * motion * 2.5, x: -pointerDirection * motion * 4 } } };
    case 'drag':
      return { gesture, pose: { crownAngle: oscillate * 4, head: { angle: oscillate * 3, y: -motion * 3 }, tail: { angle: -oscillate * 7 }, torso: { scale: 1 - motion * .025, y: motion * 2 } } };
    case 'guide-travel':
      return { gesture, pose: { crownAngle: -motion * 6, gaze: { x: motion * .65 }, head: { angle: motion * 5, x: motion * 6, y: -motion * 4 }, tail: { angle: -motion * 14, curl: motion * .12 }, torso: { angle: motion * 2, scale: 1 + motion * .035, x: motion * 3.5 } } };
    case 'guide-arrive':
      return { gesture, pose: { blink: p > .72 ? 1 : 0, crownAngle: oscillate * 6, head: { angle: -motion * 5, y: -motion * 5 }, tail: { angle: motion * 8 }, torso: { scale: 1 + motion * .04, y: -motion * 2 } } };
    case 'quiet-write':
      return { gesture, pose: { gaze: { x: -.28, y: .42 }, head: { angle: -motion * 3, x: -motion * 2, y: -motion * 2 }, tail: { angle: motion * 2, curl: motion * .025 }, torso: { angle: -motion * .8 } } };
    case 'read':
      return { gesture: 'evidence-check', pose: { gaze: { x: oscillate * .4, y: .45 }, head: { angle: -motion * 5, x: oscillate * 3, y: -motion * 4 }, tail: { angle: -oscillate * 4 }, torso: { x: oscillate * 1.2 } } };
    case 'compare':
      return { gesture: 'evidence-check', pose: { gaze: { x: oscillate * .75 }, head: { angle: oscillate * 5, x: oscillate * 7, y: -motion * 3 }, tail: { angle: -oscillate * 8 }, torso: { angle: oscillate * 1.5 } } };
    case 'draft':
      return { gesture: 'page-flick', pose: { crownAngle: oscillate * 11, gaze: { x: .35, y: .3 }, head: { angle: -motion * 4, x: motion * 2 }, tail: { angle: -oscillate * 6, curl: motion * .06 }, torso: { x: motion * 1.5 } } };
    case 'possible-issue':
      return { gesture: 'evidence-check', pose: { crownAngle: -motion * 8, gaze: { x: -.55, y: .35 }, head: { angle: motion * 9, x: -motion * 5, y: motion * 2 }, tail: { angle: motion * 7, curl: motion * .07 }, torso: { angle: -motion * 1.5 } } };
    case 'success':
      return { gesture: 'citation-swish', pose: { blink: p > .78 ? 1 : 0, crownAngle: motion * 10, gaze: { y: -motion * .5 }, head: { angle: motion * 6, y: -motion * 6 }, tail: { angle: -oscillate * 14, curl: motion * .12 }, torso: { scale: 1 + motion * .05, y: -motion * 2.5 } } };
    case 'milestone-dance':
      return { gesture: 'citation-swish', pose: { blink: (p > .2 && p < .28) || (p > .58 && p < .66) ? 1 : 0, crownAngle: oscillate * 14, gaze: { x: oscillate * .7 }, head: { angle: oscillate * 10, x: oscillate * 8, y: -motion * 6 }, tail: { angle: -oscillate * 18, curl: motion * .15 }, torso: { angle: oscillate * 4, scale: 1 + motion * .05, x: oscillate * 3.5, y: -motion * 2.5 } } };
    case 'failed-settle':
      return { gesture, pose: { head: { angle: -1.8, y: 1.8 } } };
    case 'approval-still':
      return { gesture, pose: {} };
  }
}

const stillSample = (): HermesMotionSample => ({
  ...createNeutralHermesPose(),
  gesture: 'still',
  still: true,
});

const failedSample = (): HermesMotionSample => ({
  ...stillSample(),
  gesture: 'failed-settle',
  head: { angle: -1.8, x: 0, y: 1.8 },
});

type IdleWindow = { end: number; gesture: HermesPetGesture; start: number };
const IDLE_CYCLES: Array<{ duration: number; windows: IdleWindow[] }> = [
  { duration: 10_000, windows: [
    { start: 1_200, end: 2_800, gesture: 'observe' }, { start: 2_800, end: 3_300, gesture: 'blink' },
    { start: 3_300, end: 4_300, gesture: 'page-flick' }, { start: 5_400, end: 7_000, gesture: 'citation-swish' },
    { start: 7_000, end: 8_500, gesture: 'evidence-check' },
  ] },
  { duration: 11_600, windows: [
    { start: 900, end: 1_450, gesture: 'blink' }, { start: 2_100, end: 3_850, gesture: 'citation-swish' },
    { start: 5_100, end: 6_500, gesture: 'observe' }, { start: 8_000, end: 9_250, gesture: 'evidence-check' },
    { start: 9_700, end: 10_700, gesture: 'page-flick' },
  ] },
  { duration: 9_400, windows: [
    { start: 1_500, end: 2_600, gesture: 'evidence-check' }, { start: 3_100, end: 4_050, gesture: 'page-flick' },
    { start: 5_300, end: 6_750, gesture: 'observe' }, { start: 7_200, end: 7_700, gesture: 'blink' },
  ] },
  { duration: 12_800, windows: [
    { start: 1_100, end: 2_700, gesture: 'citation-swish' }, { start: 4_200, end: 5_750, gesture: 'evidence-check' },
    { start: 7_200, end: 8_700, gesture: 'observe' }, { start: 9_600, end: 10_100, gesture: 'blink' },
    { start: 10_400, end: 11_500, gesture: 'page-flick' },
  ] },
];
const IDLE_GRAMMAR_DURATION = IDLE_CYCLES.reduce((total, cycle) => total + cycle.duration, 0);

function idleGesture(elapsedMs: number): { gesture: HermesPetGesture; progress: number } {
  let phase = elapsedMs % IDLE_GRAMMAR_DURATION;
  const cycle = IDLE_CYCLES.find((candidate) => {
    if (phase < candidate.duration) return true;
    phase -= candidate.duration;
    return false;
  }) ?? IDLE_CYCLES[0];
  const active = cycle.windows.find((window) => phase >= window.start && phase < window.end);
  if (active) return { gesture: active.gesture, progress: progressBetween(phase, active.start, active.end) };
  return { gesture: 'rest', progress: 0 };
}

export function sampleHermesMotion(input: HermesMotionInput): HermesMotionSample {
  if (input.reducedMotion || input.state === 'awaiting_approval') return stillSample();
  if (input.state === 'failed') return failedSample();

  const elapsedMs = Math.max(0, input.elapsedMs);
  const breathing = Math.sin((elapsedMs / 3_800) * Math.PI * 2);
  const headLife = Math.sin((elapsedMs / 3_800) * Math.PI * 2 + .55);
  const tailLife = Math.sin((elapsedMs / 2_850) * Math.PI * 2 - .9);
  const crownLife = Math.sin((elapsedMs / 2_350) * Math.PI * 2 - 1.35);
  const selectedAction = input.action ? HERMES_ACTION_CATALOG[input.action] : null;
  const idle = selectedAction ? {
    gesture: ACTION_GESTURES[selectedAction.id],
    progress: progressBetween(input.actionElapsedMs ?? elapsedMs, 0, Math.max(1, selectedAction.durationMs)),
  } : idleGesture(elapsedMs);
  const motion = pulse(idle.progress);
  const working = input.state === 'scanning';
  const attentive = input.state === 'guiding' || input.state === 'suggesting';
  const pointerX = input.engaged ? clamp(input.pointer.x, -1, 1) : 0;
  const pointerY = input.engaged ? clamp(input.pointer.y, -1, 1) : 0;
  const directed = selectedAction ? sampleDirectedAction(selectedAction.id, idle.progress, { x: pointerX, y: pointerY }) : null;

  let gesture: HermesPetGesture = directed?.gesture ?? idle.gesture;
  let headX = 0;
  let headY = 0;
  let headAngle = 0;
  let crownAngle = 0;
  let tailAngle = 0;
  let tailCurl = 0;
  let blink = 0;

  if (!directed && idle.gesture === 'observe') {
    headX += motion * 5.6;
    headY -= motion * 2.6;
    headAngle += motion * 6.4;
    crownAngle -= motion * 4.2;
    tailAngle -= motion * 3.4;
  } else if (!directed && idle.gesture === 'blink') {
    blink = motion > .42 ? 1 : 0;
    headY += motion * .5;
  } else if (!directed && idle.gesture === 'page-flick') {
    crownAngle += Math.sin(idle.progress * Math.PI * 2.4) * 10 * (1 - idle.progress * .35);
    headAngle -= motion * 1.8;
  } else if (!directed && idle.gesture === 'citation-swish') {
    tailAngle += Math.sin(idle.progress * Math.PI * 2.2) * 16 * (1 - idle.progress * .28);
    tailCurl += motion * .11;
    headAngle -= motion * 1.2;
  } else if (!directed && idle.gesture === 'evidence-check') {
    headY -= motion * 6;
    headAngle -= motion * 5.2;
    crownAngle += motion * 3.2;
    tailAngle += motion * 2.1;
  }

  let expressionHeadX = 0;
  let expressionHeadY = 0;
  let expressionHeadAngle = 0;
  let expressionCrownAngle = 0;
  let expressionTailAngle = 0;
  let expressionTailCurl = 0;
  let expressionTorsoAngle = 0;
  let expressionTorsoX = 0;
  let expressionTorsoY = 0;

  if (working) {
    gesture = 'focus';
    expressionHeadY -= 1.2;
    expressionHeadAngle -= 2.2;
    expressionTailAngle = -1.4 - breathing * .9;
  } else if (attentive) {
    gesture = 'focus';
    expressionHeadX += 1.4;
    expressionHeadAngle += 1.6;
    expressionTorsoAngle += .45;
  }

  if (input.engaged) {
    gesture = 'focus';
    expressionHeadX += pointerX * 8;
    expressionHeadY += pointerY * 5;
    expressionHeadAngle += pointerX * 5.4;
    expressionCrownAngle += pointerX * 4.2 - pointerY * 2;
    expressionTailAngle -= pointerX * 7.5;
    expressionTailCurl += Math.abs(pointerX) * .035;
    expressionTorsoAngle += pointerX * 1.15;
    expressionTorsoX += pointerX * 2.4;
    expressionTorsoY += pointerY * 1.2;
  }

  const pose = mixHermesMotion({
    action: {
      pose: directed?.pose ?? {
        blink,
        crownAngle,
        head: { angle: headAngle, x: headX, y: headY },
        tail: { angle: tailAngle, curl: tailCurl },
      },
      weight: 1,
    },
    base: {
      ...createNeutralHermesPose(),
      crownAngle: crownLife * 3.2,
      head: { angle: headLife * 1.25, x: 0, y: headLife * 1.8 },
      suspendable: false,
      tail: { angle: tailLife * 4.5, curl: tailLife * .055 },
      torso: { angle: breathing * .35, scale: 1 + breathing * .04, x: 0, y: -breathing * 2 },
    },
    effect: {
      kind: selectedAction?.effect ?? 'none',
      progress: selectedAction?.effect === 'none' ? 0 : motion,
    },
    expression: {
      pose: {
        crownAngle: expressionCrownAngle,
        gaze: { x: pointerX * .72, y: pointerY * .58 },
        head: { angle: expressionHeadAngle, x: expressionHeadX, y: expressionHeadY },
        tail: { angle: expressionTailAngle, curl: expressionTailCurl },
        torso: { angle: expressionTorsoAngle, x: expressionTorsoX, y: expressionTorsoY },
        working,
      },
      weight: 1,
    },
    settled: false,
    static: false,
  });

  return {
    ...pose,
    gesture,
    still: false,
  };
}

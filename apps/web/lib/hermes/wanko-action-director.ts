import type { HermesActionId } from './action-catalog';

type WankoMotionGroup = 'Flick' | 'Flick3' | 'FlickLeft' | 'FlickUp' | 'Idle' | 'Shake' | 'Tap';

export type WankoParameterId =
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

export interface WankoPerformance {
  motion: { group: WankoMotionGroup; index: number; priority: 1 | 2 | 3 } | null;
  parameters: Readonly<Partial<Record<WankoParameterId, number>>>;
  presentation: 'celebrate' | 'evidence' | 'missing' | 'quiet' | 'trail';
}

const motion = (
  group: WankoMotionGroup,
  index: number,
  priority: 1 | 2 | 3 = 2,
): WankoPerformance['motion'] => ({ group, index, priority });

const profiles: Record<Exclude<HermesActionId, 'blink-single'>, WankoPerformance> = {
  'approval-still': { motion: null, parameters: {}, presentation: 'quiet' },
  'blink-double': {
    motion: motion('Flick3', 0, 1),
    parameters: { PARAM_EYE_L_OPEN: .12, PARAM_EYE_R_OPEN: .12 },
    presentation: 'quiet',
  },
  'citation-trace': {
    motion: motion('FlickLeft', 0),
    parameters: { PARAM_ANGLE_X: -6, PARAM_HAND_R: .55 },
    presentation: 'evidence',
  },
  compare: {
    motion: motion('Flick', 0),
    parameters: { PARAM_ANGLE_X: -9, PARAM_EYE_L_OPEN: .72, PARAM_EYE_R_OPEN: .92, PARAM_FACE_01: .45 },
    presentation: 'evidence',
  },
  doze: {
    motion: motion('Idle', 2),
    parameters: {
      PARAM_ANGLE_Y: 14, PARAM_ANGLE_Z: -10, PARAM_BODY_ANGLE_X: -12, PARAM_BODY_ANGLE_Y: 10,
      PARAM_BREATH: .16, PARAM_EAR_L: -.85, PARAM_EAR_R: -.85,
      PARAM_EYE_L_OPEN: .08, PARAM_EYE_R_OPEN: .08,
    },
    presentation: 'quiet',
  },
  draft: {
    motion: motion('Tap', 0),
    parameters: { PARAM_BODY_ANGLE_Z: -3, PARAM_HAND_L: .72, PARAM_MOUTH_FORM: .25 },
    presentation: 'evidence',
  },
  drag: {
    motion: motion('Shake', 0, 3),
    parameters: { PARAM_ANGLE_Z: 11, PARAM_BODY_ANGLE_X: 8, PARAM_SWING: .8 },
    presentation: 'quiet',
  },
  'evidence-check': {
    motion: motion('Flick', 1),
    parameters: { PARAM_ANGLE_Y: -4, PARAM_FACE_01: .52, PARAM_HAND_R: .64 },
    presentation: 'evidence',
  },
  'failed-settle': {
    motion: null,
    parameters: { PARAM_ANGLE_Y: 8, PARAM_EAR_L: -.45, PARAM_EAR_R: -.45, PARAM_EYE_L_OPEN: .38, PARAM_EYE_R_OPEN: .38 },
    presentation: 'missing',
  },
  'guide-arrive': {
    motion: motion('Tap', 1, 3),
    parameters: { PARAM_ANGLE_X: 11, PARAM_HAND_R: .86, PARAM_MOUTH_OPEN_Y: .38 },
    presentation: 'quiet',
  },
  'guide-travel': {
    motion: motion('FlickLeft', 0, 3),
    parameters: { PARAM_BODY_ANGLE_X: 8, PARAM_EAR_L: .7, PARAM_EAR_R: .5, PARAM_SWING: .65 },
    presentation: 'trail',
  },
  'milestone-dance': {
    motion: motion('Shake', 0, 3),
    parameters: { PARAM_EAR_L: .8, PARAM_EAR_R: .8, PARAM_HAND_L: .85, PARAM_HAND_R: .85, PARAM_MOUTH_OPEN_Y: .74 },
    presentation: 'celebrate',
  },
  'observe-left': {
    motion: null,
    parameters: {
      PARAM_ANGLE_X: -28, PARAM_ANGLE_Z: -9, PARAM_BODY_ANGLE_X: -10,
      PARAM_EAR_L: .9, PARAM_EAR_R: -.25, PARAM_EYE_L_OPEN: .65, PARAM_EYE_R_OPEN: 1.05,
    },
    presentation: 'quiet',
  },
  'observe-right': {
    motion: null,
    parameters: {
      PARAM_ANGLE_X: 28, PARAM_ANGLE_Z: 9, PARAM_BODY_ANGLE_X: 10,
      PARAM_EAR_L: -.25, PARAM_EAR_R: .9, PARAM_EYE_L_OPEN: 1.05, PARAM_EYE_R_OPEN: .65,
    },
    presentation: 'quiet',
  },
  'page-tidy': {
    motion: motion('Tap', 1),
    parameters: { PARAM_ANGLE_Y: -7, PARAM_HAND_L: .8, PARAM_HAND_R: .36 },
    presentation: 'quiet',
  },
  patrol: {
    motion: motion('FlickLeft', 0),
    parameters: { PARAM_BODY_ANGLE_Y: 6, PARAM_BODY_ANGLE_Z: 3, PARAM_EAR_R: .62 },
    presentation: 'trail',
  },
  'pointer-approach': {
    motion: motion('Tap', 0, 3),
    parameters: { PARAM_ANGLE_X: 16, PARAM_EYE_L_OPEN: 1.05, PARAM_EYE_R_OPEN: 1.05, PARAM_MOUTH_OPEN_Y: .22 },
    presentation: 'quiet',
  },
  'pointer-avoid': {
    motion: motion('Flick', 1, 3),
    parameters: { PARAM_ANGLE_X: -18, PARAM_ANGLE_Z: -7, PARAM_EAR_L: -.2, PARAM_EAR_R: .55 },
    presentation: 'quiet',
  },
  'possible-issue': {
    motion: motion('Idle', 2),
    parameters: { PARAM_ANGLE_Z: -8, PARAM_EAR_L: -.36, PARAM_EAR_R: -.36, PARAM_FACE_01: .72 },
    presentation: 'missing',
  },
  'quiet-write': {
    motion: motion('Idle', 0, 1),
    parameters: { PARAM_ANGLE_Y: -6, PARAM_BREATH: .34, PARAM_EYE_L_OPEN: .64, PARAM_EYE_R_OPEN: .64 },
    presentation: 'quiet',
  },
  read: {
    motion: motion('Idle', 1),
    parameters: { PARAM_ANGLE_Y: -12, PARAM_EYE_L_OPEN: .78, PARAM_EYE_R_OPEN: .78, PARAM_HAND_L: .28 },
    presentation: 'evidence',
  },
  'return-dock': {
    motion: motion('Idle', 1),
    parameters: { PARAM_BODY_ANGLE_X: -7, PARAM_BODY_ANGLE_Z: -3, PARAM_SWING: .28 },
    presentation: 'trail',
  },
  stretch: {
    motion: motion('Flick3', 1),
    parameters: { PARAM_BODY_ANGLE_Y: -7, PARAM_BREATH: .52, PARAM_HAND_L: .65, PARAM_HAND_R: .65 },
    presentation: 'quiet',
  },
  success: {
    motion: motion('Flick3', 0, 3),
    parameters: { PARAM_EAR_L: .55, PARAM_EAR_R: .55, PARAM_MOUTH_FORM: .72, PARAM_MOUTH_OPEN_Y: .62, PARAM_TERE: .3 },
    presentation: 'celebrate',
  },
  'surprise-settle': {
    motion: motion('FlickUp', 0, 3),
    parameters: { PARAM_ANGLE_Z: 7, PARAM_EYE_L_OPEN: 1.18, PARAM_EYE_R_OPEN: 1.18, PARAM_MOUTH_OPEN_Y: .82 },
    presentation: 'quiet',
  },
  'cap-check': {
    motion: motion('Tap', 1),
    parameters: { PARAM_ANGLE_X: 4, PARAM_EYE_L_OPEN: .86, PARAM_HAND_R: .68 },
    presentation: 'quiet',
  },
  'ear-perk': {
    motion: motion('FlickUp', 0),
    parameters: { PARAM_ANGLE_Z: 4, PARAM_EAR_L: .92, PARAM_EAR_R: .7 },
    presentation: 'quiet',
  },
  'lamp-listen': {
    motion: motion('Idle', 1),
    parameters: { PARAM_ANGLE_Y: 10, PARAM_BODY_ANGLE_X: 5, PARAM_EAR_R: .62 },
    presentation: 'evidence',
  },
  'happy-wiggle': {
    motion: motion('Shake', 0),
    parameters: { PARAM_EAR_L: .7, PARAM_EAR_R: .7, PARAM_MOUTH_FORM: .65, PARAM_SWING: .72 },
    presentation: 'celebrate',
  },
  'thinking-pause': {
    motion: motion('Tap', 0),
    parameters: { PARAM_ANGLE_Z: -6, PARAM_FACE_01: .55, PARAM_HAND_L: .42 },
    presentation: 'evidence',
  },
  wake: {
    motion: motion('FlickUp', 0, 2),
    parameters: { PARAM_BODY_ANGLE_Y: -5, PARAM_EAR_L: .72, PARAM_EAR_R: .72, PARAM_EYE_L_OPEN: 1.1, PARAM_EYE_R_OPEN: 1.1 },
    presentation: 'quiet',
  },
};

export function resolveWankoPerformance(action: HermesActionId, seed = 0): WankoPerformance {
  if (action !== 'blink-single') return profiles[action];
  const normalizedSeed = Math.abs(Math.trunc(seed));
  return {
    motion: motion('Idle', normalizedSeed % 3, 1),
    parameters: {
      PARAM_ANGLE_X: (normalizedSeed % 5) - 2,
      PARAM_EYE_L_OPEN: .18,
      PARAM_EYE_R_OPEN: .18,
    },
    presentation: 'quiet',
  };
}

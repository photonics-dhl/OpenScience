import type { HermesVisualState } from '@/components/hermes/hermes-state';

import {
  HERMES_ACTION_CATALOG,
  HERMES_MICRO_ACTIONS,
  HERMES_SIGNATURE_ACTIONS,
  type HermesActionId,
  type HermesEffect,
  type HermesExpression,
} from './action-catalog';

export interface HermesBehaviorInput {
  activity: 'quiet' | 'balanced' | 'active';
  dragging: boolean;
  guide: 'idle' | 'travel' | 'arrived';
  nowMs: number;
  pointer: { x: number; y: number; speed: number; present: boolean };
  reducedMotion: boolean;
  seed: number;
  state: HermesVisualState;
  task: 'idle' | 'working' | 'failed' | 'succeeded';
  writing: boolean;
}

export interface HermesBehaviorFrame {
  durationMs: number;
  effect: HermesEffect;
  expression: HermesExpression;
  interruptible: boolean;
  kind: 'micro' | 'signature' | 'priority';
  motion: 'animated' | 'static';
  microCursor: number;
  nextMicroAtMs: number;
  nextSignatureAtMs: number;
  primary: HermesActionId;
  signatureCursor: number;
  startedAtMs: number;
}

const CADENCE = {
  quiet: { micro: [6_500, 8_000], signature: [28_000, 35_000] },
  balanced: { micro: [2_400, 4_200], signature: [14_000, 22_000] },
  active: { micro: [4_000, 6_000], signature: [20_000, 28_000] },
} as const;

function hash(seed: number, value: number, salt: number): number {
  let result = (seed | 0) ^ Math.imul(value | 0, 0x45d9f3b) ^ salt;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

function interval(input: HermesBehaviorInput, kind: 'micro' | 'signature', salt: number): number {
  const [minimum, maximum] = CADENCE[input.activity][kind];
  return minimum + hash(input.seed, Math.floor(input.nowMs / 100), salt) % (maximum - minimum + 1);
}

function chooseFromCycle(
  pool: readonly HermesActionId[],
  input: HermesBehaviorInput,
  salt: number,
  cursor: number,
): HermesActionId {
  const initial = hash(input.seed, 0, salt) % pool.length;
  return pool[(initial + cursor) % pool.length];
}

function frame(
  primary: HermesActionId,
  kind: HermesBehaviorFrame['kind'],
  input: HermesBehaviorInput,
  schedule: Pick<HermesBehaviorFrame, 'microCursor' | 'nextMicroAtMs' | 'nextSignatureAtMs' | 'signatureCursor'>,
): HermesBehaviorFrame {
  const definition = HERMES_ACTION_CATALOG[primary];
  return {
    durationMs: definition.durationMs,
    effect: input.reducedMotion ? 'none' : definition.effect,
    expression: definition.expression,
    interruptible: definition.interruptible,
    kind,
    microCursor: schedule.microCursor,
    motion: input.reducedMotion ? 'static' : 'animated',
    nextMicroAtMs: schedule.nextMicroAtMs,
    nextSignatureAtMs: schedule.nextSignatureAtMs,
    primary,
    signatureCursor: schedule.signatureCursor,
    startedAtMs: input.nowMs,
  };
}

function priorityAction(input: HermesBehaviorInput): HermesActionId | null {
  if (input.state === 'awaiting_approval') return 'approval-still';
  if (input.dragging) return 'drag';
  if (input.guide === 'travel') return 'guide-travel';
  if (input.guide === 'arrived') return 'guide-arrive';
  if (input.task === 'failed' || input.state === 'failed') return 'failed-settle';
  if (input.task === 'working' || input.state === 'scanning') return 'read';
  if (input.task === 'succeeded') return 'success';
  if (input.writing) return 'quiet-write';
  if (input.pointer.present) return input.pointer.speed > .75 ? 'pointer-avoid' : 'pointer-approach';
  return null;
}

export function createInitialHermesBehavior(input: HermesBehaviorInput): HermesBehaviorFrame {
  const priority = priorityAction(input);
  const primary = priority ?? chooseFromCycle(HERMES_MICRO_ACTIONS, input, 0x11, 0);
  return frame(primary, priority ? 'priority' : 'micro', input, {
    microCursor: priority ? 0 : 1,
    nextMicroAtMs: input.nowMs + interval(input, 'micro', 0x21),
    nextSignatureAtMs: input.nowMs + interval(input, 'signature', 0x31),
    signatureCursor: 0,
  });
}

export function stepHermesBehavior(
  previous: HermesBehaviorFrame,
  input: HermesBehaviorInput,
): HermesBehaviorFrame {
  const priority = priorityAction(input);
  if (priority) {
    if (previous.kind === 'priority' && previous.primary === priority && previous.motion === (input.reducedMotion ? 'static' : 'animated')) {
      return previous;
    }
    return frame(priority, 'priority', input, previous);
  }

  if (previous.kind === 'priority') {
    const primary = chooseFromCycle(HERMES_MICRO_ACTIONS, input, 0x11, previous.microCursor);
    return frame(primary, 'micro', input, {
      microCursor: previous.microCursor + 1,
      nextMicroAtMs: input.nowMs + interval(input, 'micro', 0x42),
      nextSignatureAtMs: Math.max(previous.nextSignatureAtMs, input.nowMs + interval(input, 'signature', 0x43)),
      signatureCursor: previous.signatureCursor,
    });
  }

  if (input.nowMs < previous.startedAtMs + previous.durationMs) return previous;

  if (input.nowMs >= previous.nextSignatureAtMs) {
    const primary = chooseFromCycle(HERMES_SIGNATURE_ACTIONS, input, 0x51, previous.signatureCursor);
    return frame(primary, 'signature', input, {
      microCursor: previous.microCursor,
      nextMicroAtMs: input.nowMs + interval(input, 'micro', 0x52),
      nextSignatureAtMs: input.nowMs + interval(input, 'signature', 0x53),
      signatureCursor: previous.signatureCursor + 1,
    });
  }

  if (input.nowMs >= previous.nextMicroAtMs) {
    const primary = chooseFromCycle(HERMES_MICRO_ACTIONS, input, 0x11, previous.microCursor);
    return frame(primary, 'micro', input, {
      microCursor: previous.microCursor + 1,
      nextMicroAtMs: input.nowMs + interval(input, 'micro', 0x62),
      nextSignatureAtMs: previous.nextSignatureAtMs,
      signatureCursor: previous.signatureCursor,
    });
  }

  return previous;
}

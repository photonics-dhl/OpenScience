import type { HermesActionId } from './action-catalog';

export type HermesSpeechTone = 'curious' | 'focused' | 'friendly' | 'reflective';

export interface HermesSpeechCue {
  beatId: string;
  messageKey: string;
  tone: HermesSpeechTone;
  visibleUntilMs: number;
}

export interface HermesSpeechState {
  cue: HermesSpeechCue | null;
  nextAtMs: number;
  previousMessageKey: string | null;
  sequence: number;
}

export interface HermesSpeechInput {
  action: HermesActionId;
  actionStartedAtMs: number;
  allowed: boolean;
  nowMs: number;
  seed: number;
}

interface SpeechDefinition {
  keys: readonly string[];
  tone: HermesSpeechTone;
}

// One short sentence needs enough time to read and reach its dismiss target,
// while remaining visibly subordinate to the research workspace.
const HERMES_AUTONOMOUS_CUE_VISIBLE_MS = 4_000;

const speechByAction: Partial<Record<HermesActionId, SpeechDefinition>> = {
  'cap-check': { keys: ['performance.capCheck.one', 'performance.capCheck.two'], tone: 'focused' },
  'ear-perk': { keys: ['performance.earPerk.one', 'performance.earPerk.two'], tone: 'curious' },
  'lamp-listen': { keys: ['performance.lampListen.one', 'performance.lampListen.two'], tone: 'reflective' },
  'happy-wiggle': { keys: ['performance.happyWiggle.one', 'performance.happyWiggle.two'], tone: 'friendly' },
  'thinking-pause': { keys: ['performance.thinkingPause.one', 'performance.thinkingPause.two'], tone: 'reflective' },
  'evidence-check': { keys: ['performance.evidenceCheck.one', 'performance.evidenceCheck.two'], tone: 'focused' },
  'observe-left': { keys: ['performance.observe.one', 'performance.observe.two'], tone: 'curious' },
  'observe-right': { keys: ['performance.observe.two', 'performance.observe.one'], tone: 'curious' },
  'possible-issue': { keys: ['performance.possibleIssue.one', 'performance.possibleIssue.two'], tone: 'focused' },
  read: { keys: ['performance.read.one', 'performance.read.two'], tone: 'focused' },
  success: { keys: ['performance.success.one', 'performance.success.two'], tone: 'friendly' },
};

function hash(seed: number, value: number, salt: number): number {
  let result = (seed | 0) ^ Math.imul(value | 0, 0x45d9f3b) ^ salt;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

function interval(seed: number, nowMs: number, sequence: number, minimum: number, maximum: number, salt: number): number {
  return minimum + hash(seed, Math.floor(nowMs / 100) + sequence, salt) % (maximum - minimum + 1);
}

export function createHermesSpeechState(nowMs: number, seed: number): HermesSpeechState {
  return {
    cue: null,
    nextAtMs: nowMs + interval(seed, nowMs, 0, 25_000, 45_000, 0x71),
    previousMessageKey: null,
    sequence: 0,
  };
}

export function stepHermesSpeech(previous: HermesSpeechState, input: HermesSpeechInput): HermesSpeechState {
  if (previous.cue && previous.cue.beatId !== `${input.action}:${input.actionStartedAtMs}`) {
    return { ...previous, cue: null };
  }
  if (previous.cue && input.nowMs < previous.cue.visibleUntilMs) return previous;
  if (!input.allowed) {
    return {
      ...previous,
      cue: null,
      nextAtMs: Math.max(previous.nextAtMs + 1, input.nowMs + interval(input.seed, input.nowMs, previous.sequence, 25_000, 45_000, 0x72)),
    };
  }
  if (input.nowMs < previous.nextAtMs) return previous.cue ? { ...previous, cue: null } : previous;

  const definition = speechByAction[input.action];
  const sequence = previous.sequence + 1;
  const nextAtMs = input.nowMs + interval(input.seed, input.nowMs, sequence, 25_000, 45_000, 0x73);
  if (!definition) return { ...previous, cue: null, nextAtMs, sequence };

  let index = hash(input.seed, input.actionStartedAtMs + sequence, 0x74) % definition.keys.length;
  if (definition.keys.length > 1 && definition.keys[index] === previous.previousMessageKey) {
    index = (index + 1) % definition.keys.length;
  }
  const messageKey = definition.keys[index];
  return {
    cue: {
      beatId: `${input.action}:${input.actionStartedAtMs}`,
      messageKey,
      tone: definition.tone,
      visibleUntilMs: input.nowMs + HERMES_AUTONOMOUS_CUE_VISIBLE_MS,
    },
    nextAtMs,
    previousMessageKey: messageKey,
    sequence,
  };
}

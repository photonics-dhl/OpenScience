import { describe, expect, it } from 'vitest';

import { createInitialHermesBehavior, type HermesBehaviorInput } from '@/lib/hermes/behavior-director';
import { stepHermesPerformance, type HermesPerformanceState } from '@/lib/hermes/performance-director';
import { createHermesSpeechState, stepHermesSpeech } from '@/lib/hermes/performance-beat';

const input = (overrides: Partial<HermesBehaviorInput> = {}): HermesBehaviorInput => ({
  activity: 'active',
  dragging: false,
  guide: 'idle',
  nowMs: 1_000,
  pointer: { present: false, speed: 0, x: 0, y: 0 },
  reducedMotion: false,
  seed: 37,
  state: 'idle',
  task: 'idle',
  writing: false,
  ...overrides,
});

const speaking = (action: 'cap-check' | 'read', startedAtMs: number): HermesPerformanceState => {
  const initialSpeech = { ...createHermesSpeechState(0, 37), nextAtMs: startedAtMs };
  const behavior = {
    ...createInitialHermesBehavior(input({ nowMs: 0 })),
    durationMs: 400,
    kind: 'micro' as const,
    primary: action,
    startedAtMs,
  };
  return {
    behavior,
    speech: stepHermesSpeech(initialSpeech, {
      action,
      actionStartedAtMs: startedAtMs,
      allowed: true,
      nowMs: startedAtMs,
      seed: 37,
    }),
  };
};

describe('Hermes atomic performance director', () => {
  it('generates speech from the behavior selected by the same task-state tick', () => {
    const previous: HermesPerformanceState = {
      behavior: createInitialHermesBehavior(input({ nowMs: 0 })),
      speech: { ...createHermesSpeechState(0, 37), nextAtMs: 1_000 },
    };

    const next = stepHermesPerformance(previous, {
      behaviorInput: input({ nowMs: 1_000, state: 'scanning', task: 'working' }),
      speechAllowed: true,
    });

    expect(next.behavior.primary).toBe('read');
    expect(next.speech.cue?.beatId).toBe(`read:${next.behavior.startedAtMs}`);
  });

  it.each([
    ['hover', input({ nowMs: 1_250, pointer: { present: true, speed: .2, x: .2, y: -.1 } }), 'pointer-approach'],
    ['press', input({ dragging: true, nowMs: 1_250 }), 'drag'],
    ['guide', input({ guide: 'travel', nowMs: 1_250 }), 'guide-travel'],
    ['task', input({ nowMs: 1_250, state: 'scanning', task: 'working' }), 'read'],
  ] as const)('clears an obsolete cue in the same %s transition commit', (_label, behaviorInput, expectedAction) => {
    const next = stepHermesPerformance(speaking('cap-check', 1_000), { behaviorInput, speechAllowed: true });

    expect(next.behavior.primary).toBe(expectedAction);
    expect(next.speech.cue).toBeNull();
  });

  it('holds an ordinary autonomous beat through the cue window, then releases it atomically', () => {
    const startedAtMs = 1_000;
    const cueAtMs = 1_399;
    const initialSpeech = { ...createHermesSpeechState(0, 37), nextAtMs: cueAtMs };
    const previous: HermesPerformanceState = {
      behavior: {
        ...createInitialHermesBehavior(input({ nowMs: 0 })),
        durationMs: 400,
        kind: 'micro',
        nextMicroAtMs: 1_400,
        nextSignatureAtMs: 20_000,
        primary: 'cap-check',
        startedAtMs,
      },
      speech: stepHermesSpeech(initialSpeech, {
        action: 'cap-check', actionStartedAtMs: startedAtMs, allowed: true, nowMs: cueAtMs, seed: 37,
      }),
    };
    const lastReadableMs = previous.speech.cue!.visibleUntilMs - 1;
    const held = stepHermesPerformance(previous, {
      behaviorInput: input({ nowMs: lastReadableMs }),
      speechAllowed: true,
    });

    expect(held.behavior).toBe(previous.behavior);
    expect(held.speech.cue).toBe(previous.speech.cue);
    expect(held.speech.cue?.beatId).toBe(`${held.behavior.primary}:${held.behavior.startedAtMs}`);

    const released = stepHermesPerformance(held, {
      behaviorInput: input({ nowMs: previous.speech.cue!.visibleUntilMs }),
      speechAllowed: true,
    });
    expect(released.behavior.startedAtMs).toBe(previous.speech.cue!.visibleUntilMs);
    expect(released.speech.cue).toBeNull();
  });
});

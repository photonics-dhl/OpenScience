import { describe, expect, it } from 'vitest';

import {
  createHermesSpeechState,
  stepHermesSpeech,
} from '@/lib/hermes/performance-beat';

describe('Hermes performance speech policy', () => {
  it('schedules occasional speech independently from the lively silent-motion cadence', () => {
    const start = 12_000;
    const state = createHermesSpeechState(start, 37);

    expect(state.nextAtMs - start).toBeGreaterThanOrEqual(25_000);
    expect(state.nextAtMs - start).toBeLessThanOrEqual(45_000);
    expect(state.cue).toBeNull();
  });

  it('binds a one-line cue to the current action beat for exactly four seconds', () => {
    const initial = createHermesSpeechState(0, 17);
    const shown = stepHermesSpeech(initial, {
      action: 'cap-check',
      actionStartedAtMs: initial.nextAtMs,
      allowed: true,
      nowMs: initial.nextAtMs,
      seed: 17,
    });

    expect(shown.cue?.beatId).toBe(`cap-check:${initial.nextAtMs}`);
    expect(shown.cue?.messageKey).toMatch(/^performance\.capCheck\./u);
    expect((shown.cue?.visibleUntilMs ?? 0) - initial.nextAtMs).toBe(4_000);
    expect(shown.nextAtMs - initial.nextAtMs).toBeGreaterThanOrEqual(25_000);
    expect(shown.nextAtMs - initial.nextAtMs).toBeLessThanOrEqual(45_000);

    const lastReadableFrame = stepHermesSpeech(shown, {
      action: 'cap-check', actionStartedAtMs: initial.nextAtMs, allowed: true,
      nowMs: initial.nextAtMs + 3_999, seed: 17,
    });
    const expired = stepHermesSpeech(lastReadableFrame, {
      action: 'cap-check', actionStartedAtMs: initial.nextAtMs, allowed: true,
      nowMs: initial.nextAtMs + 4_000, seed: 17,
    });
    expect(lastReadableFrame.cue).toBe(shown.cue);
    expect(expired.cue).toBeNull();
  });

  it('clears a cue when the rendered action changes instead of leaving mismatched language', () => {
    const initial = createHermesSpeechState(0, 23);
    const shown = stepHermesSpeech(initial, {
      action: 'cap-check', actionStartedAtMs: initial.nextAtMs, allowed: true,
      nowMs: initial.nextAtMs, seed: 23,
    });
    const changed = stepHermesSpeech(shown, {
      action: 'ear-perk', actionStartedAtMs: initial.nextAtMs + 250, allowed: true,
      nowMs: initial.nextAtMs + 250, seed: 23,
    });

    expect(shown.cue).not.toBeNull();
    expect(changed.cue).toBeNull();
  });

  it('suppresses speech for guarded product states', () => {
    const initial = createHermesSpeechState(0, 29);
    const suppressed = stepHermesSpeech(initial, {
      action: 'happy-wiggle', actionStartedAtMs: initial.nextAtMs, allowed: false,
      nowMs: initial.nextAtMs, seed: 29,
    });

    expect(suppressed.cue).toBeNull();
    expect(suppressed.nextAtMs).toBeGreaterThan(initial.nextAtMs);
  });

  it('does not repeat the immediately previous phrase for the same action', () => {
    const initial = createHermesSpeechState(0, 31);
    const first = stepHermesSpeech(initial, {
      action: 'lamp-listen', actionStartedAtMs: initial.nextAtMs, allowed: true,
      nowMs: initial.nextAtMs, seed: 31,
    });
    const second = stepHermesSpeech({ ...first, cue: null }, {
      action: 'lamp-listen', actionStartedAtMs: first.nextAtMs, allowed: true,
      nowMs: first.nextAtMs, seed: 31,
    });

    expect(first.cue?.messageKey).toBeTruthy();
    expect(second.cue?.messageKey).toBeTruthy();
    expect(second.cue?.messageKey).not.toBe(first.cue?.messageKey);
  });
});

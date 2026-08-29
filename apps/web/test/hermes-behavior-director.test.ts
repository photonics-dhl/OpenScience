import { describe, expect, it } from 'vitest';

import { HERMES_ACTION_CATALOG, HERMES_MICRO_ACTIONS } from '@/lib/hermes/action-catalog';
import {
  createInitialHermesBehavior,
  stepHermesBehavior,
  type HermesBehaviorInput,
} from '@/lib/hermes/behavior-director';

const input = (overrides: Partial<HermesBehaviorInput> = {}): HermesBehaviorInput => ({
  activity: 'active',
  dragging: false,
  guide: 'idle',
  nowMs: 10_000,
  pointer: { present: false, speed: 0, x: 0, y: 0 },
  reducedMotion: false,
  seed: 37,
  state: 'idle',
  task: 'idle',
  writing: false,
  ...overrides,
});

describe('Hermes behavior director', () => {
  it('ships a broad action vocabulary with the approved scholar-spirit balance', () => {
    const actions = Object.values(HERMES_ACTION_CATALOG);
    const familiarCount = HERMES_MICRO_ACTIONS
      .filter((id) => HERMES_ACTION_CATALOG[id].personality === 'spirit-pet').length;

    expect(actions).toHaveLength(32);
    expect(HERMES_MICRO_ACTIONS).toHaveLength(15);
    expect(familiarCount / HERMES_MICRO_ACTIONS.length).toBeGreaterThanOrEqual(.5);
    expect(familiarCount / HERMES_MICRO_ACTIONS.length).toBeLessThanOrEqual(.6);
    expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length);
  });

  it('enforces approval, drag, guide, task, writing, and pointer priority in that order', () => {
    const previous = createInitialHermesBehavior(input({ nowMs: 0 }));
    const select = (overrides: Partial<HermesBehaviorInput>) => stepHermesBehavior(previous, input({
      dragging: true,
      guide: 'travel',
      pointer: { present: true, speed: 1.2, x: .8, y: -.4 },
      state: 'scanning',
      task: 'working',
      writing: true,
      ...overrides,
    })).primary;

    expect(select({ state: 'awaiting_approval' })).toBe('approval-still');
    expect(select({ dragging: true })).toBe('drag');
    expect(select({ dragging: false })).toBe('guide-travel');
    expect(select({ dragging: false, guide: 'idle' })).toBe('read');
    expect(select({ dragging: false, guide: 'idle', state: 'idle', task: 'idle' })).toBe('quiet-write');
    expect(select({ dragging: false, guide: 'idle', state: 'idle', task: 'idle', writing: false })).toBe('pointer-avoid');
  });

  it('settles truthfully on failure instead of continuing the idle grammar', () => {
    const current = createInitialHermesBehavior(input({ nowMs: 0 }));
    const failed = stepHermesBehavior(current, input({ state: 'failed', task: 'failed' }));

    expect(failed.primary).toBe('failed-settle');
    expect(failed.expression).toBe('failed');
    expect(failed.interruptible).toBe(false);
  });

  it('suppresses autonomous and pointer actions while the scholar is writing', () => {
    const current = createInitialHermesBehavior(input({ nowMs: 0 }));
    const writing = stepHermesBehavior(current, input({
      pointer: { present: true, speed: 2, x: 1, y: 1 },
      writing: true,
    }));

    expect(writing.primary).toBe('quiet-write');
    expect(writing.effect).toBe('none');
    expect(writing.expression).toBe('focused');
  });

  it('uses deterministic seeded choices without repeating the immediately previous action', () => {
    const initialInput = input({ nowMs: 0, seed: 91 });
    const first = createInitialHermesBehavior(initialInput);
    const dueInput = input({ nowMs: first.nextMicroAtMs, seed: 91 });
    const nextA = stepHermesBehavior(first, dueInput);
    const nextB = stepHermesBehavior(first, dueInput);

    expect(nextA).toEqual(nextB);
    expect(nextA.primary).not.toBe(first.primary);
  });

  it('visits the complete micro-action deck before starting another seeded cycle', () => {
    let current = createInitialHermesBehavior(input({ nowMs: 0, seed: 91 }));
    const actions = [current.primary];
    for (let index = 1; index < 15; index += 1) {
      current = stepHermesBehavior({ ...current, nextSignatureAtMs: 1_000_000 }, input({ nowMs: current.nextMicroAtMs, seed: 91 }));
      actions.push(current.primary);
    }

    expect(new Set(actions).size).toBe(15);
  });

  it('keeps a ninety-second idle session varied without immediate repeats', () => {
    let current = createInitialHermesBehavior(input({ nowMs: 0, seed: 37 }));
    const observed = [current.primary];
    for (let nowMs = 250; nowMs <= 90_000; nowMs += 250) {
      const next = stepHermesBehavior(current, input({ nowMs, seed: 37 }));
      if (next.primary !== current.primary) observed.push(next.primary);
      current = next;
    }

    expect(new Set(observed).size).toBeGreaterThanOrEqual(12);
    expect(observed.every((action, index) => index === 0 || action !== observed[index - 1])).toBe(true);
  });

  it('keeps the lively companion visibly active without turning speech into constant chatter', () => {
    const start = 12_345;
    const first = createInitialHermesBehavior(input({ nowMs: start, seed: 13 }));

    expect(first.nextMicroAtMs - start).toBeGreaterThanOrEqual(3_000);
    expect(first.nextMicroAtMs - start).toBeLessThanOrEqual(6_000);
    expect(first.nextSignatureAtMs - start).toBeGreaterThanOrEqual(12_000);
    expect(first.nextSignatureAtMs - start).toBeLessThanOrEqual(20_000);

    const signature = stepHermesBehavior(first, input({ nowMs: first.nextSignatureAtMs, seed: 13 }));
    expect(signature.kind).toBe('signature');
    expect(HERMES_ACTION_CATALOG[signature.primary].signature).toBe(true);
    expect(signature.nextSignatureAtMs - signature.startedAtMs).toBeGreaterThanOrEqual(12_000);
    expect(signature.nextSignatureAtMs - signature.startedAtMs).toBeLessThanOrEqual(20_000);
  });

  it('lets an autonomous signature finish before scheduling the next idle action', () => {
    const initial = createInitialHermesBehavior(input({ nowMs: 0, seed: 13 }));
    const patrol = {
      ...initial,
      durationMs: HERMES_ACTION_CATALOG.patrol.durationMs,
      kind: 'signature' as const,
      nextMicroAtMs: 2_400,
      nextSignatureAtMs: 20_000,
      primary: 'patrol' as const,
      startedAtMs: 0,
    };

    expect(patrol.durationMs).toBeLessThanOrEqual(4_500);
    expect(stepHermesBehavior(patrol, input({ nowMs: patrol.durationMs - 1 })).primary).toBe('patrol');
    expect(stepHermesBehavior(patrol, input({ nowMs: patrol.durationMs })).primary).not.toBe('patrol');
  });

  it('retains semantic actions but switches their motion and effects off for reduced motion', () => {
    const current = createInitialHermesBehavior(input({ nowMs: 0 }));
    const reducedGuide = stepHermesBehavior(current, input({ guide: 'travel', reducedMotion: true }));

    expect(reducedGuide.primary).toBe('guide-travel');
    expect(reducedGuide.motion).toBe('static');
    expect(reducedGuide.effect).toBe('none');
  });
});

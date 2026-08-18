import { describe, expect, it } from 'vitest';

import { sampleHermesMotion } from '@/lib/hermes/pet-motion';

const actionAt = (action: Parameters<typeof sampleHermesMotion>[0]['action'], progress = .5) => sampleHermesMotion({
  action,
  actionElapsedMs: progress * ({
    'citation-trace': 2_100,
    doze: 1_800,
    patrol: 4_200,
    'return-dock': 2_800,
    stretch: 1_450,
    'surprise-settle': 850,
    wake: 900,
  }[action as string] ?? 1_500),
  elapsedMs: 9_000,
  engaged: false,
  pointer: { x: 0, y: 0 },
  reducedMotion: false,
  state: 'idle',
});

describe('Hermes articulated pet motion', () => {
  it('starts Hermes in full motion until the user explicitly reduces it', async () => {
    const preference = await import('@/lib/hermes/motion-preference').catch(() => null);

    expect(preference).not.toBeNull();
    if (!preference) return;

    expect(preference.resolveHermesReducedMotion('?hermes-motion=full')).toBe(false);
    expect(preference.resolveHermesReducedMotion('?hermes-motion=reduced')).toBe(true);
    expect(preference.resolveHermesReducedMotion('')).toBe(false);

    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(preference.saveHermesMotionPreference).toBeTypeOf('function');
    expect(preference.loadHermesMotionPreference).toBeTypeOf('function');
    preference.saveHermesMotionPreference(storage, 'full');
    expect(preference.loadHermesMotionPreference(storage)).toBe('full');
    expect(preference.resolveHermesReducedMotion('', preference.loadHermesMotionPreference(storage))).toBe(false);
    preference.saveHermesMotionPreference(storage, 'reduced');
    expect(preference.resolveHermesReducedMotion('', preference.loadHermesMotionPreference(storage))).toBe(true);
  });

  it('renders a director-selected action instead of falling back to the legacy clock grammar', () => {
    const sample = sampleHermesMotion({
      action: 'page-tidy',
      actionElapsedMs: 260,
      elapsedMs: 950,
      engaged: false,
      pointer: { x: 0, y: 0 },
      reducedMotion: false,
      state: 'idle',
    });

    expect(sample.gesture).toBe('page-flick');
    expect(Math.abs(sample.crownAngle)).toBeGreaterThan(4);
  });

  it('gives left and right observation opposite readable poses at the shipped display scale', () => {
    const left = actionAt('observe-left');
    const right = actionAt('observe-right');

    expect(left.head.x).toBeLessThanOrEqual(-6);
    expect(left.gaze.x).toBeLessThanOrEqual(-.45);
    expect(right.head.x).toBeGreaterThanOrEqual(6);
    expect(right.gaze.x).toBeGreaterThanOrEqual(.45);
    expect(Math.abs(right.head.x - left.head.x)).toBeGreaterThanOrEqual(12);
  });

  it('renders stretch, doze, wake, and surprise as four distinct silhouettes and expressions', () => {
    const stretch = actionAt('stretch');
    const doze = actionAt('doze');
    const wake = actionAt('wake', .42);
    const surprise = actionAt('surprise-settle', .38);

    expect(stretch.torso.scale).toBeGreaterThanOrEqual(1.04);
    expect(stretch.head.y).toBeLessThanOrEqual(-4);
    expect(doze.blink).toBeGreaterThanOrEqual(.9);
    expect(doze.head.y).toBeGreaterThanOrEqual(3);
    expect(wake.head.y).toBeLessThanOrEqual(-4);
    expect(wake.crownAngle).toBeGreaterThanOrEqual(7);
    expect(surprise.torso.scale).toBeLessThanOrEqual(.97);
    expect(Math.abs(surprise.tail.angle)).toBeGreaterThanOrEqual(8);
  });

  it('renders each signature action as a different whole-character performance', () => {
    const citation = actionAt('citation-trace', .38);
    const patrol = actionAt('patrol', .32);
    const returning = actionAt('return-dock', .45);

    expect(Math.abs(citation.tail.angle)).toBeGreaterThanOrEqual(10);
    expect(Math.abs(citation.torso.x)).toBeLessThan(1);
    expect(Math.abs(patrol.torso.x)).toBeGreaterThanOrEqual(2.5);
    expect(Math.abs(patrol.head.x)).toBeGreaterThanOrEqual(7);
    expect(returning.head.y).toBeLessThanOrEqual(-4);
    expect(returning.torso.y).toBeLessThanOrEqual(-2);
  });

  it('makes a fast pointer avoidance visibly recoil instead of reusing pointer approach', () => {
    const input = {
      actionElapsedMs: 360,
      elapsedMs: 9_000,
      engaged: true,
      pointer: { x: .8, y: -.4 },
      reducedMotion: false,
      state: 'idle',
    } as const;
    const approach = sampleHermesMotion({ ...input, action: 'pointer-approach' });
    const avoid = sampleHermesMotion({ ...input, action: 'pointer-avoid' });

    expect(approach.head.x).toBeGreaterThanOrEqual(8);
    expect(avoid.head.x).toBeLessThanOrEqual(-4);
    expect(avoid.torso.x).toBeLessThan(0);
    expect(avoid.tail.angle).toBeGreaterThan(approach.tail.angle);
  });

  it('holds a named performance long enough to be read at product size', () => {
    const early = actionAt('stretch', .28);
    const held = actionAt('stretch', .58);

    expect(early.torso.scale).toBeGreaterThanOrEqual(1.04);
    expect(held.torso.scale).toBeGreaterThanOrEqual(1.04);
    expect(early.head.y).toBeLessThanOrEqual(-4.5);
    expect(held.head.y).toBeLessThanOrEqual(-4.5);
  });

  it('makes a stationary hover an obvious whole-character response', () => {
    const hover = sampleHermesMotion({
      action: 'pointer-approach',
      actionElapsedMs: 360,
      elapsedMs: 9_000,
      engaged: true,
      pointer: { x: .28, y: -.18 },
      reducedMotion: false,
      state: 'idle',
    });

    expect(hover.head.x).toBeGreaterThanOrEqual(7);
    expect(hover.head.y).toBeLessThanOrEqual(-3.5);
    expect(hover.tail.angle).toBeLessThanOrEqual(-5);
    expect(hover.torso.x).toBeGreaterThanOrEqual(2);
  });

  it('starts a readable character gesture within 1.8 seconds and exposes distinct idle actions', () => {
    const samples = [1_700, 3_500, 5_750, 7_850].map((elapsedMs) => sampleHermesMotion({
      elapsedMs,
      engaged: false,
      pointer: { x: 0, y: 0 },
      reducedMotion: false,
      state: 'idle',
    }));

    expect(samples[0].gesture).toBe('observe');
    expect(new Set(samples.map((sample) => sample.gesture)).size).toBeGreaterThanOrEqual(3);
    expect(Math.abs(samples[0].head.x)).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(samples[0].head.angle)).toBeGreaterThanOrEqual(5);
    expect(Math.abs(samples[1].crownAngle)).toBeGreaterThanOrEqual(7);
    expect(Math.abs(samples[2].tail.angle)).toBeGreaterThanOrEqual(10);
    expect(Math.abs(samples[3].head.y)).toBeGreaterThanOrEqual(3.5);
  });

  it('moves real joints differently instead of describing one whole-image transform', () => {
    const sample = sampleHermesMotion({
      elapsedMs: 1_650,
      engaged: false,
      pointer: { x: 0, y: 0 },
      reducedMotion: false,
      state: 'idle',
    });

    expect(sample.head).not.toEqual(sample.torso);
    expect(sample.tail.angle).not.toBe(sample.head.angle);
    expect(sample.crownAngle).not.toBe(sample.torso.angle);
  });

  it('gives pointer gaze and head lead more amplitude than torso follow and counter-rotates the tail', () => {
    const sample = sampleHermesMotion({
      elapsedMs: 2_100,
      engaged: true,
      pointer: { x: .8, y: -.6 },
      reducedMotion: false,
      state: 'idle',
    });

    expect(sample.gaze.x).toBeGreaterThan(.4);
    expect(sample.head.x).toBeGreaterThan(sample.torso.x);
    expect(sample.head.y).toBeLessThan(sample.torso.y);
    expect(sample.head.x).toBeGreaterThanOrEqual(10);
    expect(sample.tail.angle).toBeLessThanOrEqual(-5);
    expect(sample.torso.x).toBeGreaterThanOrEqual(1.5);
  });

  it('keeps an unmistakable but calm breathing motion between named gestures', () => {
    const inhale = sampleHermesMotion({ elapsedMs: 950, engaged: false, pointer: { x: 0, y: 0 }, reducedMotion: false, state: 'idle' });
    const exhale = sampleHermesMotion({ elapsedMs: 2_850, engaged: false, pointer: { x: 0, y: 0 }, reducedMotion: false, state: 'idle' });

    expect(inhale.torso.scale - 1).toBeGreaterThanOrEqual(.032);
    expect(1 - exhale.torso.scale).toBeGreaterThanOrEqual(.032);
    expect(exhale.torso.y - inhale.torso.y).toBeGreaterThanOrEqual(2.8);
    expect(Math.abs(exhale.tail.angle - inhale.tail.angle)).toBeGreaterThanOrEqual(5);
    expect(Math.abs(exhale.head.y - inhale.head.y)).toBeGreaterThanOrEqual(2.5);
  });

  it('uses independent idle rhythms instead of moving every joint as one breathing picture', () => {
    const samples = [0, 700, 1_400, 2_100].map((elapsedMs) => sampleHermesMotion({
      elapsedMs,
      engaged: false,
      pointer: { x: 0, y: 0 },
      reducedMotion: false,
      state: 'idle',
    }));

    expect(new Set(samples.map((sample) => Math.sign(sample.head.y))).size).toBeGreaterThan(1);
    expect(new Set(samples.map((sample) => Math.sign(sample.tail.angle))).size).toBeGreaterThan(1);
    expect(samples.some((sample) => Math.sign(sample.head.y) !== Math.sign(sample.tail.angle))).toBe(true);
    expect(Math.max(...samples.map((sample) => sample.crownAngle)) - Math.min(...samples.map((sample) => sample.crownAngle))).toBeGreaterThanOrEqual(5);
  });

  it('varies gesture ordering and rest lengths across a long deterministic idle grammar', () => {
    const gestureAt = (elapsedMs: number) => sampleHermesMotion({ elapsedMs, engaged: false, pointer: { x: 0, y: 0 }, reducedMotion: false, state: 'idle' }).gesture;
    expect([gestureAt(1_700), gestureAt(11_700), gestureAt(23_300), gestureAt(32_700)]).not.toEqual([
      gestureAt(11_700), gestureAt(21_700), gestureAt(31_700), gestureAt(41_700),
    ]);
    expect(gestureAt(11_700)).not.toBe(gestureAt(1_700));
  });

  it('keeps approval and reduced motion fully still while scanning remains a focused working pose', () => {
    const input = { elapsedMs: 2_000, engaged: true, pointer: { x: 1, y: 1 }, reducedMotion: false } as const;
    const approval = sampleHermesMotion({ ...input, state: 'awaiting_approval' });
    const reduced = sampleHermesMotion({ ...input, reducedMotion: true, state: 'idle' });
    const scanning = sampleHermesMotion({ ...input, engaged: false, state: 'scanning' });

    for (const still of [approval, reduced]) {
      expect(still.still).toBe(true);
      expect(still.head).toEqual({ angle: 0, x: 0, y: 0 });
      expect(still.torso).toEqual({ angle: 0, scale: 1, x: 0, y: 0 });
      expect(still.tail.angle).toBe(0);
      expect(still.gesture).toBe('still');
    }
    expect(scanning.still).toBe(false);
    expect(scanning.working).toBe(true);
    expect(scanning.gesture).toBe('focus');
  });

  it('settles failed state into one restrained static pose without idle grammar', () => {
    const failedAtObserve = sampleHermesMotion({
      elapsedMs: 1_700, engaged: false, pointer: { x: 0, y: 0 }, reducedMotion: false, state: 'failed',
    });
    const failedAtSwish = sampleHermesMotion({
      elapsedMs: 5_750, engaged: false, pointer: { x: 0, y: 0 }, reducedMotion: false, state: 'failed',
    });

    expect(failedAtObserve).toEqual(failedAtSwish);
    expect(failedAtObserve).toMatchObject({ gesture: 'failed-settle', still: true, working: false });
    expect(failedAtObserve.head.y).toBeGreaterThan(0);
  });
});

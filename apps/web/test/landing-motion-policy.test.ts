import { describe, expect, it } from 'vitest';

import { allowAutomaticEvolution, allowHeroLoop } from '../lib/landing-motion';

describe('landing motion policy', () => {
  it('keeps the evolution stage static when reduced motion is requested', () => {
    expect(allowAutomaticEvolution(true)).toBe(false);
    expect(allowAutomaticEvolution(false)).toBe(true);
  });

  it('mounts the loop video only for desktop users who allow motion', () => {
    expect(allowHeroLoop({ width: 390, reducedMotion: false })).toBe(false);
    expect(allowHeroLoop({ width: 1440, reducedMotion: true })).toBe(false);
    expect(allowHeroLoop({ width: 1440, reducedMotion: false })).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('keeps the ordinary movable work assistant peripheral', () => {
    expect(resolveHermesStageSize(false)).toBe(176);
    expect(resolveHermesStageSize(false, true)).toBe(120);
  });

  it('reserves 336px for an explicit expanded fixture', () => {
    expect(resolveHermesStageSize(true)).toBe(336);
  });
});

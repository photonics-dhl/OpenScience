import { describe, expect, it } from 'vitest';

import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('keeps the movable work assistant visually present', () => {
    expect(resolveHermesStageSize(false)).toBe(336);
    expect(resolveHermesStageSize(false, true)).toBe(176);
  });

  it('reserves 336px for an explicit expanded fixture', () => {
    expect(resolveHermesStageSize(true)).toBe(336);
  });
});

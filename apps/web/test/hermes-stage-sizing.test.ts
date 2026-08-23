import { describe, expect, it } from 'vitest';

import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('scales the ECS companion endpoints by exactly 1.25', () => {
    expect(resolveHermesStageSize(false)).toBe(360);
    expect(resolveHermesStageSize(false, true)).toBe(200);
    expect(resolveHermesStageSize(true)).toBe(360);
  });
});

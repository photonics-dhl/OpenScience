import { describe, expect, it } from 'vitest';

import { resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('uses the enlarged desktop footprint outside compact field guidance', () => {
    expect(resolveHermesStageSize(false, false)).toBe(336);
    expect(resolveHermesStageSize(false, true)).toBe(336);
    expect(resolveHermesStageSize(true, false)).toBe(336);
  });

  it('uses a bounded 176px footprint for compact mobile field guidance', () => {
    expect(resolveHermesStageSize(true, true)).toBe(176);
  });
});

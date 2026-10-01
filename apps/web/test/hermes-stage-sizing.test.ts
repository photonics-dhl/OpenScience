import { describe, expect, it } from 'vitest';

import { resolveHermesFloatingSize, resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('scales the ECS companion endpoints by exactly 1.25', () => {
    expect(resolveHermesStageSize(false)).toBe(360);
    expect(resolveHermesStageSize(false, true)).toBe(200);
    expect(resolveHermesStageSize(true)).toBe(360);
  });

  it.each([[0, 200], [390, 168], [640, 168], [641, 200], [1440, 200]])('fits the floating companion to a %ipx viewport', (width, size) => {
    expect(resolveHermesFloatingSize(width)).toBe(size);
  });
});

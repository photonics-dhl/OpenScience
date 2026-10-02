import { describe, expect, it } from 'vitest';

import { resolveHermesFloatingSize, resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('scales the ECS companion endpoints by exactly 1.25', () => {
    expect(resolveHermesStageSize(false)).toBe(360);
    expect(resolveHermesStageSize(false, true)).toBe(200);
    expect(resolveHermesStageSize(true)).toBe(360);
  });

  it.each([[0, 360], [320, 296], [375, 351], [390, 360], [640, 360], [641, 360], [1440, 360]])('fits the floating companion to a %ipx viewport', (width, size) => {
    expect(resolveHermesFloatingSize(width)).toBe(size);
  });

  it('keeps the companion inside a short visual viewport when the keyboard opens', () => {
    expect(resolveHermesFloatingSize(390, 300)).toBe(276);
    expect(resolveHermesFloatingSize(1440, 900)).toBe(360);
  });
});

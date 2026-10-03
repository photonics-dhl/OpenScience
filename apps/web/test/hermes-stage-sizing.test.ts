import { describe, expect, it } from 'vitest';

import { resolveHermesFloatingSize, resolveHermesStageSize } from '@/lib/hermes/stage-sizing';

describe('Hermes stage sizing', () => {
  it('scales the ECS companion endpoints by exactly 1.25', () => {
    expect(resolveHermesStageSize(false)).toBe(360);
    expect(resolveHermesStageSize(false, true)).toBe(200);
    expect(resolveHermesStageSize(true)).toBe(360);
  });

  it.each([[0, 360], [320, 120], [375, 120], [390, 120], [640, 120], [641, 120], [1100, 120], [1101, 360], [1440, 360]])('leaves reading space at a %ipx viewport', (width, size) => {
    expect(resolveHermesFloatingSize(width)).toBe(size);
  });

  it('keeps the companion inside a short visual viewport when the keyboard opens', () => {
    expect(resolveHermesFloatingSize(390, 300)).toBe(120);
    expect(resolveHermesFloatingSize(1440, 900)).toBe(360);
  });

  it('expands the complete character on demand without crossing a narrow or short viewport', () => {
    expect(resolveHermesFloatingSize(390, 844, true)).toBe(360);
    expect(resolveHermesFloatingSize(320, 300, true)).toBe(276);
  });
});

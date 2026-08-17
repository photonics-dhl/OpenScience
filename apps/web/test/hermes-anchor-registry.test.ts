import { describe, expect, it } from 'vitest';

import { createHermesAnchorRegistry } from '@/lib/hermes/anchor-registry';

const elementAt = (x: number, y: number) => ({
  getBoundingClientRect: () => ({ bottom: y + 40, height: 40, left: x, right: x + 200, top: y, width: 200, x, y }),
}) as HTMLElement;

describe('Hermes semantic anchor registry', () => {
  it('publishes geometry and allowed help actions without exposing field contents', () => {
    const registry = createHermesAnchorRegistry();
    registry.register({
      actions: ['explain', 'draft', 'check'],
      clearancePx: 16,
      element: () => elementAt(120, 240),
      id: 'research-question',
      sides: ['right', 'top'],
    });

    expect(registry.snapshot('research-question')).toEqual({
      actions: ['explain', 'draft', 'check'],
      clearancePx: 16,
      id: 'research-question',
      rect: { bottom: 280, height: 40, left: 120, right: 320, top: 240, width: 200, x: 120, y: 240 },
      sides: ['right', 'top'],
    });
  });

  it('does not let stale cleanup remove a newer registration for the same anchor', () => {
    const registry = createHermesAnchorRegistry();
    const releaseOld = registry.register({ actions: ['explain'], clearancePx: 12, element: () => elementAt(10, 10), id: 'commit', sides: ['left'] });
    const releaseNew = registry.register({ actions: ['check'], clearancePx: 20, element: () => elementAt(500, 300), id: 'commit', sides: ['top'] });

    releaseOld();
    expect(registry.snapshot('commit')?.rect.x).toBe(500);
    releaseNew();
    expect(registry.snapshot('commit')).toBeNull();
  });
});

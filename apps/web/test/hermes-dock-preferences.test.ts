import { describe, expect, it } from 'vitest';

import {
  loadHermesDockPreferences,
  hasStoredHermesDockPreferences,
  resetHermesDockPreferences,
  resolveHermesDock,
  saveHermesDockPreferences,
} from '@/lib/hermes/dock-preferences';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('Hermes dock preferences', () => {
  it('persists activity and a deliberate dock independently per workspace and viewport class', () => {
    const storage = new MemoryStorage();
    const saved = {
      activity: 'active' as const,
      particles: false,
      proactiveHints: true,
      sound: false,
      xRatio: .42,
      yRatio: .56,
    };
    expect(hasStoredHermesDockPreferences(storage, 'workspace-a', 'desktop')).toBe(false);
    saveHermesDockPreferences(storage, 'workspace-a', 'desktop', saved);

    expect(hasStoredHermesDockPreferences(storage, 'workspace-a', 'desktop')).toBe(true);
    expect(loadHermesDockPreferences(storage, 'workspace-a', 'desktop')).toEqual(saved);
    expect(loadHermesDockPreferences(storage, 'workspace-b', 'desktop')).not.toEqual(saved);
    expect(loadHermesDockPreferences(storage, 'workspace-a', 'mobile')).not.toEqual(saved);
  });

  it('keeps a user-selected overlapping position and only clamps it when the viewport changes', () => {
    const preference = {
      activity: 'balanced' as const,
      particles: true,
      proactiveHints: true,
      sound: false,
      xRatio: .5,
      yRatio: .5,
    };

    expect(resolveHermesDock(preference, { height: 800, width: 1200 }, { height: 96, width: 96 }, false)).toEqual({ x: 600, y: 400 });
    expect(resolveHermesDock({ ...preference, xRatio: 1.2, yRatio: -.1 }, { height: 480, width: 640 }, { height: 96, width: 96 }, true)).toEqual({ x: 592, y: 48 });
  });

  it('falls back from malformed storage and supports an explicit reset', () => {
    const storage = new MemoryStorage();
    storage.setItem('openscience:hermes-dock:v1:workspace-a:desktop', '{bad json');

    expect(loadHermesDockPreferences(storage, 'workspace-a', 'desktop').activity).toBe('balanced');
    saveHermesDockPreferences(storage, 'workspace-a', 'desktop', loadHermesDockPreferences(storage, 'workspace-a', 'desktop'));
    resetHermesDockPreferences(storage, 'workspace-a', 'desktop');
    expect(hasStoredHermesDockPreferences(storage, 'workspace-a', 'desktop')).toBe(false);
    expect(storage.getItem('openscience:hermes-dock:v1:workspace-a:desktop')).toBeNull();
  });
});

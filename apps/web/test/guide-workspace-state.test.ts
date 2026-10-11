import { describe, expect, it } from 'vitest';
import { emptyCore } from '@/lib/editor-state';
import { guideDraftKey, isGuideResponseCurrent, loadGuideDraft, saveGuideDraft } from '@/lib/guide-workspace-state';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
}

describe('Guide workspace isolation', () => {
  it('does not restore another account’s draft or a draft for a superseded server version', () => {
    const storage = memoryStorage();
    const core = { ...emptyCore(), problem: 'Private problem statement' };
    expect(saveGuideDraft(storage, 'owner-1', 'ro-1', 4, core)).toBe(true);
    expect(loadGuideDraft(storage, 'owner-1', 'ro-1', 4)?.problem).toBe(core.problem);
    expect(loadGuideDraft(storage, 'owner-2', 'ro-1', 4)).toBeNull();
    expect(loadGuideDraft(storage, 'owner-1', 'ro-1', 5)).toBeNull();
    expect(loadGuideDraft(storage, 'owner-1', 'ro-2', 4)).toBeNull();
    expect(guideDraftKey('owner-1', 'ro-1', 4)).not.toBe(guideDraftKey('owner-2', 'ro-1', 4));
  });

  it('rejects stale account, selection, and request generation responses', () => {
    const active = { owner: 'owner-2', epoch: 9, target: 'ro-current' };
    expect(isGuideResponseCurrent(active, { ...active })).toBe(true);
    expect(isGuideResponseCurrent(active, { ...active, owner: 'owner-1' })).toBe(false);
    expect(isGuideResponseCurrent(active, { ...active, epoch: 8 })).toBe(false);
    expect(isGuideResponseCurrent(active, { ...active, target: 'ro-previous' })).toBe(false);
  });
});

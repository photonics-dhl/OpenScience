import type { SdfCore } from './api';

export function guideDraftKey(ownerId: string, researchObjectId: string, serverVersion: number) {
  return `guide:draft:${encodeURIComponent(ownerId)}:${encodeURIComponent(researchObjectId)}:${serverVersion}`;
}

export function loadGuideDraft(storage: Pick<Storage, 'getItem'>, ownerId: string, researchObjectId: string, serverVersion: number): SdfCore | null {
  try {
    const raw = storage.getItem(guideDraftKey(ownerId, researchObjectId, serverVersion));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'].some((field) => typeof candidate[field] !== 'string')) return null;
    return candidate as unknown as SdfCore;
  } catch { return null; }
}

export function saveGuideDraft(storage: Pick<Storage, 'setItem'>, ownerId: string, researchObjectId: string, serverVersion: number, core: SdfCore) {
  try { storage.setItem(guideDraftKey(ownerId, researchObjectId, serverVersion), JSON.stringify(core)); return true; }
  catch { return false; }
}

export function isGuideResponseCurrent(active: { owner: string; epoch: number; target: string }, response: { owner: string; epoch: number; target: string }) {
  return active.owner === response.owner && active.epoch === response.epoch && active.target === response.target;
}

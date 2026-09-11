const STORAGE_PREFIX = 'openscience:hermes-draft:';

export interface HermesDraftScope {
  userId: string;
  researchObjectId: string;
  versionId: string;
  purpose: 'guide-goal' | 'presentation';
}

export interface StoredPresentationDraft {
  action: 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
  instruction: string;
  style: 'watercolor' | 'technical' | 'ink';
  language: 'zh' | 'en';
  selected: string[];
  parentId: string;
  scene: number;
}

function key(scope: HermesDraftScope): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.researchObjectId)}:${encodeURIComponent(scope.versionId)}:${scope.purpose}:v1`;
}

export function getHermesDraftStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

export function loadHermesGuideGoal(storage: Storage | null, scope: HermesDraftScope): string | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key(scope));
    if (raw === null) return null;
    const value = JSON.parse(raw) as { version?: unknown; text?: unknown };
    return value.version === 1 && typeof value.text === 'string' && value.text.length <= 2_000 ? value.text : null;
  } catch { return null; }
}

export function saveHermesGuideGoal(storage: Storage | null, scope: HermesDraftScope, text: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key(scope), JSON.stringify({ version: 1, text: text.slice(0, 2_000) }));
    return true;
  } catch { return false; }
}

export function loadHermesPresentationDraft(storage: Storage | null, scope: HermesDraftScope): StoredPresentationDraft | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key(scope));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredPresentationDraft> & { version?: unknown };
    if (value.version !== 1 || !['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(String(value.action))
      || typeof value.instruction !== 'string' || value.instruction.length > 1_000
      || !['watercolor', 'technical', 'ink'].includes(String(value.style)) || (value.language !== 'zh' && value.language !== 'en')
      || !Array.isArray(value.selected) || value.selected.length > 12 || value.selected.some((id) => typeof id !== 'string' || id.length > 100)
      || typeof value.parentId !== 'string' || value.parentId.length > 100 || typeof value.scene !== 'number' || !Number.isInteger(value.scene) || value.scene < 0) return null;
    return value as StoredPresentationDraft;
  } catch { return null; }
}

export function saveHermesPresentationDraft(storage: Storage | null, scope: HermesDraftScope, draft: StoredPresentationDraft): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key(scope), JSON.stringify({ version: 1, ...draft }));
    return true;
  } catch { return false; }
}

export function clearAllHermesDrafts(storage: Storage | null): void {
  try {
    if (!storage) return;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const candidate = storage.key(index);
      if (candidate?.startsWith(STORAGE_PREFIX)) storage.removeItem(candidate);
    }
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
}

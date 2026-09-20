import type { StoryboardRequest } from '@/lib/api';

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
  /** Free-form style id; resolved against the installed catalogue server-side. */
  style: string;
  language: 'zh' | 'en';
  selected: string[];
  parentId: string;
  revisionMode?: 'art';
  scene: number;
  figurePlan?: StoryboardRequest['figurePlan'];
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

export function isFigurePlanValid(plan: unknown): plan is StoryboardRequest['figurePlan'] {
  if (plan === undefined) return true;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)
    || Object.keys(plan).some(key => key !== 'figures')) return false;
  const figures = (plan as { figures?: unknown }).figures;
  if (!Array.isArray(figures) || figures.length < 1 || figures.length > 12) return false;
  const decisions = new Set(['reuse', 're-render', 'abstract', 'skip']);
  for (const raw of figures) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || Object.keys(raw).some(key => !['id', 'decision', 'styleId', 'caption'].includes(key))) return false;
    if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 200) return false;
    if (typeof raw.decision !== 'string' || !decisions.has(raw.decision)) return false;
    if (raw.styleId !== undefined && (typeof raw.styleId !== 'string' || !raw.styleId.trim() || raw.styleId.length > 100)) return false;
    if (raw.caption !== undefined && (typeof raw.caption !== 'string' || raw.caption.length > 200)) return false;
  }
  return true;
}

export function loadHermesPresentationDraft(storage: Storage | null, scope: HermesDraftScope): StoredPresentationDraft | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(key(scope));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredPresentationDraft> & { version?: unknown };
    if (value.version !== 1 || !['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(String(value.action))
      || typeof value.instruction !== 'string' || value.instruction.length > 1_000
      || typeof value.style !== 'string' || !value.style.trim() || value.style.length > 100 || (value.language !== 'zh' && value.language !== 'en')
      || !isFigurePlanValid(value.figurePlan)
      || !Array.isArray(value.selected) || value.selected.length > 12 || value.selected.some((id: unknown) => typeof id !== 'string' || (id as string).length > 100)
      || (value.revisionMode !== undefined && (value.revisionMode !== 'art' || value.action !== 'storyboard.revise' || !value.parentId))
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

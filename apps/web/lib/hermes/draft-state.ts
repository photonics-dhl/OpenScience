import type { HermesNarrativeGeneration, StoryboardRequest, WorkspaceGuideResult } from '@/lib/api';

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

export interface HermesRunStartScope {
  userId: string;
  researchObjectId: string;
  ingestionTaskId: string;
}

export interface PendingHermesRunStart {
  key: string;
  generation: HermesNarrativeGeneration;
  savedAt: number;
  runId?: string;
}

export function readHermesResearchRunDraft(value: unknown): WorkspaceGuideResult['researchRunDraft'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const uuid = (id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id);
  if (Object.keys(draft).some(key => !['researchObjectId', 'ingestionTaskId', 'locale', 'style', 'instruction'].includes(key))
    || !uuid(draft.researchObjectId) || (draft.ingestionTaskId !== undefined && !uuid(draft.ingestionTaskId))
    || (draft.locale !== 'zh' && draft.locale !== 'en')
    || typeof draft.style !== 'string' || !draft.style.trim() || draft.style.length > 100
    || typeof draft.instruction !== 'string' || !draft.instruction.trim() || draft.instruction.length > 1000) return null;
  return draft as unknown as NonNullable<WorkspaceGuideResult['researchRunDraft']>;
}

function runStartKey(scope: HermesRunStartScope): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.researchObjectId)}:${encodeURIComponent(scope.ingestionTaskId)}:run-start:v1`;
}

export function loadPendingHermesRunStart(storage: Storage | null, scope: HermesRunStartScope): PendingHermesRunStart | null {
  try {
    const raw = storage?.getItem(runStartKey(scope));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingHermesRunStart> & { version?: unknown };
    const generation = value.generation;
    if (value.version !== 1 || typeof value.key !== 'string' || !value.key || value.key.length > 200
      || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)
      || (value.runId !== undefined && (typeof value.runId !== 'string' || !value.runId || value.runId.length > 100))
      || !generation || generation.profile !== 'visual-narrative-v1' || generation.maxAgentTasks !== 9
      || (generation.locale !== 'zh' && generation.locale !== 'en')
      || typeof generation.style !== 'string' || !generation.style.trim() || generation.style.length > 100
      || typeof generation.instruction !== 'string' || generation.instruction.length > 1_000) return null;
    return { key: value.key, savedAt: value.savedAt, ...(value.runId ? { runId: value.runId } : {}),
      generation: { profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: generation.locale, style: generation.style, instruction: generation.instruction } };
  } catch { return null; }
}

export function savePendingHermesRunStart(storage: Storage | null, scope: HermesRunStartScope, pending: PendingHermesRunStart): boolean {
  try {
    if (!storage) return false;
    storage.setItem(runStartKey(scope), JSON.stringify({ version: 1, ...pending }));
    return true;
  } catch { return false; }
}

/** Clear only after the matching run has been read from its durable URL. */
export function clearPendingHermesRunStart(storage: Storage | null, scope: HermesRunStartScope, runId: string): void {
  try {
    if (loadPendingHermesRunStart(storage, scope)?.runId === runId) storage?.removeItem(runStartKey(scope));
  } catch { /* Keeping the known run is safe: reopening it performs only a read. */ }
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

import type { HermesNarrativeGeneration, StoryboardRequest, WorkspaceGuidePayload, WorkspaceGuideResult } from '@/lib/api';
import { isExplicitFirstImageRequest, parseWorkspaceGuidePayload } from '@openscience/domain/workspace-guide-contract';

const STORAGE_PREFIX = 'openscience:hermes-draft:';

/** Current UI alias only. Never apply this to a saved or pending request body. */
export function currentFirstImageGoal(goal: string): string | null {
  if (isExplicitFirstImageRequest(goal)) return goal;
  const alias = goal.replace(/^为这篇研究做一张图(?=[，,：:\s。！!]|$)/u, '为当前研究生成一张图');
  return alias !== goal && isExplicitFirstImageRequest(alias) ? alias : null;
}

export type FirstImageSubmissionScope = Pick<HermesDraftScope, 'userId' | 'researchObjectId' | 'versionId'>;
export interface PendingFirstImageSubmission {
  sessionId: string;
  key: string;
  payload: WorkspaceGuidePayload;
  taskId?: string;
}
function firstImageSubmissionKey(scope: FirstImageSubmissionScope): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.researchObjectId)}:${encodeURIComponent(scope.versionId)}:first-image-submit:v1`;
}
function readFirstImageSubmission(value: unknown, scope: FirstImageSubmissionScope): PendingFirstImageSubmission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved image operation');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['sessionId', 'key', 'payload', 'taskId'].includes(k))
    || ![v.sessionId, v.key].every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)
    || (v.taskId !== undefined && (typeof v.taskId !== 'string' || !v.taskId || v.taskId.length > 100)))
    throw new Error('Invalid saved image operation');
  const payload = parseWorkspaceGuidePayload(v.payload);
  if (payload.executionIntent !== 'first-image' || payload.context.presentation?.researchObjectId !== scope.researchObjectId
    || payload.context.presentation?.versionId !== scope.versionId) throw new Error('Saved image operation scope changed');
  // Validate without rewriting the original POST body used by its idempotency key.
  return { sessionId: v.sessionId as string, key: v.key as string, payload: v.payload as WorkspaceGuidePayload, ...(v.taskId ? { taskId: v.taskId as string } : {}) };
}
/** Corrupt or inaccessible recovery state must never silently become a new paid operation. */
export function loadPendingFirstImageSubmission(storage: Storage | null, scope: FirstImageSubmissionScope): PendingFirstImageSubmission | null {
  const raw = storage?.getItem(firstImageSubmissionKey(scope));
  return raw == null ? null : readFirstImageSubmission(JSON.parse(raw), scope);
}
export function savePendingFirstImageSubmission(storage: Storage | null, scope: FirstImageSubmissionScope, value: PendingFirstImageSubmission): boolean {
  try {
    if (!storage) return false;
    const snapshot = readFirstImageSubmission(value, scope);
    storage.setItem(firstImageSubmissionKey(scope), JSON.stringify(snapshot));
    return storage.getItem(firstImageSubmissionKey(scope)) === JSON.stringify(snapshot);
  } catch { return false; }
}

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
  revisionSceneIndex?: number;
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
  output?: 'video';
}

export interface PendingHermesRunStart {
  key: string;
  generation: HermesNarrativeGeneration;
  savedAt: number;
  runId?: string;
  sourceReanalysisKey?: string;
  /** First source POST body only; missing on a legacy key means output was omitted. */
  sourceReanalysisOutput?: 'video';
  /** New intents prepare their source; run-phase/legacy unknown run bodies never prepare again. */
  phase?: 'source' | 'run';
}

export function readHermesResearchRunDraft(value: unknown): WorkspaceGuideResult['researchRunDraft'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const uuid = (id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id);
  if (Object.keys(draft).some(key => !['researchObjectId', 'ingestionTaskId', 'locale', 'style', 'instruction', 'output'].includes(key))
    || !uuid(draft.researchObjectId) || (draft.ingestionTaskId !== undefined && !uuid(draft.ingestionTaskId))
    || (draft.locale !== 'zh' && draft.locale !== 'en') || (draft.output !== undefined && draft.output !== 'video')
    || typeof draft.style !== 'string' || !draft.style.trim() || draft.style.length > 100
    || typeof draft.instruction !== 'string' || !draft.instruction.trim() || draft.instruction.length > 1000) return null;
  return draft as unknown as NonNullable<WorkspaceGuideResult['researchRunDraft']>;
}

function runStartKey(scope: HermesRunStartScope): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.researchObjectId)}:${encodeURIComponent(scope.ingestionTaskId)}:run-start${scope.output === 'video' ? ':video' : ''}:v1`;
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
      || (value.sourceReanalysisKey !== undefined && (typeof value.sourceReanalysisKey !== 'string'
        || !value.sourceReanalysisKey || value.sourceReanalysisKey.length > 64))
      || (value.sourceReanalysisOutput !== undefined && (value.sourceReanalysisOutput !== 'video'
        || !value.sourceReanalysisKey || scope.output !== 'video'))
      || (value.phase !== undefined && value.phase !== 'source' && value.phase !== 'run')
      || (value.phase === 'run' && (value.sourceReanalysisKey !== undefined || value.sourceReanalysisOutput !== undefined))
      || !generation || generation.profile !== 'visual-narrative-v1' || generation.maxAgentTasks !== 9
      || generation.output !== scope.output || (generation.output !== undefined && generation.output !== 'video')
      || (generation.locale !== 'zh' && generation.locale !== 'en')
      || typeof generation.style !== 'string' || !generation.style.trim() || generation.style.length > 100
      || typeof generation.instruction !== 'string' || generation.instruction.length > 1_000) return null;
    return { key: value.key, savedAt: value.savedAt, ...(value.runId ? { runId: value.runId } : {}),
      ...(value.sourceReanalysisKey ? { sourceReanalysisKey: value.sourceReanalysisKey } : {}),
      ...(value.sourceReanalysisOutput ? { sourceReanalysisOutput: value.sourceReanalysisOutput } : {}),
      ...(value.phase ? { phase: value.phase } : {}),
      generation: { profile: 'visual-narrative-v1', maxAgentTasks: 9, locale: generation.locale, style: generation.style, instruction: generation.instruction,
        ...(generation.output ? { output: generation.output } : {}) } };
  } catch { return null; }
}

export function savePendingHermesRunStart(storage: Storage | null, scope: HermesRunStartScope, pending: PendingHermesRunStart): boolean {
  try {
    if (!storage || pending.generation.output !== scope.output) return false;
    if (pending.sourceReanalysisOutput !== undefined && (pending.sourceReanalysisOutput !== 'video'
      || !pending.sourceReanalysisKey || scope.output !== 'video')) return false;
    if (pending.phase !== undefined && pending.phase !== 'source' && pending.phase !== 'run') return false;
    if (pending.phase === 'run' && (pending.sourceReanalysisKey !== undefined || pending.sourceReanalysisOutput !== undefined)) return false;
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
      || (value.revisionSceneIndex !== undefined && (!Number.isInteger(value.revisionSceneIndex) || value.revisionSceneIndex < 0 || value.revisionSceneIndex > 5
        || !value.parentId || !['storyboard.revise', 'video.create'].includes(String(value.action)) || value.revisionMode !== undefined))
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

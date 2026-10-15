import type { SourceLocator } from '../research-intelligence/types';

export interface WorkspaceGuidePayload extends Record<string, unknown> {
  goal: string;
  /** Only a current user submission may authorize the bounded server continuation. */
  executionIntent?: 'first-image';
  locale: 'zh' | 'en';
  route: 'dashboard' | 'research-object-new' | 'research-object-edit';
  target: WorkspaceGuideTarget;
  context: {
    tasks: Array<{ id: string; researchObjectId: string; state: string }>;
    researchObjects: Array<{ id: string; title: string; status: string }>;
    presentation?: { researchObjectId: string; versionId?: string };
    editorDraft?: WorkspaceEditorDraft;
    writingDraft?: WorkspaceWritingDraftInput;
    writingSource?: { ingestionTaskId: string };
    researchRunSource?: { ingestionTaskId: string };
  };
}

export type WorkspaceWritingKind = 'note' | 'review' | 'manuscript';

export interface WorkspaceWritingDraftInput {
  /** The succeeded workspace.guide task that owns the displayed private draft. */
  baseDraftTaskId: string;
  title: string;
  body: string;
}

export interface WorkspaceWritingCitation {
  id: string;
  marker: string;
  quote: string;
  sourceLocator: SourceLocator;
}

export interface WorkspaceWritingDraft {
  title: string;
  kind: WorkspaceWritingKind;
  body: string;
  /** Server-selected succeeded sdf.extract task that owns the SourceMap lineage. */
  sourceTaskId: string;
  /** Prior workspace.guide draft task, when this result revises or saves an earlier draft. */
  baseDraftTaskId?: string;
  citations: WorkspaceWritingCitation[];
  sourceStatus: 'grounded' | 'grounded_with_unresolved_review' | 'user_edited';
}

export const WORKSPACE_DRAFT_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
export interface WorkspaceEditorDraft {
  researchObjectId: string;
  scope: string;
  version: number;
  core: Record<(typeof WORKSPACE_DRAFT_FIELDS)[number], string>;
}

type WorkspaceGuideTarget =
  | 'ro-title' | 'source-import' | 'research-question'
  | 'sdf-problem' | 'sdf-insight' | 'sdf-method' | 'sdf-evidence'
  | 'sdf-results' | 'sdf-limitations' | 'hermes-diff' | 'commit' | null;

const shortString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

/** This is an execution boundary, not a general natural-language router. */
export function isExplicitFirstImageRequest(goal: string): boolean {
  const text = goal.trim();
  // A request for a particular existing scene belongs to the exact-parent/manual path.
  if (/\b(?:for|of)\s+(?:the\s+)?(?:existing\s+)?scene\s+\d+\b/iu.test(text)
    || /(?:为|给|用于|针对)\s*(?:(?:现有|已有)的?)?\s*(?:第\s*[一二三四五六七八九十\d]+\s*幕|(?:第\s*)?[一二三四五六七八九十\d]+\s*场景|(?:场景|分镜)\s*[一二三四五六七八九十\d]+)/u.test(text)) return false;
  if (!text
    || /[?？\n\r"“”「」]|(?:不要|不需要|别生成|暂不|仅规划|只规划|先规划|如何|怎么|为什么|是否|能否|助手|论文说|视频|公开|发布|每[张幅个]|多张|一组|[二三四五六七八九十2-9]张)|\b(?:not|don't|only|plan|how|why|whether|assistant|said|video|publish|each|multiple|several|images)\b/iu.test(text)) return false;
  return /^(?:请\s*)?(?:帮我\s*)?(?:直接\s*)?生图(?:[，,：:\s]|$|[。！!])/u.test(text)
    || /^(?:请\s*)?(?:帮我\s*)?(?:直接\s*)?(?:(?:为|给)(?:这篇论文|这篇研究|本文|论文|这个研究|当前研究|我)\s*)?(?:生成|画|绘制|制作|做)(?:一张|一幅|首张|第一张|个|张|幅)?(?:解释性|概念|科学)?(?:图片|配图|插图|图解|图)(?:[，,：:\s]|$|[。！!])/u.test(text)
    || /^(?:请\s*)?(?:帮我\s*)?(?:直接\s*)?(?:(?:为|给)(?:这篇论文|本文|论文|这个研究|当前研究|我)\s*)?配(?:一张|一幅|张|幅)图(?:[，,：:\s]|$|[。！!])/u.test(text)
    || /^(?:please\s+)?(?:generate|create|draw|make)\s+(?:(?:one|an?|the first)\s+)?(?:image|illustration|diagram)\b/iu.test(text);
}

/** Shared API/worker trust-boundary parser. Keep persistence and execution on one exact contract. */
export function parseWorkspaceGuidePayload(value: unknown): WorkspaceGuidePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('workspace.guide payload 无效');
  const payload = value as Record<string, unknown>;
  if (!hasOnlyKeys(payload, ['goal', 'executionIntent', 'locale', 'route', 'target', 'context'])) throw new Error('workspace.guide payload 包含未知字段');
  const goal = typeof payload.goal === 'string' ? payload.goal.trim() : '';
  if (!goal || goal.length > 2_000) throw new Error('workspace.guide 缺少有效 goal');
  if (payload.locale !== 'zh' && payload.locale !== 'en') throw new Error('workspace.guide locale 无效');
  if (payload.route !== 'dashboard' && payload.route !== 'research-object-new' && payload.route !== 'research-object-edit') throw new Error('workspace.guide route 无效');
  const targets = new Set<Exclude<WorkspaceGuideTarget, null>>([
    'ro-title', 'source-import', 'research-question', 'sdf-problem', 'sdf-insight', 'sdf-method',
    'sdf-evidence', 'sdf-results', 'sdf-limitations', 'hermes-diff', 'commit',
  ]);
  if (payload.target !== null && (typeof payload.target !== 'string' || !targets.has(payload.target as Exclude<WorkspaceGuideTarget, null>))) {
    throw new Error('workspace.guide target 无效');
  }
  if (!payload.context || typeof payload.context !== 'object' || Array.isArray(payload.context)) throw new Error('workspace.guide context 无效');
  const context = payload.context as Record<string, unknown>;
  if (!hasOnlyKeys(context, ['tasks', 'researchObjects', 'presentation', 'editorDraft', 'writingDraft', 'writingSource', 'researchRunSource'])) throw new Error('workspace.guide context 包含未知字段');
  if (!Array.isArray(context.tasks) || context.tasks.length > 20 || !Array.isArray(context.researchObjects) || context.researchObjects.length > 20) {
    throw new Error('workspace.guide context 超出边界');
  }
  const tasks = context.tasks.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('workspace.guide task context 无效');
    const task = candidate as Record<string, unknown>;
    if (!hasOnlyKeys(task, ['id', 'researchObjectId', 'state'])) throw new Error('workspace.guide task context 包含未知字段');
    if (!shortString(task.id, 100) || !shortString(task.researchObjectId, 100) || !shortString(task.state, 64)) throw new Error('workspace.guide task context 无效');
    return { id: task.id, researchObjectId: task.researchObjectId, state: task.state };
  });
  const researchObjects = context.researchObjects.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('workspace.guide research context 无效');
    const research = candidate as Record<string, unknown>;
    if (!hasOnlyKeys(research, ['id', 'title', 'status'])) throw new Error('workspace.guide research context 包含未知字段');
    if (!shortString(research.id, 100) || !shortString(research.title, 240) || !shortString(research.status, 64)) throw new Error('workspace.guide research context 无效');
    return { id: research.id, title: research.title, status: research.status };
  });
  let presentation: WorkspaceGuidePayload['context']['presentation'];
  if (context.presentation !== undefined) {
    if (!context.presentation || typeof context.presentation !== 'object' || Array.isArray(context.presentation)) throw new Error('workspace.guide presentation context 无效');
    const candidate = context.presentation as Record<string, unknown>;
    if (!hasOnlyKeys(candidate, ['researchObjectId', 'versionId']) || !shortString(candidate.researchObjectId, 100)
      || (candidate.versionId !== undefined && !shortString(candidate.versionId, 100))) throw new Error('workspace.guide presentation context 无效');
    // Presentation routes can carry only the canonical object identity. The worker
    // resolves and authorizes that identity from the authenticated session; when a
    // client also sends summaries, keep the consistency check for that richer form.
    if (researchObjects.length > 0 && !researchObjects.some((item) => item.id === candidate.researchObjectId)) {
      throw new Error('workspace.guide presentation context 不属于研究上下文');
    }
    presentation = { researchObjectId: candidate.researchObjectId, ...(candidate.versionId ? { versionId: candidate.versionId } : {}) };
  }
  let editorDraft: WorkspaceEditorDraft | undefined;
  if (context.editorDraft !== undefined) {
    const draft = context.editorDraft as Record<string, unknown>;
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)
      || !hasOnlyKeys(draft, ['researchObjectId', 'scope', 'version', 'core'])
      || payload.route !== 'research-object-edit'
      || !shortString(draft.researchObjectId, 100) || !shortString(draft.scope, 100)
      || !Number.isSafeInteger(draft.version) || Number(draft.version) < 1
      || !researchObjects.some((item) => item.id === draft.researchObjectId)) throw new Error('Invalid workspace editor draft');
    const core = draft.core as Record<string, unknown>;
    if (!core || typeof core !== 'object' || Array.isArray(core) || !hasOnlyKeys(core, [...WORKSPACE_DRAFT_FIELDS])
      || !WORKSPACE_DRAFT_FIELDS.every((key) => typeof core[key] === 'string' && (core[key] as string).length <= 4_000)
      || JSON.stringify(core).length > 18_000) throw new Error('Workspace editor draft exceeds bounds');
    editorDraft = { researchObjectId: draft.researchObjectId, scope: draft.scope, version: Number(draft.version), core: core as WorkspaceEditorDraft['core'] };
  }
  let writingDraft: WorkspaceWritingDraftInput | undefined;
  if (context.writingDraft !== undefined) {
    const draft = context.writingDraft as Record<string, unknown>;
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)
      || !hasOnlyKeys(draft, ['baseDraftTaskId', 'title', 'body'])
      || !uuid(draft.baseDraftTaskId) || !shortString(draft.title, 240)
      || typeof draft.body !== 'string' || draft.body.length > 60_000) {
      throw new Error('Workspace writing draft exceeds bounds');
    }
    writingDraft = { baseDraftTaskId: draft.baseDraftTaskId, title: draft.title, body: draft.body };
  }
  let writingSource: WorkspaceGuidePayload['context']['writingSource'];
  if (context.writingSource !== undefined) {
    const source = context.writingSource as Record<string, unknown>;
    if (!source || typeof source !== 'object' || Array.isArray(source)
      || !hasOnlyKeys(source, ['ingestionTaskId']) || !uuid(source.ingestionTaskId)) {
      throw new Error('Invalid workspace writing source');
    }
    writingSource = { ingestionTaskId: source.ingestionTaskId };
  }
  let researchRunSource: WorkspaceGuidePayload['context']['researchRunSource'];
  if (context.researchRunSource !== undefined) {
    const source = context.researchRunSource as Record<string, unknown>;
    if (!source || typeof source !== 'object' || Array.isArray(source)
      || !hasOnlyKeys(source, ['ingestionTaskId']) || !uuid(source.ingestionTaskId)
      || payload.route !== 'research-object-edit') throw new Error('Invalid workspace research run source');
    researchRunSource = { ingestionTaskId: source.ingestionTaskId };
  }
  if (payload.executionIntent !== undefined && (payload.executionIntent !== 'first-image'
    || payload.route !== 'research-object-edit' || !presentation?.versionId
    || writingDraft || goal.length > 1000 || !isExplicitFirstImageRequest(goal))) throw new Error('Invalid current first-image execution request');
  return {
    goal,
    ...(payload.executionIntent === 'first-image' ? { executionIntent: 'first-image' as const } : {}),
    locale: payload.locale,
    route: payload.route,
    target: payload.target as WorkspaceGuideTarget,
    context: {
      tasks,
      researchObjects,
      ...(presentation ? { presentation } : {}),
      ...(editorDraft ? { editorDraft } : {}),
      ...(writingDraft ? { writingDraft } : {}),
      ...(writingSource ? { writingSource } : {}),
      ...(researchRunSource ? { researchRunSource } : {}),
    },
  };
}

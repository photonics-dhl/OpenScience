import type { SourceLocator } from '../research-intelligence/types';
import type { StoryboardDocument } from '../assets/storyboard';
import type { SelectedImageBinding } from '../assets/scene-image';

/** A selected context alone never authorizes producing another paid image. */
export function selectedImageProductionIntent(goal: string): boolean {
  // Inspect authority wording only; labels and the full original goal are not rewritten.
  const text = goal.replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|《[^》\n]*》/gu, ' ').trim().replace(/\s+/gu, ' ');
  if (!text || /(?:如果|假如)|\b(?:if|unless|whether)\b/iu.test(text)
    || /(?:不要|别(?:再)?|无需|不用|不需要|请勿|暂不|先不)\s*(?:再|重新)?\s*(?:生成|生图|重画|重绘|出图|制作|提交)/u.test(text)
    || /\b(?:do not|don't|never|no need to|not going to)\s+(?:generate|regenerate|redraw|render|produce|submit)\b/iu.test(text)) return false;
  const command = text.replace(/^(?:(?:please|can you|could you|would you|help me|i want you to|i need you to)\s+)+/iu, '')
    .replace(/^(?:请(?:你|帮我)?|帮我|麻烦(?:你)?|劳驾|我想(?:请你|让你)?|我需要你?|我希望你?)\s*/u, '');
  // Only this explicit trailing coordination is ancillary; ambiguous attachment stays unsupported.
  const primary = command.replace(/(?:并解释原因|\s+and explain why)[。.!！]?$/iu, '').trim();
  if (/(?:解释|说明|讲解|讨论|建议|介绍|分析|为什么|为何|如何|怎么|是否|方案|计划)/u.test(primary)
    || /\b(?:explain|explanation|advice|advise|suggest|suggestion|discuss|discussion|how|plan|proposal|outline)\b/iu.test(primary)) return false;
  if (/^(?:不要|别|无需|不用|不需要|先不|暂不|仅讨论|只讨论|只解释|只需解释|只要方案|是否|为什么|为何|如何|怎么|解释|讨论|告诉我)/u.test(primary)
    || /^(?:do not|don't|no need|not yet|only explain|plan only|explain|describe|discuss|suggest|advise|tell me|plan|should|why|how|what)\b/iu.test(primary)
    || /^(?:generate|prepare|make|write)\s+(?:(?:a|the)\s+)?(?:plan|proposal|outline)\b/iu.test(primary)) return false;
  return /^(?:modify|edit|change|redraw|regenerate|generate|draw|improve|clarify|remove|add|move|replace|make)\b/iu.test(primary)
    || /^(?:把|将|给|在|为|对|左|右|上|下|中|这|第|当前|所选|修改|调整|优化|重画|重绘|重新生成|生成|画|绘制|去掉|删除|添加|移动|换)/u.test(primary)
      && /(?:修改|改成|改为|改一下|改细|改粗|调整|优化|重画|重绘|重新生成|生成|画一|画细|画粗|绘制|去掉|删除|添加|移动|移到|换成)/u.test(primary);
}

export interface WorkspaceSelectedImageDraft {
  status: 'private-proposal';
  source: Pick<SelectedImageBinding, 'researchObjectId' | 'versionId' | 'assetId' | 'contentHash' | 'storyboardAssetId' | 'parentContentHash' | 'sceneIndex'> & { sourceClaimIds: string[] };
  document: StoryboardDocument;
}
export function workspaceSelectedImageDraftSource(binding: SelectedImageBinding): WorkspaceSelectedImageDraft['source'] {
  return { researchObjectId: binding.researchObjectId, versionId: binding.versionId, assetId: binding.assetId, contentHash: binding.contentHash,
    storyboardAssetId: binding.storyboardAssetId, parentContentHash: binding.parentContentHash, sceneIndex: binding.sceneIndex, sourceClaimIds: [...binding.sceneSourceClaimIds] };
}
export function readWorkspaceSelectedImageDraft(value: unknown): WorkspaceSelectedImageDraft {
  const draft = value as Record<string, unknown> | null;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft) || draft.status !== 'private-proposal'
    || !hasOnlyKeys(draft, ['status', 'source', 'document'])) throw new Error('Invalid private selected-image proposal');
  const source = readWorkspaceSelectedImageReference(draft.source);
  // Browser-safe projection reader. Scientific materialization and the complete
  // storyboard parser remain on the server; importing them here pulls Node/S3 into the client.
  const document = draft.document as Record<string, unknown> | null;
  const scene = Array.isArray(document?.scenes) && document.scenes.length === 1 ? document.scenes[0] as Record<string, unknown> : undefined;
  const illustration = scene?.illustration as Record<string, unknown> | undefined;
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.schemaVersion !== 1 && document.schemaVersion !== 2
    || !shortString(document.title, 500) || !scene || typeof scene !== 'object' || !shortString(scene.title, 500)
    || !Array.isArray(scene.sourceClaimIds) || !scene.sourceClaimIds.length || !scene.sourceClaimIds.every(id => typeof id === 'string' && source.sourceClaimIds.includes(id))
    || !illustration || typeof illustration !== 'object' || Array.isArray(illustration) || illustration.schemaVersion !== 1 && illustration.schemaVersion !== 2
    || typeof illustration.message !== 'string' || !illustration.message.trim()) throw new Error('Selected-image proposal requires one scientific illustration');
  return { status: 'private-proposal', source, document: document as unknown as StoryboardDocument };
}
export function readWorkspaceSelectedImageReference(value: unknown): WorkspaceSelectedImageDraft['source'] {
  const source = value as Record<string, unknown> | null;
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || Object.keys(source).length !== 8 || !hasOnlyKeys(source, ['researchObjectId', 'versionId', 'assetId', 'contentHash', 'storyboardAssetId', 'parentContentHash', 'sceneIndex', 'sourceClaimIds'])
    || !['researchObjectId', 'versionId'].every(key => shortString(source[key], 100))
    || !uuid(source.assetId) || !uuid(source.storyboardAssetId)
    || ![source.contentHash, source.parentContentHash].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash))
    || !Number.isSafeInteger(source.sceneIndex) || Number(source.sceneIndex) < 0
    || !Array.isArray(source.sourceClaimIds) || !source.sourceClaimIds.length
    || !source.sourceClaimIds.every(id => shortString(id, 100)) || new Set(source.sourceClaimIds).size !== source.sourceClaimIds.length) {
    throw new Error('Invalid selected-image reference');
  }
  return structuredClone(source) as unknown as WorkspaceSelectedImageDraft['source'];
}

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
    presentation?: { researchObjectId: string; versionId?: string; selectedImageAssetId?: string };
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
    || /^(?:请\s*)?(?:帮我\s*)?(?:直接\s*)?(?:(?:为|给)(?:这篇论文|本文|论文|这个研究|当前研究|我)\s*)?(?:生成|画|绘制|制作)(?:一张|一幅|首张|第一张|个|张|幅)?(?:解释性|概念|科学)?(?:图片|配图|插图|图解|图)(?:[，,：:\s]|$|[。！!])/u.test(text)
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

/** Stored-reader stage only. The live HTTP writer retains the legacy strict parser above. */
export function readWorkspaceGuidePayloadWithSelectedImage(value: unknown): WorkspaceGuidePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return parseWorkspaceGuidePayload(value);
  const payload = value as Record<string, unknown>;
  const context = payload.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return parseWorkspaceGuidePayload(value);
  const presentation = (context as Record<string, unknown>).presentation;
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)
    || !Object.hasOwn(presentation, 'selectedImageAssetId')) return parseWorkspaceGuidePayload(value);
  const candidate = presentation as Record<string, unknown>;
  if (!hasOnlyKeys(candidate, ['researchObjectId', 'versionId', 'selectedImageAssetId'])
    || !uuid(candidate.selectedImageAssetId) || !shortString(candidate.researchObjectId, 100)
    || !shortString(candidate.versionId, 100) || payload.route !== 'research-object-edit'
    || payload.executionIntent !== undefined) throw new Error('Invalid selected-image guide scope');
  const parsed = parseWorkspaceGuidePayload({ ...payload, context: { ...context,
    presentation: { researchObjectId: candidate.researchObjectId, versionId: candidate.versionId } } });
  return { ...parsed, context: { ...parsed.context, presentation: {
    ...parsed.context.presentation!, selectedImageAssetId: candidate.selectedImageAssetId } } };
}

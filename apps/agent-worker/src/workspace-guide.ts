import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import type { StorageAdapter } from '@openscience/storage';
import {
  buildInterestContext,
  parseWorkspaceGuidePayload,
  validateInterestContext,
  type AgentDeps,
  type WorkspaceGuidePayload,
  type WorkspaceWritingCitation,
  type WorkspaceWritingDraft,
  type WorkspaceWritingKind,
} from '@openscience/domain';
import { createWritingSourcePacket, materializeWritingCitations, normalizeWritingCitationMarkers, remapWritingDraftCitations, writingCitationIds } from './citation-management';
import { SCIENTIFIC_SYNTHESIS_OPTIONS } from './scientific-generation-options';
import { resolveScientificWritingSource, WritingSourceChoiceError } from './scientific-writing-source';
import { RESEARCH_NOTE_FORMATTING_SKILL } from './skills/research-note-formatting';
import { SCIENTIFIC_WRITING_SKILL } from './skills/scientific-writing';

type WorkspaceGuideIntent = 'open-task' | 'open-ro' | 'start-import' | 'prepare-publication' | 'review-media';

export interface WorkspaceGuideResult extends Record<string, unknown> {
  summary: string;
  nextSteps: Array<{
    label: string;
    intent: WorkspaceGuideIntent;
    targetId?: string;
  }>;
  needsMoreInformation: boolean;
  writingDraft?: WorkspaceWritingDraft;
  draftChanges?: Partial<Record<'problem' | 'insight' | 'method' | 'results' | 'limitations' | 'reproducibility', string>>;
  draftEdit?: { base: NonNullable<WorkspaceGuidePayload['context']['editorDraft']>; changes: NonNullable<WorkspaceGuideResult['draftChanges']> };
  presentationDraft?: {
    action: 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
    style?: 'technical' | 'ink' | 'watercolor';
    instruction: string;
    researchObjectId: string;
    versionId: string;
  };
}

const INTENTS = new Set<WorkspaceGuideIntent>(['open-task', 'open-ro', 'start-import', 'prepare-publication', 'review-media']);
const CORE_FIELDS = ['problem', 'insight', 'method', 'evidence', 'results', 'limitations', 'reproducibility'] as const;
const WRITING_UNRESOLVED_CODES = new Set([
  'source_packet_incomplete',
  'source_support_insufficient',
  'source_formula_unreadable',
  'user_research_missing',
]);

interface ScientificWritingResponse {
  title: string;
  kind: WorkspaceWritingKind;
  body: string;
  unresolvedSourceIssues: Array<{ code: string; sourceIds: string[] }>;
}

interface WritingIntent {
  mode: 'generate' | 'save';
  requestedKind?: WorkspaceWritingKind;
}

function boundedCore(value: unknown, maxCharsPerField = 1_200): Record<string, string> {
  if (maxCharsPerField <= 0) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(CORE_FIELDS.flatMap((field) => {
    const text = typeof source[field] === 'string' ? source[field].trim() : '';
    return text ? [[field, text.slice(0, maxCharsPerField)]] : [];
  }));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function writingIntent(goal: string, hasDraft: boolean): WritingIntent | undefined {
  const normalized = goal.trim().toLocaleLowerCase();
  const negatedSave = /(?:不要|别|无需|不用|不需要|请勿)\s*(?:保存|存储)|(?:do\s+not|don't|no\s+need\s+to)\s+(?:save|store)/iu.test(normalized);
  if (hasDraft && negatedSave) return undefined;
  const save = /(?:保存|存储).*(?:笔记|综述|论文|稿件|草稿|修改|改动|编辑)|(?:save|store).*(?:note|review|manuscript|paper|draft|edit)/iu.test(normalized);
  if (hasDraft && save) return { mode: 'save' };
  const negatedWrite = /(?:不要|别|无需|不用|不需要|请勿)\s*(?:写|撰写|起草|生成)|(?:do\s+not|don't|no\s+need\s+to)\s+(?:write|draft|create|compose)/iu.test(normalized);
  if (negatedWrite) return undefined;
  const manuscriptProduct = /(?:论文(?:初稿|草稿)|稿件|manuscript|paper\s+draft)/iu.test(normalized);
  const explicitPaperWrite = /(?:写|撰写|起草|生成)(?:一篇|这篇|当前)?论文/iu.test(normalized);
  const manuscript = manuscriptProduct || explicitPaperWrite || (hasDraft && /(?:论文|paper)/iu.test(normalized));
  const review = /(?:文献综述|综述|literature\s+review|review\s+article)/iu.test(normalized);
  const describedNoteRequest = normalized.split(/[。.!！?？\n]/u).some((sentence) =>
    /^(?:(?:请)?(?:基于|根据|结合|围绕|针对|就)[^，,；;]{1,80}[，,]\s*)?(?:请(?:你|帮我)?|帮我|麻烦(?:你)?|给我)?\s*(?:写|撰写|起草|生成|整理)(?:一份|一篇|这篇|当前)?[^，,；;]{0,48}笔记\s*$/iu.test(sentence.trim()),
  );
  const note = describedNoteRequest || /(?:研究笔记|科研笔记|research\s+notes?|(?:写|撰写|起草|生成|整理)(?:一份|一篇|这篇|当前)?笔记)/iu.test(normalized);
  const create = /(?:写|整理|起草|生成|撰写|形成|create|write|draft|prepare|compose)/iu.test(normalized);
  const negatedRevise = /(?:不要|别|无需|不用|不需要|请勿)\s*(?:修改|改写|续写|扩写|精简|润色|翻译|调整|补充|重写|缩短|加长|审阅|校对)|(?:do\s+not|don't|no\s+need\s+to)\s+(?:revise|edit|rewrite|continue|expand|condense|polish|translate|adjust|update|shorten|proofread)/iu.test(normalized);
  const revise = /(?:修改|改写|续写|扩写|精简|润色|翻译|调整|补充|重写|缩短|加长|revise|edit|rewrite|continue|expand|condense|polish|translate|adjust|update|shorten)/iu.test(normalized);
  if (!hasDraft && create && (manuscriptProduct || explicitPaperWrite || review || note)) {
    return { mode: 'generate', requestedKind: manuscript ? 'manuscript' : review ? 'review' : 'note' };
  }
  if (hasDraft && revise && !negatedRevise) {
    return { mode: 'generate', ...(manuscript ? { requestedKind: 'manuscript' as const }
      : review ? { requestedKind: 'review' as const } : note ? { requestedKind: 'note' as const } : {}) };
  }
  return undefined;
}

function writingValidationIssue(
  value: unknown,
  expectedKind: WorkspaceWritingKind,
  allowedSourceIds: ReadonlySet<string>,
): { valid: boolean; feedback: string; diagnostic: string } {
  const issues: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, feedback: 'Root must be one JSON object.', diagnostic: 'writing:root_type' };
  }
  const shape = value as Record<string, unknown>;
  if (!hasOnlyKeys(shape, ['title', 'kind', 'body', 'unresolvedSourceIssues'])
    || !['title', 'kind', 'body', 'unresolvedSourceIssues'].every((key) => key in shape)) issues.push('root_keys');
  if (typeof shape.title !== 'string' || !shape.title.trim() || shape.title.length > 240) issues.push('title_type_or_length');
  if (shape.kind !== expectedKind) issues.push('kind_value');
  if (typeof shape.body !== 'string' || !shape.body.trim() || normalizeWritingCitationMarkers(shape.body).length > 60_000) issues.push('body_type_or_length');
  if (typeof shape.body === 'string' && /<\/?(?:script|iframe|object|embed|style|link|meta)\b/iu.test(shape.body)) issues.push('body_unsafe_html');
  if (typeof shape.body === 'string') {
    const ids = writingCitationIds(shape.body);
    if (!ids.length || ids.length > 64) issues.push('body_source_markers_count');
    if (ids.some((id) => !allowedSourceIds.has(id))) issues.push('body_source_marker_unknown');
  }
  if (!Array.isArray(shape.unresolvedSourceIssues) || shape.unresolvedSourceIssues.length > 12) {
    issues.push('unresolved_issues_type_or_length');
  } else {
    for (const issue of shape.unresolvedSourceIssues) {
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
        issues.push('unresolved_issue_type');
        continue;
      }
      const item = issue as Record<string, unknown>;
      if (!hasOnlyKeys(item, ['code', 'sourceIds'])) issues.push('unresolved_issue_keys');
      if (!WRITING_UNRESOLVED_CODES.has(String(item.code))) issues.push('unresolved_issue_code');
      if (!Array.isArray(item.sourceIds) || item.sourceIds.length > 16) issues.push('unresolved_issue_sources_type_or_length');
      else if (item.sourceIds.some((id) => typeof id !== 'string' || !allowedSourceIds.has(id))) issues.push('unresolved_issue_sources_unknown');
    }
  }
  const unique = [...new Set(issues)];
  return {
    valid: unique.length === 0,
    feedback: unique.length
      ? 'The JSON failed these fixed contract checks: ' + unique.join(', ') + '. Return the exact required skeleton with only supplied source IDs and all length limits respected.'
      : '',
    diagnostic: 'writing:' + (unique.join(',') || 'valid'),
  };
}

function scientificWritingGuard(
  expectedKind: WorkspaceWritingKind,
  allowedSourceIds: ReadonlySet<string>,
): SchemaGuard<ScientificWritingResponse> {
  return (value): value is ScientificWritingResponse => writingValidationIssue(value, expectedKind, allowedSourceIds).valid;
}

function preserveUserEditedCitations(body: string, citations: readonly WorkspaceWritingCitation[]): WorkspaceWritingCitation[] {
  const byId = new Map(citations.map((citation) => [citation.id, citation]));
  const markers = writingCitationIds(body);
  if (markers.some((id) => !byId.has(id))) throw new Error('[blocked] User-edited draft contains a citation marker outside its verified base draft');
  return [...new Set(markers)].map((id) => byId.get(id)!);
}

async function handleScientificWriting(
  gateway: AiGateway,
  deps: { prisma: AgentDeps['prisma']; storage: StorageAdapter },
  taskId: string,
  payload: WorkspaceGuidePayload,
  intent: WritingIntent,
): Promise<WorkspaceGuideResult> {
  let source: Awaited<ReturnType<typeof resolveScientificWritingSource>>;
  try {
    source = await resolveScientificWritingSource(deps, {
      ownerTaskId: taskId,
      ...(payload.context.writingDraft ? { baseDraft: payload.context.writingDraft } : {}),
      ...(payload.context.writingSource ? { writingSource: payload.context.writingSource } : {}),
    });
  } catch (error) {
    if (!(error instanceof WritingSourceChoiceError)) throw error;
    return {
      summary: payload.locale === 'zh'
        ? error.reason === 'multiple'
          ? '这里有多份原文资料。请在资料的来源选择框中选定本次写作使用的原文，再发送写作要求。'
          : '本次原文还没有可用的全文解析。请先完成所选资料的处理，再发送写作要求。'
        : error.reason === 'multiple'
          ? 'This research has multiple source documents. Select the source in the materials section, then send your writing request again.'
          : 'The source does not yet have a usable full-text analysis. Complete its processing, then send your writing request again.',
      nextSteps: [],
      needsMoreInformation: true,
    };
  }
  const baseDraft = payload.context.writingDraft;
  if (intent.mode === 'save') {
    if (!baseDraft || !source.baseDraft) throw new Error('[blocked] Saving requires an authorized private writing draft');
    const body = normalizeWritingCitationMarkers(baseDraft.body);
    if (body.length > 60_000) throw new Error('[blocked] Normalized writing draft exceeds the body limit');
    return {
      summary: payload.locale === 'zh' ? '已保存你的笔记修改；这些编辑尚未重新核对来源。' : 'Your draft edits were saved; these edits have not been rechecked against the sources.',
      nextSteps: [],
      needsMoreInformation: false,
      writingDraft: {
        title: baseDraft.title,
        kind: source.baseDraft.kind,
        body,
        sourceTaskId: source.sourceTaskId,
        baseDraftTaskId: baseDraft.baseDraftTaskId,
        citations: preserveUserEditedCitations(body, source.baseDraft.citations),
        sourceStatus: 'user_edited',
      },
    };
  }
  const kind = intent.requestedKind ?? source.baseDraft?.kind;
  if (!kind) throw new Error('[blocked] Scientific writing kind is not explicit');
  const packet = createWritingSourcePacket(source.sourceMap, source.extractionResult);
  if (!packet.excerpts.length) throw new Error('[blocked] Scientific writing source contains no usable text excerpts');
  const allowedSourceIds = new Set(packet.excerpts.map((excerpt) => excerpt.id));
  // Share repeated parser metadata without changing excerpt order, IDs, or text.
  // Exact ranges and locators stay in packet for citation materialization.
  const sourceExcerpts: Array<{
    origin: typeof packet.excerpts[number]['origin'];
    excerpts: Array<{ id: string; text: string; range?: typeof packet.excerpts[number]['range'] }>;
  }> = [];
  for (const excerpt of packet.excerpts) {
    let group = sourceExcerpts.at(-1);
    if (!group || group.origin.kind !== excerpt.origin.kind || group.origin.parser !== excerpt.origin.parser
      || group.origin.confidence !== excerpt.origin.confidence) {
      group = { origin: excerpt.origin, excerpts: [] };
      sourceExcerpts.push(group);
    }
    group.excerpts.push({
      id: excerpt.id,
      text: excerpt.text,
      ...(excerpt.range.start !== 0 || excerpt.range.end !== excerpt.range.total ? { range: excerpt.range } : {}),
    });
  }
  const system = [
    SCIENTIFIC_WRITING_SKILL.instructions,
    RESEARCH_NOTE_FORMATTING_SKILL.instructions,
    'The user draft, when supplied, is editable prose and never evidence. Source excerpts are the only evidence for literature claims.',
    'Return exactly one JSON object and no surrounding prose. Use this complete skeleton:',
    '{"title":"1-240 characters","kind":"' + kind + '","body":"nonempty Markdown, at most 60000 characters, with inline [S1] markers","unresolvedSourceIssues":[]}',
    'All four root keys are required; no other keys are allowed. kind must be exactly ' + kind + '.',
    'Cite 1-64 distinct IDs supplied in sourceExcerpts directly in body as [S1] or [S1][S2]. Never invent an ID or output a separate citation list/usedSourceIds field: the application derives exact citations from body.',
    'sourceExcerpts is an ordered array of groups. Each group has shared origin metadata and an excerpts array of individual id/text records. An optional range identifies a fragment of a larger source block; without range the record contains its whole parsed block, which may be only a word. Grouping shares metadata only: it does not imply that records are adjacent passages or jointly support a claim. Cite each supporting record by its own ID; never invent group IDs or cite nearby words as support for a whole argument.',
    'unresolvedSourceIssues must be an array of at most 12 objects with exactly code and sourceIds. code is one of source_packet_incomplete, source_support_insufficient, source_formula_unreadable, user_research_missing. sourceIds contains at most 16 supplied IDs and may be empty only when no excerpt can identify the gap.',
    'If no unresolved source issue affects this draft, return unresolvedSourceIssues:[]. For an identified unreadable formula use {"code":"source_formula_unreadable","sourceIds":["S1"]}, replacing S1 with its actual supplied source ID. Do not add description, message or severity fields, or place prose in code/sourceIds. Explain any substantive caveat naturally in body.',
    'Do not emit HTML. Never invent authors, DOI, page numbers, bibliography records, data, experiments, or results.',
  ].join('\n');
  const user = JSON.stringify({
    instruction: payload.goal,
    locale: payload.locale,
    kind,
    researchTitle: source.researchTitle,
    sourceCoverage: packet.coverage,
    sourceExcerpts,
    ...(baseDraft && source.baseDraft ? { userDraft: {
      title: baseDraft.title,
      body: remapWritingDraftCitations(baseDraft.body, source.baseDraft.citations, packet.excerpts),
    } } : {}),
  });
  if (system.length + user.length > 180_000) throw new Error('[blocked] Scientific writing request exceeds the complete document budget');
  const result = await gateway.completeStructured(scientificWritingGuard(kind, allowedSourceIds), [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], {
    ...SCIENTIFIC_SYNTHESIS_OPTIONS,
    maxRetries: 0,
    validationFeedback: (value) => writingValidationIssue(value, kind, allowedSourceIds).feedback,
    validationDiagnostic: (value) => writingValidationIssue(value, kind, allowedSourceIds).diagnostic,
  });
  const body = normalizeWritingCitationMarkers(result.body);
  const citations = materializeWritingCitations(body, writingCitationIds(body), packet.excerpts);
  const review = record(source.extractionResult).scientificReview;
  const reviewStatus = record(review).status;
  const unresolved = !packet.coverage.complete || result.unresolvedSourceIssues.length > 0 || reviewStatus !== 'review_received';
  return {
    summary: payload.locale === 'zh' ? '已生成可编辑的私有科学稿，并绑定到原文引文。' : 'Created an editable private scientific draft with citations bound to the source text.',
    nextSteps: [],
    needsMoreInformation: false,
    writingDraft: {
      title: result.title,
      kind,
      body,
      sourceTaskId: source.sourceTaskId,
      ...(baseDraft ? { baseDraftTaskId: baseDraft.baseDraftTaskId } : {}),
      citations,
      sourceStatus: unresolved ? 'grounded_with_unresolved_review' : 'grounded',
    },
  };
}

export const workspaceGuideResultGuard: SchemaGuard<WorkspaceGuideResult> = (value): value is WorkspaceGuideResult => {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (!hasOnlyKeys(result, ['summary', 'nextSteps', 'needsMoreInformation', 'presentationDraft', 'draftChanges'])) return false;
  if (result.draftChanges !== undefined) {
    if (!result.draftChanges || typeof result.draftChanges !== 'object' || Array.isArray(result.draftChanges)) return false;
    const changes = result.draftChanges as Record<string, unknown>;
    if (!Object.keys(changes).length || !hasOnlyKeys(changes, ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'])
      || !Object.values(changes).every((text) => typeof text === 'string' && text.trim().length > 0 && text.length <= 4_000)
      || JSON.stringify(changes).length > 18_000) return false;
  }
  if (typeof result.summary !== 'string' || result.summary.trim().length === 0 || result.summary.length > 1200) return false;
  if (typeof result.needsMoreInformation !== 'boolean' || !Array.isArray(result.nextSteps) || result.nextSteps.length > 1) return false;
  const validSteps = result.nextSteps.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const step = candidate as Record<string, unknown>;
    return hasOnlyKeys(step, ['label', 'intent', 'targetId'])
      && typeof step.label === 'string'
      && step.label.trim().length > 0
      && step.label.length <= 120
      && typeof step.intent === 'string'
      && INTENTS.has(step.intent as WorkspaceGuideIntent)
      && (step.targetId === undefined || (typeof step.targetId === 'string' && step.targetId.length <= 100));
  });
  if (!validSteps || result.presentationDraft === undefined) return validSteps;
  if (!result.presentationDraft || typeof result.presentationDraft !== 'object' || Array.isArray(result.presentationDraft)) return false;
  const draft = result.presentationDraft as Record<string, unknown>;
  return hasOnlyKeys(draft, ['action', 'instruction', 'style', 'researchObjectId', 'versionId'])
    && (draft.style === undefined || ['technical', 'ink', 'watercolor'].includes(String(draft.style)))
    && ['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(String(draft.action))
    && typeof draft.instruction === 'string'
    && (draft.action === 'scene.image' ? draft.instruction === '' : draft.instruction.trim().length > 0 || draft.action === 'video.create')
    && draft.instruction.length <= 1_000
    && typeof draft.researchObjectId === 'string'
    && draft.researchObjectId.length > 0
    && draft.researchObjectId.length <= 100
    && typeof draft.versionId === 'string'
    && draft.versionId.length > 0
    && draft.versionId.length <= 100;
};

export async function workspaceGuideHandler(
  gateway: AiGateway,
  deps: Pick<AgentDeps, 'prisma'> & { storage?: StorageAdapter },
  task: { id: string; payload: Record<string, unknown>; interestContext?: unknown },
): Promise<WorkspaceGuideResult> {
  const payload = parseWorkspaceGuidePayload(task.payload);
  const interestContext = task.interestContext === undefined || task.interestContext === null
    ? buildInterestContext({ currentGoal: payload.goal })
    : validateInterestContext(task.interestContext);
  if (interestContext.currentGoal !== payload.goal) {
    throw new Error('workspace.guide stored InterestContext goal mismatch');
  }
  const ownerTask = await deps.prisma.agentTask.findUnique({
    where: { id: task.id },
    include: { session: true },
  });
  if (!ownerTask || ownerTask.kind !== 'workspace.guide') throw new Error('workspace.guide 服务端任务上下文无效');
  const userId = ownerTask.session.userId;
  const requestedWriting = writingIntent(payload.goal, Boolean(payload.context.writingDraft));
  if (requestedWriting) {
    if (!deps.storage) throw new Error('[blocked] Scientific writing storage is unavailable');
    return handleScientificWriting(gateway, { prisma: deps.prisma, storage: deps.storage }, task.id, payload, requestedWriting);
  }
  // Conversation history comes from this authenticated session, never client-supplied roles.
  const previousTurns = await deps.prisma.agentTask.findMany({
    where: { sessionId: ownerTask.sessionId, kind: 'workspace.guide', status: 'succeeded', id: { not: task.id }, createdAt: { lt: ownerTask.createdAt } },
    orderBy: { createdAt: 'desc' }, take: 4,
    select: { payload: true, result: true },
  });
  const conversation = previousTurns.reverse().flatMap((turn) => {
    const input = turn.payload as Record<string, unknown> | null;
    const answer = turn.result as Record<string, unknown> | null;
    return typeof input?.goal === 'string' && typeof answer?.summary === 'string'
      ? [{ user: input.goal.slice(0, 1000), hermes: answer.summary.slice(0, 1200) }] : [];
  });
  const editorDraft = payload.context.editorDraft;
  if (editorDraft && ownerTask.session.researchObjectId !== editorDraft.researchObjectId) throw new Error('Workspace editor draft session mismatch');
  const requestedTaskIds = [...new Set(payload.context.tasks.map((item) => item.id))];
  const requestedResearchIds = [...new Set(payload.context.researchObjects.map((item) => item.id))];
  const [trustedTasks, trustedResearch] = await Promise.all([
    deps.prisma.ingestionTask.findMany({
      where: {
        id: { in: requestedTaskIds },
        batch: { userId, researchObject: { workspace: { members: { some: { userId } } } } },
      },
      include: { batch: true },
    }),
    deps.prisma.researchObject.findMany({
      where: { id: { in: requestedResearchIds }, workspace: { members: { some: { userId } } } },
      select: { id: true, title: true, status: true, sdfDocument: { select: { coreJson: true } } },
    }),
  ]);
  if (trustedTasks.length !== requestedTaskIds.length || trustedResearch.length !== requestedResearchIds.length) {
    throw new Error('workspace.guide 客户端上下文未通过服务端授权');
  }
  const trustedPayload: WorkspaceGuidePayload = {
    ...payload,
    context: {
      tasks: trustedTasks.map((item) => ({
        id: item.id,
        researchObjectId: item.batch.researchObjectId,
        state: item.state,
      })),
      researchObjects: trustedResearch.map((item) => ({ id: item.id, title: item.title, status: item.status })),
      ...(payload.context.presentation ? { presentation: payload.context.presentation } : {}),
    },
  };
  const requestedPresentation = trustedPayload.context.presentation;
  if (requestedPresentation && (ownerTask.session.researchObjectId !== requestedPresentation.researchObjectId
    || !trustedResearch.some((research) => research.id === requestedPresentation.researchObjectId))) {
    throw new Error('workspace.guide presentation scope must match the authorized session research object');
  }
  const presentationVersion = requestedPresentation
    ? await deps.prisma.version.findFirst({
        where: {
          researchObjectId: requestedPresentation.researchObjectId,
          ...(requestedPresentation.versionId ? { id: requestedPresentation.versionId } : {}),
          ...(!requestedPresentation.versionId ? { status: 'draft' as const } : {}),
        },
        select: { id: true, researchObjectId: true, manifest: { select: { coreJson: true } } },
        ...(!requestedPresentation.versionId ? { orderBy: { versionNo: 'desc' as const } } : {}),
      })
    : null;
  if (requestedPresentation && !presentationVersion) throw new Error('workspace.guide presentation version 未通过服务端授权');
  const currentPlans = presentationVersion ? await deps.prisma.presentationAsset.findMany({
    where: { researchObjectId: presentationVersion.researchObjectId, versionId: presentationVersion.id,
      kind: 'interactive_html', status: { in: ['draft', 'approved'] } },
    select: { status: true, updatedAt: true, provenance: true }, orderBy: { updatedAt: 'desc' }, take: 8,
  }) : [];
  const planState = currentPlans.flatMap((asset) => {
    const provenance = asset.provenance && typeof asset.provenance === 'object' && !Array.isArray(asset.provenance) ? asset.provenance : {};
    if (!('storyboardDocument' in provenance)) return [];
    return [{ status: asset.status, updatedAt: asset.updatedAt.toISOString() }];
  });
  const taskIds = trustedPayload.context.tasks.map((item) => item.id);
  const researchObjectIds = trustedPayload.context.researchObjects.map((item) => item.id);
  let system = payload.locale === 'zh'
    ? [
        editorDraft ? '你是 OpenScience 的 Hermes 工作台共编助手，按用户明确的编辑要求修改当前草稿；仅咨询时给建议。' : '你是 OpenScience 的 Hermes 科研引导员。根据给定的真实研究对象字段，指出最重要的审核或补充事项，并只提供安全导航。',
        '不得声称已经执行写入、删除、合并、发布或权限变更。不得杜撰上下文中没有的事实。',
        'target 指明用户正在讨论的界面或段落；sdf-* 对应给定 core 字段，其中 sdf-evidence 对应 reproducibility。优先回应所选段落；target 为 null 时不得假定用户选择了某一段。',
        'InterestContext 仅用于排序关注点；rejectedSignals 是明确排除项，不得反向推断敏感属性或站外行为。',
        `只输出一个 JSON 对象，必填根字段为 summary（非空字符串）、nextSteps（数组）、needsMoreInformation（boolean）；可选字段为 presentationDraft${editorDraft ? '、draftChanges' : ''}。不适用的可选字段必须省略，不得填 null。禁止Markdown或JSON外的文字。`,
        'nextSteps 最多 1 项；每项只能包含 label、intent、targetId，禁止 title、description 或其他字段。',
        '仅当 presentationContext 存在且用户目标适合用讲解分镜表达时，才输出 presentationDraft；它包含 action、instruction、researchObjectId、versionId，可选 style（technical、ink、watercolor）。action 根据请求选择 storyboard.create、storyboard.revise、scene.image 或 video.create，两个 id 必须逐字使用 presentationContext，instruction 必须是基于给定版本字段的可编辑分镜指令，不得声称已生成、批准或发布。不得输出主张或来源 id。',
        'intent 只能是 open-task、open-ro、start-import、prepare-publication、review-media。除 start-import 外必须带授权 targetId；start-import 必须省略 targetId。',
        `open-task 只能使用下列 task id：${taskIds.length ? taskIds.join(', ') : '（无；禁止输出 open-task）'}。`,
        `open-ro 只能使用下列 research object id：${researchObjectIds.length ? researchObjectIds.join(', ') : '（无；禁止输出 open-ro）'}。`,
        editorDraft ? '编辑输出示例（实际仅修改用户要求的字段）：{"summary":"已给出问题字段的精炼草稿。","nextSteps":[],"needsMoreInformation":false,"draftChanges":{"problem":"完整替换文本"}}' : '严格示例：{"summary":"审核结论与缺口","nextSteps":[{"label":"打开研究对象复核","intent":"open-ro","targetId":"允许的 id"}],"needsMoreInformation":true}',
      ].join('\n')
    : [
        editorDraft ? 'You are Hermes, the OpenScience workbench co-editor. Revise the current draft for explicit editing requests; give advice without edits for questions.' : 'You are Hermes, the OpenScience research guide. Review the supplied real research-object fields, identify the most important verification or completion work, and provide safe navigation only.',
        'Never claim to have written, deleted, merged, published, or changed permissions. Do not invent facts absent from the context.',
        'target identifies the selected interface or passage; sdf-* refers to the supplied core field, except sdf-evidence means reproducibility. Prioritize the selected passage; null means no passage was selected.',
        'Use InterestContext only to prioritize attention. rejectedSignals are explicit exclusions; never infer sensitive traits or off-site behavior.',
        `Return exactly one JSON object. Required keys: summary (nonempty string), nextSteps (array), needsMoreInformation (boolean). Optional keys: presentationDraft${editorDraft ? ', draftChanges' : ''}. Omit unused optional keys; never set them to null. No Markdown or text outside JSON.`,
        'nextSteps has at most one item. It may contain only label, intent, and targetId; title and description are forbidden.',
        'Emit presentationDraft only when presentationContext exists and the goal benefits from an explanatory storyboard. It contains action, instruction, researchObjectId, versionId, and optional style (technical, ink, watercolor). action must match the request: storyboard.create, storyboard.revise, scene.image or video.create; copy both ids exactly from presentationContext. instruction is an editable storyboard brief grounded in the supplied version fields. Never claim it was generated, approved, or published, and never emit Claim or source ids.',
        'intent must be open-task, open-ro, start-import, prepare-publication or review-media. All except start-import require an authorized targetId; start-import must omit targetId.',
        `open-task may use only these task ids: ${taskIds.length ? taskIds.join(', ') : '(none; do not emit open-task)'}.`,
        `open-ro may use only these research object ids: ${researchObjectIds.length ? researchObjectIds.join(', ') : '(none; do not emit open-ro)'}.`,
        editorDraft ? 'Editing example (change only the fields actually requested): {"summary":"Proposed a concise problem statement.","nextSteps":[],"needsMoreInformation":false,"draftChanges":{"problem":"Full replacement text"}}' : 'Exact example: {"summary":"Review finding and gap","nextSteps":[{"label":"Open the research object","intent":"open-ro","targetId":"an allowed id"}],"needsMoreInformation":true}',
      ].join('\n');
  if (editorDraft) system += '\n' + (payload.locale === 'zh'
    ? '你同时是当前工作台的共编助手。editorDraft是用户此刻正在编辑的草稿，不是新证据。用户明确要求改写、凝练、翻译或调整内容时，可额外输出draftChanges：只包含实际改动的六字段键与完整替换文本。咨询、评价、导航不改稿。保留科学条件、公式、单位、限制和来源含义，不编造论文内容；证据不足时解释，不用猜测填充。除draftChanges外上述根字段限制保持。summary说明改了什么，不能声称已保存、定稿或发布。不得修改未要求的字段；只修改草稿，最终定稿另行确认。'
    : 'You also co-edit the active workbench. editorDraft is the current user draft, not new evidence. Only for an explicit revision, condensation, translation or editing request may you add draftChanges, containing only changed SDF field keys and full replacement text. Questions, review and navigation do not edit. Preserve scientific conditions, equations, units, limitations and source meaning; never invent paper content. Explain insufficient evidence instead of filling guesses. All other root restrictions remain. Summarize changes without claiming they were saved, confirmed or published. Do not change unrequested fields.');
  if (editorDraft) system += '\n' + 'draftChanges must be a JSON object, never an array or JSON Patch. Allowed keys: problem, insight, method, results, limitations, reproducibility. Each value is the full replacement string (1–4000 characters); use English keys even when the text is Chinese. Omit unchanged fields. For a completed edit set needsMoreInformation=false and nextSteps=[].';
  system += '\n' + [
    'Keep summary to one or two short reader-facing sentences describing the actual proposed change or next action. Do not repeat the user request or copy production instructions into summary: detailed AI-facing content belongs only in presentationDraft.instruction. Do not claim a requested length or scientific check was satisfied unless the returned content actually satisfies it. When condensing research prose, preserve the causal mechanism and scope, remove incidental parameter lists when requested, and never broaden findings from a specified case into a general law.',
    'An additional nextSteps intent review-media opens the current research object media/plan review in this conversation. Use it when the user wants to review, adopt, reject or inspect existing images, videos or plans; targetId must be the CURRENT authorized research object id. This only opens review; it never approves an asset itself. For an explicit request to generate from the already approved plan without changing any instruction, use scene.image or video.create with instruction=""; if the user requests any revision, use storyboard.revise with a full nonempty instruction. Never represent a plan task as a completed image or video.',
    'For presentationDraft, one additional optional field style is allowed: technical, ink, or watercolor. Infer it from the user request and conversation; use technical only when no preference is expressed. Put any more specific visual preference into instruction. Do not ask users to choose routine parameters or return a list of buttons. For a pure style change prepare a revised instruction for the current media request. Do not combine draftChanges with presentationDraft or prepare-publication in one response: finish edits first so the next operation uses the displayed draft.',
    'Conversation history contains prior user requests and assistant proposals, not new evidence or proof that actions completed. Resolve follow-up requests using it, but prefer the current draft and version context.',
    'For images, action names the NEXT actual operation: storyboard.create or storyboard.revise REQUIRES a complete nonempty instruction (maximum 1000 characters); scene.image REQUIRES instruction="" exactly to use the existing approved plan unchanged. Never repeat an approved brief in instruction when generating from it. Consult presentationContext.planState: create an image plan if none exists, revise when the user requests changes, and use scene.image only for an explicit request to execute an approved plan unchanged. For video preserve the existing flow: video.create with a complete nonempty instruction prepares a missing/revised video plan; video.create with instruction="" executes an approved video plan unchanged. A plan-only request must not generate media. Questions about capabilities or negated requests must not return an action. Never invent completed assets.',
    'nextSteps may also contain prepare-publication, only for an explicit request to prepare or publish the CURRENT research object. Use its authorized id as targetId; this opens the final preview only and never publishes. Never claim publication has happened. When preparing production or publication, set needsMoreInformation=false only if the request is clear; otherwise explain the concrete question without an action.',
  ].join('\n');
  const userMessageBudget = Math.max(0, 30_000 - system.length);
  const serializeUser = (maxCharsPerField: number) => JSON.stringify({
    goal: trustedPayload.goal,
    route: trustedPayload.route,
    target: trustedPayload.target,
    conversation,
    interestContext,
    context: {
      tasks: trustedPayload.context.tasks,
      ...(editorDraft ? { editorDraft } : {}),
      researchObjects: trustedResearch.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        core: boundedCore(item.sdfDocument?.coreJson, maxCharsPerField),
      })),
      ...(presentationVersion ? {
        presentationContext: {
          researchObjectId: presentationVersion.researchObjectId,
          versionId: presentationVersion.id,
          planState,
          core: boundedCore(presentationVersion.manifest?.coreJson, maxCharsPerField),
        },
      } : {}),
    },
  });
  let lower = 0;
  let upper = 1_200;
  let user = serializeUser(0);
  while (user.length > userMessageBudget && conversation.length) {
    conversation.shift();
    user = serializeUser(0);
  }
  if (user.length > userMessageBudget) throw new Error('workspace.guide trusted context exceeds model budget');
  while (lower <= upper) {
    const candidateLimit = Math.floor((lower + upper) / 2);
    const candidate = serializeUser(candidateLimit);
    if (candidate.length <= userMessageBudget) {
      user = candidate;
      lower = candidateLimit + 1;
    } else {
      upper = candidateLimit - 1;
    }
  }
  const result = await gateway.completeStructured(workspaceGuideResultGuard, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], {
    ...(editorDraft ? SCIENTIFIC_SYNTHESIS_OPTIONS : { temperature: 0.2 }),
    validationFeedback: () => 'The previous JSON did not match the output contract. For scene.image instruction MUST be exactly "" to execute an approved image plan unchanged. For image changes use storyboard.revise with a complete nonempty instruction; for a new image plan use storyboard.create. Do not mix image execution and plan instructions. Video.create retains its existing empty-approved/nonempty-plan instruction flow. Return summary as a nonempty string (max 1200 characters), nextSteps as an array with at most one {label,intent,targetId} entry, and needsMoreInformation as a boolean. Omit unused optional fields; no nulls, patches, wrappers or extra keys. '
      + (editorDraft ? 'For editing use nextSteps:[], needsMoreInformation:false and draftChanges:{problem:"full text"} with only requested English field keys (problem,insight,method,results,limitations,reproducibility); string values only, max 4000 characters each, max 18000 in total. Omit presentationDraft unless a valid presentationContext exists.'
        : 'The only optional root key is presentationDraft; include it only for an applicable presentationContext, with action, instruction, researchObjectId, versionId and optional style. Never emit draftChanges or edits. Navigation intent must be open-task, open-ro, start-import, prepare-publication or review-media and use only authorized IDs.'),
    validationDiagnostic: (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return 'guide:root';
      const shape = value as Record<string, unknown>;
      const issues: string[] = [];
      if (!hasOnlyKeys(shape, ['summary', 'nextSteps', 'needsMoreInformation', 'presentationDraft', 'draftChanges'])) issues.push('root_keys');
      if (typeof shape.summary !== 'string' || !shape.summary.trim() || shape.summary.length > 1200) issues.push('summary');
      if (typeof shape.needsMoreInformation !== 'boolean') issues.push('needs_more_information');
      if (!Array.isArray(shape.nextSteps) || shape.nextSteps.length > 1) issues.push('next_steps');
      if (shape.draftChanges !== undefined && (!shape.draftChanges || typeof shape.draftChanges !== 'object' || Array.isArray(shape.draftChanges))) issues.push('draft_shape');
      if (shape.presentationDraft === null) issues.push('presentation_null');
      return 'guide:' + (issues.join(',') || 'nested_fields');
    },
  });
  const allowedTaskIds = new Set(taskIds);
  const allowedResearchObjectIds = new Set(researchObjectIds);
  const invalidTarget = result.nextSteps.some((step) => (
    (step.intent === 'open-task' && (!step.targetId || !allowedTaskIds.has(step.targetId)))
    || (step.intent === 'open-ro' && (!step.targetId || !allowedResearchObjectIds.has(step.targetId)))
    || (step.intent === 'start-import' && step.targetId !== undefined)
    || (['prepare-publication', 'review-media'].includes(step.intent) && (!step.targetId || step.targetId !== ownerTask.session.researchObjectId || !allowedResearchObjectIds.has(step.targetId)))
  ));
  if (invalidTarget) throw new Error('workspace.guide result target 不在允许的上下文中');
  if (result.presentationDraft && (!presentationVersion
    || result.presentationDraft.researchObjectId !== presentationVersion.researchObjectId
    || result.presentationDraft.versionId !== presentationVersion.id)) {
    throw new Error('workspace.guide presentation draft 不在允许的版本上下文中');
  }
  if (result.draftChanges) {
    if (!editorDraft || result.needsMoreInformation) throw new Error('No applicable workspace draft changes');
    const { draftChanges, ...answer } = result;
    return { ...answer, draftEdit: { base: editorDraft, changes: draftChanges } };
  }
  return result;
}

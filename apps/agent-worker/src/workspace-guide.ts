import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import type { StorageAdapter } from '@openscience/storage';
import {
  buildInterestContext,
  parseWorkspaceGuidePayload,
  presentationStoryboardView,
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
    /** Free-form style id; resolved against the installed catalogue server-side. */
    style?: string;
    instruction: string;
    researchObjectId: string;
    versionId: string;
    revisionMode?: 'art';
    baseAssetId?: string;
    figurePlan?: { figures: Array<{ id: string; decision: 'reuse' | 're-render' | 'abstract' | 'skip'; styleId?: string; caption?: string }> };
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

interface TrustedFigureAuditPlan {
  figures: Array<{ id: string; decision: 'reuse' | 're-render' | 'abstract' | 'skip'; styleId?: string; caption?: string }>;
  style?: string;
  auditedAt?: string;
}

async function readTrustedFigureAuditPlan(
  prisma: AgentDeps['prisma'],
  userId: string,
  presentationVersion: { id: string; researchObjectId: string },
): Promise<TrustedFigureAuditPlan | undefined> {
  // Take the latest succeeded figure-audit task and apply three independent
  // ownership/scope checks before exposing its plan. Anything that does not
  // pass is treated as if no plan exists; we never partially expose data.
  const auditTask = await prisma.agentTask.findFirst({
    where: { kind: 'presentation.figure-audit', status: 'succeeded' },
    orderBy: { createdAt: 'desc' },
    select: {
      payload: true,
      result: true,
      createdAt: true,
      session: { select: { userId: true, researchObjectId: true } },
    },
  });
  if (!auditTask) return undefined;
  if (auditTask.session?.userId !== userId) return undefined;
  if (auditTask.session.researchObjectId !== presentationVersion.researchObjectId) return undefined;
  const payload = auditTask.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const payloadObj = payload as Record<string, unknown>;
  if (payloadObj.researchObjectId !== presentationVersion.researchObjectId) return undefined;
  if (payloadObj.versionId !== presentationVersion.id) return undefined;
  const result = auditTask.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  // Worker dispatcher stores the handler's return value verbatim into
  // task.result. The presentation.figure-audit handler returns
  // `{ result: FigureAuditResult }`, so task.result.result.figurePlan is
  // where the plan actually lives. Fall back to the unwrapped shape too,
  // because future task kinds may return FigureAuditResult directly.
  const resultObj = result as Record<string, unknown>;
  const inner = (typeof resultObj.result === 'object' && resultObj.result !== null && !Array.isArray(resultObj.result))
    ? resultObj.result as Record<string, unknown>
    : resultObj;
  const plan = inner.figurePlan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return undefined;
  const planObj = plan as Record<string, unknown>;
  if (!Array.isArray(planObj.figures)) return undefined;
  const figures: TrustedFigureAuditPlan['figures'] = [];
  for (const entry of planObj.figures.slice(0, 12)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) return undefined;
    if (item.decision !== 'reuse' && item.decision !== 're-render' && item.decision !== 'abstract' && item.decision !== 'skip') {
      return undefined;
    }
    figures.push({
      id: item.id,
      decision: item.decision,
      ...(typeof item.styleId === 'string' && item.styleId.trim() ? { styleId: item.styleId } : {}),
      ...(typeof item.caption === 'string' ? { caption: item.caption } : {}),
    });
  }
  if (!figures.length) return undefined;
  return {
    figures,
    ...(typeof inner.style === 'string' && inner.style.trim() ? { style: inner.style } : {}),
    auditedAt: auditTask.createdAt.toISOString(),
  };
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
    origin: Pick<typeof packet.excerpts[number]['origin'], 'kind' | 'parser'>;
    excerpts: Array<{ id: string; text: string; confidence?: number; range?: typeof packet.excerpts[number]['range'] }>;
  }> = [];
  for (const excerpt of packet.excerpts) {
    let group = sourceExcerpts.at(-1);
    if (!group || group.origin.kind !== excerpt.origin.kind || group.origin.parser !== excerpt.origin.parser) {
      group = { origin: { kind: excerpt.origin.kind, parser: excerpt.origin.parser }, excerpts: [] };
      sourceExcerpts.push(group);
    }
    group.excerpts.push({
      id: excerpt.id,
      text: excerpt.text,
      ...(excerpt.origin.confidence !== undefined ? { confidence: excerpt.origin.confidence } : {}),
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
    'sourceExcerpts is an ordered array of groups. Each group has shared origin kind/parser metadata and an excerpts array of individual id/text records. An optional confidence belongs only to that individual excerpt, never to its group or another excerpt; it is a parser score, not scientific verification. An optional range identifies a fragment of a larger source block; without range the record contains its whole parsed block, which may be only a word. Grouping shares metadata only: it does not imply that records are adjacent passages or jointly support a claim. Cite each supporting record by its own ID; never invent group IDs or cite nearby words as support for a whole argument.',
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
  return hasOnlyKeys(draft, ['action', 'instruction', 'style', 'researchObjectId', 'versionId', 'revisionMode', 'baseAssetId', 'figurePlan'])
    && ((draft.revisionMode === undefined && draft.baseAssetId === undefined)
      || (draft.action === 'storyboard.revise' && draft.revisionMode === 'art'
        && typeof draft.baseAssetId === 'string' && draft.baseAssetId.length > 0 && draft.baseAssetId.length <= 100))
    && (draft.style === undefined || (typeof draft.style === 'string' && draft.style.trim().length > 0 && draft.style.length <= 100))
    && ['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(String(draft.action))
    && typeof draft.instruction === 'string'
    && (draft.action === 'scene.image' ? draft.instruction === '' : draft.instruction.trim().length > 0 || draft.action === 'video.create')
    && draft.instruction.length <= 1_000
    && typeof draft.researchObjectId === 'string'
    && draft.researchObjectId.length > 0
    && draft.researchObjectId.length <= 100
    && typeof draft.versionId === 'string'
    && draft.versionId.length > 0
    && draft.versionId.length <= 100
    && (draft.figurePlan === undefined || (typeof draft.figurePlan === 'object' && draft.figurePlan !== null && !Array.isArray(draft.figurePlan)
        && hasOnlyKeys(draft.figurePlan as Record<string, unknown>, ['figures'])
        && Array.isArray((draft.figurePlan as { figures?: unknown }).figures)
        && (draft.figurePlan as { figures: unknown[] }).figures.length >= 1
        && (draft.figurePlan as { figures: unknown[] }).figures.length <= 12
        && (draft.figurePlan as { figures: unknown[] }).figures.every(raw => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
          const figure = raw as Record<string, unknown>;
          return hasOnlyKeys(figure, ['id', 'decision', 'styleId', 'caption'])
            && typeof figure.id === 'string' && Boolean(figure.id.trim()) && figure.id.length <= 200
            && typeof figure.decision === 'string' && ['reuse', 're-render', 'abstract', 'skip'].includes(figure.decision)
            && (figure.styleId === undefined || (typeof figure.styleId === 'string' && Boolean(figure.styleId.trim()) && figure.styleId.length <= 100))
            && (figure.caption === undefined || (typeof figure.caption === 'string' && figure.caption.length <= 200));
        })));
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
        artifact: { deletedAt: null }, OR: [{ agentTaskId: null }, { agentTask: { deletedAt: null } }], batch: { userId, researchObject: { deletedAt: null, workspace: { members: { some: { userId } } } } },
      },
      include: { batch: true },
    }),
    deps.prisma.researchObject.findMany({
      where: { id: { in: requestedResearchIds }, deletedAt: null, workspace: { members: { some: { userId } } } },
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
      kind: 'interactive_html', deletedAt: null, status: { in: ['draft', 'approved'] } },
    select: { id: true, kind: true, status: true, updatedAt: true, provenance: true,
      sourceClaims: { select: { claimId: true, claim: { select: { extractionStatus: true } } } } },
    orderBy: { updatedAt: 'desc' }, take: 9,
  }) : [];
  const planStateTruncated = currentPlans.length > 8;
  const figureAuditPlan = presentationVersion
    ? await readTrustedFigureAuditPlan(deps.prisma, userId, presentationVersion)
    : undefined;
  const planState = currentPlans.slice(0, 8).flatMap((asset) => {
    const view = presentationStoryboardView(asset, asset.sourceClaims.map((source) => source.claimId));
    if (!view) return [];
    const artRevisionEligible = view.output === 'image' && view.locale === payload.locale
      && asset.sourceClaims.length > 0 && asset.sourceClaims.length <= 12
      && asset.sourceClaims.every((source) => source.claim.extractionStatus === 'succeeded')
      && view.document.scenes.every((scene) => scene.illustration?.schemaVersion === 2 && !scene.paperOriginal);
    return [{ id: asset.id, title: view.document.title, status: asset.status, updatedAt: asset.updatedAt.toISOString(),
      style: view.style, output: view.output, ...(view.figurePlan ? { figurePlan: view.figurePlan } : {}), artRevisionEligible }];
  });
  const artBaseIds = new Set(planState.filter((plan) => plan.artRevisionEligible).map((plan) => plan.id));
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
        '仅当 presentationContext 存在且用户目标适合用讲解分镜表达时，才输出 presentationDraft；它包含 action、instruction、researchObjectId、versionId，以及 style（storyboard.create 必填非空字符串，其他动作按后述条件可选；任何已安装的 illustration id，兼容旧值 technical/ink/watercolor；目录还含 knolling、subway-map、hand-drawn-edu、sketch-notes、editorial、minimal、technical-schematic、storybook-watercolor、vector-illustration、blueprint、chalkboard 等），可选 figurePlan；纯艺术修订可按后述条件同时附 revisionMode、baseAssetId。action 根据请求选择 storyboard.create、storyboard.revise、scene.image 或 video.create，研究对象与版本 id 必须逐字使用 presentationContext。storyboard.create 必须根据原始 goal 与对话中明确的风格偏好填写 style，只有用户未表达偏好时才用 scientific；不得依赖界面默认值。普通规划的 instruction 基于给定版本字段；纯艺术修订的 instruction 必须逐字复制当前 goal，由既有艺术规划器设计。不得声称已生成、批准或发布。不得输出主张或来源 id。figurePlan 仅在用户明确要求为论文图做 reuse / re-render / abstract / skip 计划时输出；它的形状是对象 {"figures":[{id, decision, 可选 styleId, 可选 caption}]}（1-12 项），figurePlan 本身**不是数组**。不要自造 figure id，直接抄用户的。如果 presentationContext.figureAuditPlan 存在且用户明确要按图清单生成或重画论文图，把 figureAuditPlan.figures 整体复制到 presentationDraft.figurePlan.figures（每项保持 id/decision/styleId/caption），不要丢项也不要新造。',
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
        'Emit presentationDraft only when presentationContext exists and the goal benefits from an explanatory storyboard. It contains action, instruction, researchObjectId, versionId, and style (required and nonempty for storyboard.create, optional for other actions under the rules below; any installed illustration id — legacy aliases `technical`/`ink`/`watercolor` still resolve; the catalogue also has `knolling`, `subway-map`, `hand-drawn-edu`, `sketch-notes`, `editorial`, `minimal`, `technical-schematic`, `storybook-watercolor`, `vector-illustration`, `blueprint`, `chalkboard`, etc.), optional figurePlan, and the optional paired revisionMode/baseAssetId for art-only revisions under the rules below. action must match the request: storyboard.create, storyboard.revise, scene.image or video.create; copy research-object and version ids exactly from presentationContext. For storyboard.create, select an explicit style from the original goal and conversation preferences; use scientific only when no preference is expressed, never rely on a UI default. Ordinary planning instructions are grounded in the supplied version fields; art-only instructions must copy the current goal verbatim for the existing art planner to design. figurePlan is an optional audit the figure auditor emits; its shape is an object {"figures":[{id, decision, optional styleId, optional caption}]} with 1-12 entries and it is NEVER a bare array. Only emit it when the user explicitly asks to plan a paper\'s figures (reuse / re-render / abstract / skip) and supplies figure ids. Do not invent figure ids; copy from the user. When presentationContext.figureAuditPlan is present and the user explicitly asks to generate or re-render the paper\'s figures, copy figureAuditPlan.figures verbatim into presentationDraft.figurePlan.figures (each entry keeps id, decision, styleId, caption); do not drop or invent entries. Never claim it was generated, approved, or published, and never emit Claim or source ids.',
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
    'For storyboard.create, style is required and explicitly names one of the installed illustration style ids (the catalogue includes `scientific`, `ink-notes`, `watercolor`, `sketch-notes`, `editorial`, `minimal`, `knolling`, `technical-schematic`, `hand-drawn-edu`, `subway-map`, `storybook-watercolor`, `morandi-journal`, `vintage`, `retro`, `vector-illustration`, `chalkboard`, `blueprint`, etc.). The legacy aliases `technical` (= `scientific`), `ink` (= `ink-notes`), and `watercolor` still resolve correctly. Select the style from the original goal and conversation; use `scientific` only when no preference is expressed. For other presentationDraft actions, style remains optional. For revisionMode:"art", emit style only when the user explicitly requests a different rendering family (for example scientific, editorial or watercolor); for palette, composition, material or typography changes alone OMIT style to retain the selected base plan and its per-figure styles. Do not infer another family from palette words such as 深墨色 or dark ink color. For an explicit per-figure restyling, copy the selected base plan figurePlan and change only the requested styleId values; preserve figure ids, order, decisions and captions. Otherwise omit figurePlan so the server preserves the base mapping. The current goal is passed verbatim to the art planner and controls the actual treatment. These are broad rendering families, not an exhaustive list of artistic directions: editorial, atlas, material, typography, composition and other specific preferences belong in instruction. Do not ask users to choose routine parameters or return a list of buttons. Do not combine draftChanges with presentationDraft or prepare-publication in one response: finish edits first so the next operation uses the displayed draft.',
    'For an explicit art-only revision of an existing image plan, presentationDraft may additionally contain revisionMode:"art" and baseAssetId together, with action:"storyboard.revise". Use this only when the user asks solely to change visual style, colors, composition, material or text styling while retaining the scientific content. A request to change, correct, add or remove scientific claims, mechanisms, evidence, equations, axis definitions or values, label wording or meaning, narration, language or scene content is an ordinary revision: omit BOTH fields even if it also mentions style. Ambiguous revision scope must not be treated as art-only. For art-only you are only routing the request: copy the current goal exactly into instruction, without expanding, summarizing or adding scientific or visual details. The existing art planner designs from this request and the bound scientific base. If goal exceeds 1000 characters, ask for a shorter art request with needsMoreInformation:true and no presentationDraft; never truncate it or produce another brief.',
    'For art-only, copy baseAssetId from a presentationContext.planState entry with artRevisionEligible:true. Choose only a plan unambiguously identified by the user (id, title or distinguishing description), or the sole existing image plan when planStateTruncated is false. Never pick a plan merely because it is newest. Multiple possible bases, an unidentified older base outside this bounded list, or no eligible base require a concise clarification with needsMoreInformation:true and no presentationDraft; do not silently substitute a different plan or replan science. A prior assistant proposal is not proof of a completed plan. Include the chosen plan title and requested visual change in summary so the user can review the scope.',
    'Conversation history contains prior user requests and assistant proposals, not new evidence or proof that actions completed. Resolve follow-up requests using it, but prefer the current draft and version context.',
    'For images, action names the NEXT actual operation: storyboard.create or storyboard.revise REQUIRES a complete nonempty instruction (maximum 1000 characters); scene.image REQUIRES instruction="" exactly to use the existing approved plan unchanged. Never repeat an approved brief in instruction when generating from it. Consult presentationContext.planState: create an image plan if none exists, revise when the user requests changes, and use scene.image only for an explicit request to execute an approved plan unchanged. For video preserve the existing flow: video.create with a complete nonempty instruction prepares a missing/revised video plan; video.create with instruction="" executes an approved video plan unchanged. A plan-only request must not generate media. Questions about capabilities or negated requests must not return an action. Never invent completed assets.',
    'nextSteps may also contain prepare-publication, only for an explicit request to prepare or publish the CURRENT research object. Use its authorized id as targetId; this opens the final preview only and never publishes. Never claim publication has happened. When preparing production or publication, set needsMoreInformation=false only if the request is clear; otherwise explain the concrete question without an action.',
    'For art-only revisions, follow the selected base plan rules above; never substitute figureAuditPlan for the base mapping. For ordinary figure planning, presentationContext.figureAuditPlan, when present, is the latest figure-audit verdict for the SAME research object and version: each entry {id, decision, optional styleId, optional caption} labels a paper figure for reuse / re-render / abstract / skip. It is NOT a generated asset; it only becomes a real image plan once the user confirms and you emit presentationDraft with figurePlan. It is distinct from planState, which lists already-generated assets. If the user asks for a figure-by-figure generation plan for the paper, set presentationDraft.figurePlan to an object of the exact shape {"figures":[...]} and copy figureAuditPlan.figures into that figures key verbatim. presentationDraft.figurePlan must NEVER be a bare array: figureAuditPlan.figures is the array, figurePlan wraps it under the key "figures". Otherwise omit figurePlan.',
    'When figureAuditPlan is present and the user requests a figure-driven storyboard, presentationDraft.instruction MUST stay <= 1000 characters: describe only the visual treatment, composition, palette and material of the planned scenes, never repeat the figure captions or rationale (those already live in figurePlan.figures[i].caption). Do not pad instruction with paper content; the existing art planner composes from the bound scientific base and your brief.',
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
          planStateTruncated,
          ...(figureAuditPlan ? { figureAuditPlan } : {}),
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
  const artFigurePlanMatchesBase = (draft: WorkspaceGuideResult['presentationDraft']): boolean => {
    if (draft?.revisionMode !== 'art' || !draft.figurePlan) return true;
    const baseFigures = planState.find(plan => plan.id === draft.baseAssetId)?.figurePlan?.figures;
    return Boolean(baseFigures && new Set(draft.figurePlan.figures.map(figure => figure.id)).size === draft.figurePlan.figures.length
      && draft.figurePlan.figures.every(figure => baseFigures.some(base => base.id === figure.id
        && base.decision === figure.decision && base.caption === figure.caption)));
  };
  const resultGuard: SchemaGuard<WorkspaceGuideResult> = (value): value is WorkspaceGuideResult => workspaceGuideResultGuard(value)
    // New plans must carry the model's style choice; stored legacy drafts stay readable.
    && (value.presentationDraft?.action !== 'storyboard.create' || Boolean(value.presentationDraft.style?.trim()))
    && (!value.presentationDraft || Boolean(presentationVersion
      && value.presentationDraft.researchObjectId === presentationVersion.researchObjectId
      && value.presentationDraft.versionId === presentationVersion.id))
    && (value.presentationDraft?.revisionMode !== 'art' || artBaseIds.has(value.presentationDraft.baseAssetId!))
    && artFigurePlanMatchesBase(value.presentationDraft);
  // (force rebuild 2026-09-17)
  // Diagnose fixed field names only: rejected user/model text and identifiers must not enter logs.
  const validationDiagnostic = (value: unknown): string => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'guide:root_shape';
    if (workspaceGuideResultGuard(value) && !artFigurePlanMatchesBase(value.presentationDraft))
      return 'guide:art_figureplan_must_match_base_only_style_id_may_change';
    const shape = value as Record<string, unknown>;
    const issues: string[] = [];
    const textIssue = (field: string, text: unknown, max: number, allowEmpty = false) => {
      if (typeof text !== 'string') issues.push(`${field}_type`);
      else {
        if (!allowEmpty && !text.trim()) issues.push(`${field}_empty`);
        if (text.length > max) issues.push(`${field}_length_${text.length}_max_${max}`);
      }
    };
    if (!hasOnlyKeys(shape, ['summary', 'nextSteps', 'needsMoreInformation', 'presentationDraft', 'draftChanges'])) issues.push('root_keys');
    textIssue('summary', shape.summary, 1200);
    if (typeof shape.needsMoreInformation !== 'boolean') issues.push('needs_more_information_type');
    if (shape.presentationDraft !== undefined) {
      const draft = shape.presentationDraft;
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) issues.push('presentation_shape');
      else {
        const item = draft as Record<string, unknown>;
        if (!hasOnlyKeys(item, ['action', 'instruction', 'style', 'researchObjectId', 'versionId', 'revisionMode', 'baseAssetId', 'figurePlan'])) issues.push('presentation_keys');
        if (typeof item.action !== 'string') issues.push('presentation_action_type');
        else if (!['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(item.action)) issues.push('presentation_action_enum');
        if (item.action === 'storyboard.create' && item.style === undefined) issues.push('presentation_style_required_for_storyboard_create');
        if (item.style !== undefined) {
          if (typeof item.style !== 'string' || !item.style.trim() || item.style.length > 100) issues.push('presentation_style_type');
        }
        textIssue('presentation_instruction', item.instruction, 1000, item.action === 'scene.image' || item.action === 'video.create');
        if (item.action === 'scene.image' && typeof item.instruction === 'string' && item.instruction !== '') issues.push('presentation_instruction_must_be_empty');
        if (item.revisionMode !== undefined || item.baseAssetId !== undefined) {
          if (item.revisionMode === undefined || item.baseAssetId === undefined) issues.push('presentation_art_pair');
          if (item.revisionMode !== 'art') issues.push('presentation_revision_mode_art_required');
          if (item.action !== 'storyboard.revise') issues.push('presentation_art_action_revise_required');
          textIssue('presentation_base_asset_id', item.baseAssetId, 100);
          if (item.revisionMode === 'art' && typeof item.baseAssetId === 'string' && !artBaseIds.has(item.baseAssetId)) issues.push('presentation_base_asset_id_ineligible');
        }
        textIssue('presentation_research_object_id', item.researchObjectId, 100);
        textIssue('presentation_version_id', item.versionId, 100);
        // figurePlan must be an object {"figures":[...]}. Without this check a
        // bare array produced an empty issue list and surfaced only as the
        // opaque `guide:guard_rejected`, which cost hours to trace (2026-09-17).
        if (item.figurePlan !== undefined) {
          const plan = item.figurePlan;
          if (Array.isArray(plan)) issues.push('presentation_figureplan_is_array_expected_object_with_figures');
          else if (!plan || typeof plan !== 'object') issues.push('presentation_figureplan_shape');
          else {
            if (!hasOnlyKeys(plan as Record<string, unknown>, ['figures'])) issues.push('presentation_figureplan_keys');
            const entries = (plan as { figures?: unknown }).figures;
            if (!Array.isArray(entries)) issues.push('presentation_figureplan_figures_missing');
            else if (entries.length < 1 || entries.length > 12) issues.push(`presentation_figureplan_length_${entries.length}_expected_1_to_12`);
            else entries.forEach((raw, index) => {
              const prefix = `presentation_figureplan_${index}`;
              if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push(`${prefix}_shape`); return; }
              const entry = raw as Record<string, unknown>;
              if (!hasOnlyKeys(entry, ['id', 'decision', 'styleId', 'caption'])) issues.push(`${prefix}_keys`);
              textIssue(`${prefix}_id`, entry.id, 200);
              if (typeof entry.decision !== 'string'
                || !['reuse', 're-render', 'abstract', 'skip'].includes(entry.decision)) issues.push(`${prefix}_decision_enum`);
              if (entry.styleId !== undefined) textIssue(`${prefix}_style_id`, entry.styleId, 100);
              if (entry.caption !== undefined) textIssue(`${prefix}_caption`, entry.caption, 200);
            });
          }
        }
        if (!presentationVersion) issues.push('presentation_context_missing');
        else {
          if (typeof item.researchObjectId === 'string' && item.researchObjectId !== presentationVersion.researchObjectId) issues.push('presentation_research_object_scope');
          if (typeof item.versionId === 'string' && item.versionId !== presentationVersion.id) issues.push('presentation_version_scope');
        }
      }
    }
    if (!Array.isArray(shape.nextSteps)) issues.push('next_steps_type');
    else {
      if (shape.nextSteps.length > 1) issues.push(`next_steps_length_${shape.nextSteps.length}_max_1`);
      shape.nextSteps.slice(0, 2).forEach((candidate, index) => {
        const prefix = `next_steps_${index}`;
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) { issues.push(`${prefix}_shape`); return; }
        const step = candidate as Record<string, unknown>;
        if (!hasOnlyKeys(step, ['label', 'intent', 'targetId'])) issues.push(`${prefix}_keys`);
        textIssue(`${prefix}_label`, step.label, 120);
        if (typeof step.intent !== 'string') issues.push(`${prefix}_intent_type`);
        else if (!INTENTS.has(step.intent as WorkspaceGuideIntent)) issues.push(`${prefix}_intent_enum`);
        if (step.targetId !== undefined) textIssue(`${prefix}_target_id`, step.targetId, 100, true);
        if ((step.intent === 'start-import' && step.targetId !== undefined)
          || (step.intent === 'open-task' && (typeof step.targetId !== 'string' || !taskIds.includes(step.targetId)))
          || (step.intent === 'open-ro' && (typeof step.targetId !== 'string' || !researchObjectIds.includes(step.targetId)))
          || (['prepare-publication', 'review-media'].includes(String(step.intent)) && (step.targetId !== ownerTask.session.researchObjectId || typeof step.targetId !== 'string' || !researchObjectIds.includes(step.targetId)))) issues.push(`${prefix}_target_scope`);
      });
    }
    if (shape.draftChanges !== undefined) {
      const changes = shape.draftChanges;
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) issues.push('draft_changes_shape');
      else {
        const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
        const items = changes as Record<string, unknown>;
        if (!Object.keys(items).length) issues.push('draft_changes_empty');
        if (!hasOnlyKeys(items, fields)) issues.push('draft_changes_keys');
        for (const field of fields) if (field in items) textIssue(`draft_changes_${field}`, items[field], 4000);
        const length = JSON.stringify(items).length;
        if (length > 18000) issues.push(`draft_changes_length_${length}_max_18000`);
        if (!editorDraft || shape.needsMoreInformation) issues.push('draft_changes_context');
      }
    }
    return `guide:${issues.join(',') || 'guard_rejected'}`.slice(0, 500);
  };
  const result = await gateway.completeStructured(resultGuard, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], {
    ...(editorDraft ? SCIENTIFIC_SYNTHESIS_OPTIONS : { temperature: 0.2 }),
    includeRejectedResponseOnRetry: true,
    validationDiagnostic,
    validationFeedback: (value) => `Repair ${validationDiagnostic(value)}. Return one complete JSON object; preserve supported content/action. No extra keys/nulls; omit unused optional fields. summary: nonempty<=1200; needsMoreInformation:boolean; nextSteps:max1 {label,intent,targetId}, label<=120, authorized targetId<=100; omit targetId for start-import. `
      + 'presentationDraft: action,instruction,researchObjectId,versionId; optional style, revisionMode/baseAssetId, figurePlan. Copy scope ids from presentationContext. action: storyboard.create|storyboard.revise|scene.image|video.create. instruction<=1000: storyboard nonempty; scene.image exactly ""; video empty=execute, nonempty=plan. create requires style: nonempty installed id<=100 from original goal/conversation; scientific only without preference. Art-only revise: paired revisionMode:"art"/unambiguous eligible baseAssetId<=100, never newest. Copy goal verbatim; if >1000 ask to shorten and omit draft. Omit style for palette/composition/material/typography-only changes; preserve base styles. figurePlan: {"figures":[{id,decision,styleId?,caption?}]}, 1-12; id<=200,styleId<=100,caption<=200; preserve authorized figure mapping. '
      + (editorDraft ? 'draftChanges: only six SDF fields, full nonempty strings<=4000 each, JSON<=18000; nextSteps:[], needsMoreInformation:false; never combine with presentationDraft.' : 'Omit draftChanges.'),
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
  if (result.presentationDraft?.revisionMode === 'art') {
    if (payload.goal.length > 1_000) return {
      summary: payload.locale === 'zh' ? '请把这次艺术调整要求精简到 1000 字符以内，保留需要修改的视觉要点。' : 'Please shorten the art revision request to 1000 characters, keeping the visual changes you want.',
      nextSteps: [],
      needsMoreInformation: true,
    };
    // The guide selects a route and base; the existing art planner owns the actual design.
    const { figurePlan: requestedFigurePlan, ...artDraft } = result.presentationDraft;
    const basePlan = planState.find((plan) => plan.id === artDraft.baseAssetId)!;
    const figurePlan = basePlan.figurePlan ? {
      figures: basePlan.figurePlan.figures.map(figure => {
        if (figure.decision !== 're-render' && figure.decision !== 'abstract') return figure;
        const styleId = requestedFigurePlan
          ? requestedFigurePlan.figures.find(requested => requested.id === figure.id)?.styleId ?? figure.styleId ?? basePlan.style
          : artDraft.style ?? figure.styleId;
        return styleId ? { ...figure, styleId } : figure;
      }),
    } : undefined;
    return {
      summary: payload.locale === 'zh' ? `建议按你的原话调整《${basePlan.title}》的视觉表现。确认后会准备新方案，保留原有科学内容。` : `I propose updating the visual treatment of “${basePlan.title}” using your wording. Confirmation will prepare a new plan with its scientific content preserved.`,
      nextSteps: [],
      needsMoreInformation: false,
      presentationDraft: { ...artDraft, instruction: payload.goal, style: artDraft.style ?? basePlan.style,
        ...(figurePlan ? { figurePlan } : {}) },
    };
  }
  if (result.draftChanges) {
    if (!editorDraft || result.needsMoreInformation) throw new Error('No applicable workspace draft changes');
    const { draftChanges, ...answer } = result;
    return { ...answer, draftEdit: { base: editorDraft, changes: draftChanges } };
  }
  return result;
}

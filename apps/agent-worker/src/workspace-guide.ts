import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import { buildInterestContext, parseWorkspaceGuidePayload, validateInterestContext, type AgentDeps, type WorkspaceGuidePayload } from '@openscience/domain';

type WorkspaceGuideIntent = 'open-task' | 'open-ro' | 'start-import' | 'prepare-publication';

export interface WorkspaceGuideResult extends Record<string, unknown> {
  summary: string;
  nextSteps: Array<{
    label: string;
    intent: WorkspaceGuideIntent;
    targetId?: string;
  }>;
  needsMoreInformation: boolean;
  draftChanges?: Partial<Record<'problem' | 'insight' | 'method' | 'results' | 'limitations' | 'reproducibility', string>>;
  draftEdit?: { base: NonNullable<WorkspaceGuidePayload['context']['editorDraft']>; changes: NonNullable<WorkspaceGuideResult['draftChanges']> };
  presentationDraft?: {
    action: 'storyboard.create' | 'storyboard.revise' | 'scene.image' | 'video.create';
    instruction: string;
    researchObjectId: string;
    versionId: string;
  };
}

const INTENTS = new Set<WorkspaceGuideIntent>(['open-task', 'open-ro', 'start-import', 'prepare-publication']);
const CORE_FIELDS = ['problem', 'insight', 'method', 'evidence', 'results', 'limitations', 'reproducibility'] as const;

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
  return hasOnlyKeys(draft, ['action', 'instruction', 'researchObjectId', 'versionId'])
    && ['storyboard.create', 'storyboard.revise', 'scene.image', 'video.create'].includes(String(draft.action))
    && typeof draft.instruction === 'string'
    && draft.instruction.trim().length > 0
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
  deps: Pick<AgentDeps, 'prisma'>,
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
        '仅当 presentationContext 存在且用户目标适合用讲解分镜表达时，才输出 presentationDraft；它只能包含 action、instruction、researchObjectId、versionId。action 根据请求选择 storyboard.create、storyboard.revise、scene.image 或 video.create，两个 id 必须逐字使用 presentationContext，instruction 必须是基于给定版本字段的可编辑分镜指令，不得声称已生成、批准或发布。不得输出主张或来源 id。',
        'intent 只能是 open-task、open-ro、start-import、prepare-publication。除 start-import 外必须带授权 targetId；start-import 必须省略 targetId。',
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
        'Emit presentationDraft only when presentationContext exists and the goal benefits from an explanatory storyboard. It may contain only action, instruction, researchObjectId, and versionId. action must match the request: storyboard.create, storyboard.revise, scene.image or video.create; copy both ids exactly from presentationContext. instruction is an editable storyboard brief grounded in the supplied version fields. Never claim it was generated, approved, or published, and never emit Claim or source ids.',
        'intent must be open-task, open-ro, start-import or prepare-publication. All except start-import require an authorized targetId; start-import must omit targetId.',
        `open-task may use only these task ids: ${taskIds.length ? taskIds.join(', ') : '(none; do not emit open-task)'}.`,
        `open-ro may use only these research object ids: ${researchObjectIds.length ? researchObjectIds.join(', ') : '(none; do not emit open-ro)'}.`,
        editorDraft ? 'Editing example (change only the fields actually requested): {"summary":"Proposed a concise problem statement.","nextSteps":[],"needsMoreInformation":false,"draftChanges":{"problem":"Full replacement text"}}' : 'Exact example: {"summary":"Review finding and gap","nextSteps":[{"label":"Open the research object","intent":"open-ro","targetId":"an allowed id"}],"needsMoreInformation":true}',
      ].join('\n');
  if (editorDraft) system += '\n' + (payload.locale === 'zh'
    ? '你同时是当前工作台的共编助手。editorDraft是用户此刻正在编辑的草稿，不是新证据。用户明确要求改写、凝练、翻译或调整内容时，可额外输出draftChanges：只包含实际改动的六字段键与完整替换文本。咨询、评价、导航不改稿。保留科学条件、公式、单位、限制和来源含义，不编造论文内容；证据不足时解释，不用猜测填充。除draftChanges外上述根字段限制保持。summary说明改了什么，不能声称已保存、定稿或发布。不得修改未要求的字段；只修改草稿，最终定稿另行确认。'
    : 'You also co-edit the active workbench. editorDraft is the current user draft, not new evidence. Only for an explicit revision, condensation, translation or editing request may you add draftChanges, containing only changed SDF field keys and full replacement text. Questions, review and navigation do not edit. Preserve scientific conditions, equations, units, limitations and source meaning; never invent paper content. Explain insufficient evidence instead of filling guesses. All other root restrictions remain. Summarize changes without claiming they were saved, confirmed or published. Do not change unrequested fields.');
  if (editorDraft) system += '\n' + 'draftChanges must be a JSON object, never an array or JSON Patch. Allowed keys: problem, insight, method, results, limitations, reproducibility. Each value is the full replacement string (1–4000 characters); use English keys even when the text is Chinese. Omit unchanged fields. For a completed edit set needsMoreInformation=false and nextSteps=[].';
  system += '\n' + [
    'Conversation history contains prior user requests and assistant proposals, not new evidence or proof that actions completed. Resolve follow-up requests using it, but prefer the current draft and version context.',
    'Choose the requested operation semantically; a request to illustrate the research means scene.image; a video request means video.create. The client prepares missing plans and shows a scoped confirmation before any generation charge. Supply a grounded detailed instruction (maximum 1000 characters), never invent completed assets. Questions about capabilities or negated requests must not return an action.',
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
    temperature: 0.2,
    validationFeedback: () => 'The previous JSON did not match the output contract. Return summary as a nonempty string (max 1200 characters), nextSteps as an array with at most one {label,intent,targetId} entry, and needsMoreInformation as a boolean. Omit unused optional fields; no nulls, patches, wrappers or extra keys. '
      + (editorDraft ? 'For editing use nextSteps:[], needsMoreInformation:false and draftChanges:{problem:"full text"} with only requested English field keys (problem,insight,method,results,limitations,reproducibility); string values only, max 4000 characters each, max 18000 in total. Omit presentationDraft unless a valid presentationContext exists.'
        : 'The only optional root key is presentationDraft; include it only for an applicable presentationContext, with action, instruction, researchObjectId and versionId. Never emit draftChanges or edits. Navigation intent must be open-task, open-ro, start-import or prepare-publication and use only authorized IDs.'),
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
    || (step.intent === 'prepare-publication' && (!step.targetId || step.targetId !== ownerTask.session.researchObjectId || !allowedResearchObjectIds.has(step.targetId)))
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

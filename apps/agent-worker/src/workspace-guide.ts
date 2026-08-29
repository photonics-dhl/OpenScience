import type { AiGateway, SchemaGuard } from '@openscience/ai-gateway';
import { buildInterestContext, parseWorkspaceGuidePayload, validateInterestContext, type AgentDeps, type WorkspaceGuidePayload } from '@openscience/domain';

type WorkspaceGuideIntent = 'open-task' | 'open-ro' | 'start-import';

export interface WorkspaceGuideResult extends Record<string, unknown> {
  summary: string;
  nextSteps: Array<{
    label: string;
    intent: WorkspaceGuideIntent;
    targetId?: string;
  }>;
  needsMoreInformation: boolean;
}

const INTENTS = new Set<WorkspaceGuideIntent>(['open-task', 'open-ro', 'start-import']);
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
  if (!hasOnlyKeys(result, ['summary', 'nextSteps', 'needsMoreInformation'])) return false;
  if (typeof result.summary !== 'string' || result.summary.trim().length === 0 || result.summary.length > 1200) return false;
  if (typeof result.needsMoreInformation !== 'boolean' || !Array.isArray(result.nextSteps) || result.nextSteps.length > 3) return false;
  return result.nextSteps.every((candidate) => {
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
    },
  };
  const taskIds = trustedPayload.context.tasks.map((item) => item.id);
  const researchObjectIds = trustedPayload.context.researchObjects.map((item) => item.id);
  const system = payload.locale === 'zh'
    ? [
        '你是 OpenScience 的 Hermes 科研引导员。根据给定的真实研究对象字段，指出最重要的审核或补充事项，并只提供安全导航。',
        '不得声称已经执行写入、删除、合并、发布或权限变更。不得杜撰上下文中没有的事实。',
        'InterestContext 仅用于排序关注点；rejectedSignals 是明确排除项，不得反向推断敏感属性或站外行为。',
        '只输出一个 JSON 对象，根字段只能是 summary、nextSteps、needsMoreInformation。needsMoreInformation 必须是 boolean，不得输出问题数组。',
        'nextSteps 最多 3 项；每个 nextSteps 项只能包含 label、intent、targetId，禁止 title、description 或其他字段。',
        'intent 只能是 open-task、open-ro、start-import。open-task/open-ro 必须带 targetId；start-import 必须省略 targetId。',
        `open-task 只能使用下列 task id：${taskIds.length ? taskIds.join(', ') : '（无；禁止输出 open-task）'}。`,
        `open-ro 只能使用下列 research object id：${researchObjectIds.length ? researchObjectIds.join(', ') : '（无；禁止输出 open-ro）'}。`,
        '严格示例：{"summary":"审核结论与缺口","nextSteps":[{"label":"打开研究对象复核","intent":"open-ro","targetId":"允许的 id"}],"needsMoreInformation":true}',
      ].join('\n')
    : [
        'You are Hermes, the OpenScience research guide. Review the supplied real research-object fields, identify the most important verification or completion work, and provide safe navigation only.',
        'Never claim to have written, deleted, merged, published, or changed permissions. Do not invent facts absent from the context.',
        'Use InterestContext only to prioritize attention. rejectedSignals are explicit exclusions; never infer sensitive traits or off-site behavior.',
        'Return exactly one JSON object whose only root keys are summary, nextSteps, and needsMoreInformation. needsMoreInformation must be a boolean, never an array.',
        'nextSteps has at most three items. Each item may contain only label, intent, and targetId; title and description are forbidden.',
        'intent must be open-task, open-ro, or start-import. open-task/open-ro require targetId; start-import must omit targetId.',
        `open-task may use only these task ids: ${taskIds.length ? taskIds.join(', ') : '(none; do not emit open-task)'}.`,
        `open-ro may use only these research object ids: ${researchObjectIds.length ? researchObjectIds.join(', ') : '(none; do not emit open-ro)'}.`,
        'Exact example: {"summary":"Review finding and gap","nextSteps":[{"label":"Open the research object","intent":"open-ro","targetId":"an allowed id"}],"needsMoreInformation":true}',
      ].join('\n');
  const userMessageBudget = Math.max(0, 30_000 - system.length);
  const serializeUser = (maxCharsPerField: number) => JSON.stringify({
    goal: trustedPayload.goal,
    route: trustedPayload.route,
    interestContext,
    context: {
      tasks: trustedPayload.context.tasks,
      researchObjects: trustedResearch.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        core: boundedCore(item.sdfDocument?.coreJson, maxCharsPerField),
      })),
    },
  });
  let lower = 0;
  let upper = 1_200;
  let user = serializeUser(0);
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
  ], { temperature: 0.2 });
  const allowedTaskIds = new Set(taskIds);
  const allowedResearchObjectIds = new Set(researchObjectIds);
  const invalidTarget = result.nextSteps.some((step) => (
    (step.intent === 'open-task' && (!step.targetId || !allowedTaskIds.has(step.targetId)))
    || (step.intent === 'open-ro' && (!step.targetId || !allowedResearchObjectIds.has(step.targetId)))
    || (step.intent === 'start-import' && step.targetId !== undefined)
  ));
  if (invalidTarget) throw new Error('workspace.guide result target 不在允许的上下文中');
  return result;
}

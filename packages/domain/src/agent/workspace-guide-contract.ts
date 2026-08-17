export interface WorkspaceGuidePayload extends Record<string, unknown> {
  goal: string;
  locale: 'zh' | 'en';
  route: 'dashboard' | 'research-object-new' | 'research-object-edit';
  target: WorkspaceGuideTarget;
  context: {
    tasks: Array<{ id: string; researchObjectId: string; state: string }>;
    researchObjects: Array<{ id: string; title: string; status: string }>;
  };
}

export type WorkspaceGuideTarget =
  | 'ro-title' | 'source-import' | 'research-question'
  | 'sdf-problem' | 'sdf-insight' | 'sdf-method' | 'sdf-evidence'
  | 'sdf-results' | 'sdf-limitations' | 'hermes-diff' | 'commit' | null;

const shortString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

/** Shared API/worker trust-boundary parser. Keep persistence and execution on one exact contract. */
export function parseWorkspaceGuidePayload(value: unknown): WorkspaceGuidePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('workspace.guide payload 无效');
  const payload = value as Record<string, unknown>;
  if (!hasOnlyKeys(payload, ['goal', 'locale', 'route', 'target', 'context'])) throw new Error('workspace.guide payload 包含未知字段');
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
  if (!hasOnlyKeys(context, ['tasks', 'researchObjects'])) throw new Error('workspace.guide context 包含未知字段');
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
  return { goal, locale: payload.locale, route: payload.route, target: payload.target as WorkspaceGuideTarget, context: { tasks, researchObjects } };
}

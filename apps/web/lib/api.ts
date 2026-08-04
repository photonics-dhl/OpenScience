/** OpenScience web API client：对接 apps/api（同源反代或 dev 直连）。 */

/** 核心六字段（§5.1，对齐 SDF_CORE_FIELDS）。 */
export interface SdfCore {
  schemaVersion: string;
  problem: string;
  insight: string;
  method: string;
  results: string;
  limitations: string;
  reproducibility: string;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ResearchObjectSummary {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  visibility: 'private' | 'invite_only' | 'public';
  version: number;
  createdAt: string;
}

export interface VersionSummary {
  versionId: string;
  versionNo: number;
  status: string;
  commitId: string;
  createdAt: string;
}

export interface ArtifactReference {
  logicalPath: string;
  artifactId: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try { body = await res.json() as ApiErrorBody; } catch { /* 非 JSON */ }
    throw new ApiClientError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? `请求失败 ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** 查 RO 详情（含 SDF core）。 */
export async function getResearchObject(id: string): Promise<{ researchObject: ResearchObjectSummary & { sdf: { core: SdfCore; nodes: unknown[] } } }> {
  return request(`/api/research-objects/${id}`);
}

/** 更新 SDF（乐观锁 version，§16）。 */
export async function updateSdf(roId: string, version: number, core: SdfCore): Promise<{ sdf: { core: SdfCore } }> {
  return request(`/api/sdf/${roId}`, { method: 'PUT', body: JSON.stringify({ version, core }) });
}

/** 查版本列表（P1B-4）。 */
export async function listVersions(roId: string): Promise<{ versions: VersionSummary[] }> {
  return request(`/api/research-objects/${roId}/versions`);
}

/** 创建提交（P1B-4，乐观锁 + 幂等）。 */
export async function createCommit(
  roId: string,
  input: { message: string; version: number; sdfCore: SdfCore; artifacts: ArtifactReference[] },
  idempotencyKey?: string,
): Promise<{ commit: { commitId: string; versionId: string; versionNo: number } }> {
  return request(`/api/research-objects/${roId}/commits`, {
    method: 'POST',
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}

/** 版本 diff（P1B-5）。 */
export async function getVersionDiff(fromVersionId: string, toVersionId: string): Promise<{ diff: unknown }> {
  return request(`/api/versions/${fromVersionId}/comparison?to=${toVersionId}`);
}

// ===== P1C-10：协作 API client（P1C-2~9 端点封装）=====

export interface IssueSummary {
  id: string;
  title: string;
  body: string;
  kind: string;
  status: string;
  authorId: string;
  createdAt: string;
  commentCount: number;
}
export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export async function listIssues(roId: string, kind?: string, status?: string): Promise<{ issues: IssueSummary[] }> {
  const q = new URLSearchParams();
  if (kind) q.set('kind', kind);
  if (status) q.set('status', status);
  return request(`/api/research-objects/${roId}/issues${q.size ? `?${q}` : ''}`);
}
export async function getIssue(roId: string, issueId: string): Promise<{ issue: IssueSummary & { comments: Comment[] } }> {
  return request(`/api/research-objects/${roId}/issues/${issueId}`);
}
export async function createIssue(roId: string, input: { title: string; kind: string; body?: string }): Promise<{ issue: IssueSummary }> {
  return request(`/api/research-objects/${roId}/issues`, { method: 'POST', body: JSON.stringify(input) });
}
export async function updateIssueStatus(roId: string, issueId: string, status: string): Promise<{ issue: IssueSummary }> {
  return request(`/api/research-objects/${roId}/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export async function createComment(roId: string, issueId: string, body: string): Promise<{ comment: Comment }> {
  return request(`/api/research-objects/${roId}/issues/${issueId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

export interface BranchSummary {
  id: string;
  name: string;
  isDefault: boolean;
  commitCount: number;
  tipCommit: { id: string; message: string; createdAt: string } | null;
}
export async function listBranches(roId: string): Promise<{ branches: BranchSummary[] }> {
  return request(`/api/research-objects/${roId}/branches`);
}
export async function createBranch(roId: string, name: string, headCommitId?: string): Promise<{ branch: BranchSummary }> {
  return request(`/api/research-objects/${roId}/branches`, { method: 'POST', body: JSON.stringify({ name, headCommitId }) });
}

export interface PullRequestDetail {
  id: string;
  title: string;
  body: string;
  status: string;
  sourceBranchId: string;
  targetBranchId: string;
  authorId: string;
  createdAt: string;
  changedSdfFields: string[];
  changedFiles: string[];
  changesMethod: boolean;
  changesData: boolean;
  changesConclusion: boolean;
  newContributors: Array<{ userId: string; creditRole: string[] }>;
  dataLicense: string;
  codeLicense: string;
  conflictOfInterest: string;
  requestsRelease: boolean;
  diff: unknown;
  commentCount: number;
}
export interface PrInput {
  sourceBranchId: string;
  targetBranchId: string;
  title: string;
  body?: string;
  changedSdfFields: string[];
  changedFiles: string[];
  changesMethod: boolean;
  changesData: boolean;
  changesConclusion: boolean;
  newContributors: Array<{ userId: string; creditRole: string[] }>;
  dataLicense: string;
  codeLicense: string;
  conflictOfInterest: string;
  autoChecks: Record<string, unknown>;
  requestsRelease: boolean;
}
export async function listPullRequests(roId: string, status?: string): Promise<{ pullRequests: Array<Omit<PullRequestDetail, 'diff'>> }> {
  const q = status ? `?status=${status}` : '';
  return request(`/api/research-objects/${roId}/pull-requests${q}`);
}
export async function getPullRequest(roId: string, prId: string): Promise<{ pullRequest: PullRequestDetail }> {
  return request(`/api/research-objects/${roId}/pull-requests/${prId}`);
}
export async function createPullRequest(roId: string, input: PrInput, idempotencyKey?: string): Promise<{ pullRequest: PullRequestDetail }> {
  return request(`/api/research-objects/${roId}/pull-requests`, {
    method: 'POST',
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
    body: JSON.stringify(input),
  });
}
export async function mergePullRequest(roId: string, prId: string, confirmHighRisk: boolean): Promise<{ merge: { prId: string; status: string; highRisk: { highRisk: boolean; reasons: string[] } } }> {
  return request(`/api/research-objects/${roId}/pull-requests/${prId}/merge`, { method: 'POST', body: JSON.stringify({ confirmHighRisk }) });
}
export async function createReview(roId: string, prId: string, input: { verdict: string; body?: string; items?: Array<{ path: string; kind: string; comment: string }> }): Promise<{ review: unknown }> {
  return request(`/api/research-objects/${roId}/pull-requests/${prId}/reviews`, { method: 'POST', body: JSON.stringify(input) });
}

export interface ForkSource {
  forkedRoId: string;
  sourceRoId: string;
  sourceVersionId: string;
  sourceContentHash: string;
}
export async function forkResearchObject(roId: string, workspaceId: string): Promise<{ researchObject: { id: string; publicId: string }; forkRelation: ForkSource }> {
  return request(`/api/research-objects/${roId}/forks`, { method: 'POST', body: JSON.stringify({ workspaceId }) });
}
export async function getForkSource(roId: string): Promise<{ forkSource: ForkSource | null }> {
  return request(`/api/research-objects/${roId}/fork-source`);
}

export interface Author {
  userId: string;
  displayName: string;
  sortOrder: number;
  isCorresponding: boolean;
}
export async function getAuthors(roId: string): Promise<{ authors: Author[] }> {
  return request(`/api/research-objects/${roId}/authors`);
}
export async function setAuthors(roId: string, authors: Array<{ userId: string; isCorresponding?: boolean }>): Promise<{ authors: Author[] }> {
  return request(`/api/research-objects/${roId}/authors`, { method: 'PUT', body: JSON.stringify({ authors }) });
}
export async function addContribution(roId: string, creditRole: string): Promise<{ contribution: unknown }> {
  return request(`/api/research-objects/${roId}/contributions`, { method: 'POST', body: JSON.stringify({ creditRole }) });
}
export async function getContributions(roId: string): Promise<{ contributions: Array<{ id: string; userId: string; creditRole: string }> }> {
  return request(`/api/research-objects/${roId}/contributions`);
}

export interface NotificationView {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
export async function listNotifications(unreadOnly = false): Promise<{ notifications: NotificationView[] }> {
  const q = unreadOnly ? '?unreadOnly=true' : '';
  return request(`/api/notifications${q}`);
}
export async function markNotificationRead(id: string): Promise<{ notification: NotificationView }> {
  return request(`/api/notifications/${id}/read`, { method: 'POST' });
}

// ===== P1D-3：SDF Extractor 异步提取 =====

export interface AgentTaskView {
  id: string;
  sessionId: string;
  kind: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 建 Hermes 会话 + 提交 sdf.extract 任务（§9.3 异步 + §16 幂等）。 */
export async function submitExtractTask(roId: string, manuscriptText: string): Promise<{ task: AgentTaskView }> {
  const session = await request<{ session: { id: string } }>('/api/agent/sessions', {
    method: 'POST',
    body: JSON.stringify({ researchObjectId: roId, kind: 'extract', title: 'SDF 提取' }),
  });
  const task = await request<{ task: AgentTaskView }>('/api/agent/tasks', {
    method: 'POST',
    body: JSON.stringify({ sessionId: session.session.id, kind: 'sdf.extract', payload: { manuscriptText } }),
  });
  return task;
}

/** 轮询任务进度（§18.3 可恢复）。 */
export async function getAgentTask(roId: string, taskId: string): Promise<{ task: AgentTaskView }> {
  void roId;
  return request(`/api/agent/tasks/${taskId}`);
}


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

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  status: string;
  level: string;
}

export interface AuthResult {
  userId: string;
  status: string;
}

export interface ConfirmSignupInput {
  email: string;
  code: string;
  password: string;
  displayName: string;
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

let csrfToken: string | null = null;

const PUBLIC_AUTH_WRITES = new Set([
  '/api/auth/request-signup-code',
  '/api/auth/confirm-signup',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/resend-code',
  '/api/auth/login',
]);

function isProtectedWrite(path: string, init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(method) && !PUBLIC_AUTH_WRITES.has(path.split('?')[0] ?? path);
}

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf-token', { credentials: 'include' });
  if (!res.ok) throw new ApiClientError('CSRF_TOKEN_FAILED', `无法建立安全会话 ${res.status}`, res.status);
  const body = await res.json() as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

interface ProtectedXhr {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  withCredentials: boolean;
}

/** Prepare progress-capable multipart XHR without overriding its browser-generated boundary. */
export async function prepareProtectedXhr(xhr: ProtectedXhr, method: string, path: string): Promise<void> {
  const token = await getCsrfToken();
  xhr.open(method, path);
  xhr.withCredentials = true;
  xhr.setRequestHeader('x-csrf-token', token);
}

function isCsrfFailure(status: number, body?: ApiErrorBody): boolean {
  return status === 403 && (
    body?.error.code.startsWith('FST_CSRF_') === true
    || body?.error.code.startsWith('CSRF_') === true
  );
}

/** Same-origin browser transport. Protected writes carry the API CSRF token. */
export async function apiRequest<T>(path: string, init?: RequestInit, csrfRetry = true): Promise<T> {
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  if (!headers['content-type']) headers['content-type'] = 'application/json';
  if (isProtectedWrite(path, init)) headers['x-csrf-token'] = await getCsrfToken();

  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try { body = await res.json() as ApiErrorBody; } catch { /* 非 JSON */ }
    if (csrfRetry && isProtectedWrite(path, init) && isCsrfFailure(res.status, body)) {
      csrfToken = null;
      return apiRequest<T>(path, init, false);
    }
    throw new ApiClientError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? `请求失败 ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const request = apiRequest;

/** Keep post-auth navigation on this origin and out of auth-loop routes. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  const pathname = value.split(/[?#]/, 1)[0];
  if (pathname === '/auth/login' || pathname === '/auth/register') return '/dashboard';
  return value;
}

/** Request a verification code without collecting an invitation code in the product UI. */
export async function requestSignupCode(input: { email: string }): Promise<{ ok: true }> {
  return request('/api/auth/request-signup-code', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Confirm the code and finish account creation in one explicit step. */
export async function confirmSignup(input: ConfirmSignupInput): Promise<AuthResult> {
  return request('/api/auth/confirm-signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return request('/api/auth/me');
}

export interface DashboardResearchApi {
  id: string;
  publicId: string | null;
  title: string;
  version: number;
  status: string;
}

export interface DashboardTaskApi {
  id: string;
  researchObjectId: string | null;
  kind: string;
  status: 'pending' | 'running' | 'failed' | 'succeeded';
  progress: number;
}

export async function getDashboardOverview(): Promise<{
  researchObjects: DashboardResearchApi[];
  tasks: DashboardTaskApi[];
}> {
  const [research, agent] = await Promise.all([
    request<{ researchObjects: DashboardResearchApi[] }>('/api/research-objects?limit=20'),
    request<{ tasks: DashboardTaskApi[] }>('/api/agent/tasks?actionable=true'),
  ]);
  return { researchObjects: research.researchObjects, tasks: agent.tasks };
}

export interface WorkspaceApi {
  id: string;
  name: string;
  type: string;
  role: string;
}

export async function listMyWorkspaces(): Promise<WorkspaceApi[]> {
  const result = await request<{ workspaces: WorkspaceApi[] }>('/api/workspaces');
  return result.workspaces;
}

export async function createResearchObject(input: { workspaceId: string; title: string }, idempotencyKey = crypto.randomUUID()): Promise<{
  researchObject: { id: string; workspaceId: string; version: number };
}> {
  return request('/api/research-objects', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

/** Upload one source artifact while preserving browser multipart boundaries. */
export async function uploadArtifactFile(
  workspaceId: string,
  file: File,
  logicalPath = file.name,
  onProgress?: (percent: number) => void,
): Promise<ArtifactReference> {
  const xhr = new XMLHttpRequest();
  await prepareProtectedXhr(xhr, 'POST', '/api/artifacts/upload');
  const body = new FormData();
  body.append('workspaceId', workspaceId);
  body.append('logicalPath', logicalPath);
  body.append('file', file, file.name);

  return new Promise((resolve, reject) => {
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiClientError('UPLOAD_FAILED', `上传失败：${file.name}`, 0));
    xhr.onload = () => {
      let parsed: { artifact?: { artifactId: string; logicalPath: string }; error?: { code?: string; message?: string } } = {};
      try { parsed = JSON.parse(xhr.responseText) as typeof parsed; } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300 && parsed.artifact) {
        resolve({ artifactId: parsed.artifact.artifactId, logicalPath: parsed.artifact.logicalPath });
        return;
      }
      reject(new ApiClientError(parsed.error?.code ?? 'UPLOAD_FAILED', parsed.error?.message ?? `上传失败：${file.name}`, xhr.status));
    };
    xhr.send(body);
  });
}

const EMPTY_SDF_CORE: SdfCore = {
  schemaVersion: '0.1.0',
  problem: '',
  insight: '',
  method: '',
  results: '',
  limitations: '',
  reproducibility: '',
};

interface MaterialImportDeps {
  create: typeof createResearchObject;
  upload: (workspaceId: string, file: File, logicalPath: string) => Promise<ArtifactReference>;
  commit: typeof createCommit;
}

export interface MaterialImportCheckpoint {
  importId: string;
  workspaceId: string;
  title: string;
  researchObject?: { id: string; workspaceId: string; version: number };
  uploaded: Array<ArtifactReference & { fingerprint: string }>;
}

function splitExtension(filename: string): { stem: string; extension: string } {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? { stem: filename.slice(0, dot), extension: filename.slice(dot) } : { stem: filename, extension: '' };
}

/** Produce manifest-safe, stable paths even when selected files share a basename. */
export function planMaterialLogicalPaths(materials: readonly File[]): string[] {
  const used = new Set<string>();
  return materials.map((file) => {
    const original = file.name;
    if (!used.has(original)) { used.add(original); return original; }
    const { stem, extension } = splitExtension(original);
    let suffix = 2;
    let candidate = `${stem} (${suffix})${extension}`;
    while (used.has(candidate)) candidate = `${stem} (${++suffix})${extension}`;
    used.add(candidate);
    return candidate;
  });
}

function materialFingerprint(file: File): string {
  return `${file.size}:${file.lastModified}:${file.type}`;
}

/** Create an RO and persist every selected source file in its first immutable commit. */
export async function createResearchObjectWithMaterials(
  input: { workspaceId: string; title: string },
  materials: readonly File[],
  deps: MaterialImportDeps = { create: createResearchObject, upload: uploadArtifactFile, commit: createCommit },
  prior?: MaterialImportCheckpoint,
  onCheckpoint?: (checkpoint: MaterialImportCheckpoint) => void,
): Promise<{ researchObject: { id: string; workspaceId: string; version: number } }> {
  const matchesPrior = prior?.workspaceId === input.workspaceId && prior.title === input.title;
  let checkpoint: MaterialImportCheckpoint = matchesPrior
    ? { ...prior, uploaded: [...prior.uploaded] }
    : { importId: crypto.randomUUID(), workspaceId: input.workspaceId, title: input.title, uploaded: [] };
  if (!checkpoint.researchObject) {
    const created = await deps.create(input, `${checkpoint.importId}:create`);
    checkpoint = { ...checkpoint, researchObject: created.researchObject };
    onCheckpoint?.(checkpoint);
  }
  const researchObject = checkpoint.researchObject;
  if (!researchObject) throw new Error('Material import checkpoint is missing its research object');
  const created = { researchObject };
  if (materials.length === 0) return created;
  const logicalPaths = planMaterialLogicalPaths(materials);
  const artifacts: ArtifactReference[] = [];
  for (const [index, file] of materials.entries()) {
    const logicalPath = logicalPaths[index];
    const fingerprint = materialFingerprint(file);
    const completed = checkpoint.uploaded.find((item) => item.logicalPath === logicalPath && item.fingerprint === fingerprint);
    if (completed) {
      artifacts.push({ logicalPath: completed.logicalPath, artifactId: completed.artifactId });
      continue;
    }
    const uploaded = await deps.upload(input.workspaceId, file, logicalPath);
    artifacts.push(uploaded);
    checkpoint = { ...checkpoint, uploaded: [...checkpoint.uploaded, { ...uploaded, logicalPath, fingerprint }] };
    onCheckpoint?.(checkpoint);
  }
  await deps.commit(
    created.researchObject.id,
    { message: `Import ${materials.length} source material${materials.length === 1 ? '' : 's'}`, version: created.researchObject.version, sdfCore: EMPTY_SDF_CORE, artifacts },
    `${checkpoint.importId}:commit`,
  );
  return created;
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

// ===== P1D-9：公开页数据（§4.3 必显）=====

export interface PublicResearchVersion {
  publicId: string;
  title: string;
  url: string;
  visibility: string;
  version: {
    versionNo: number;
    publicVersionId: string;
    status: string;
    publishedAt: string | null;
    contentSha256: string | null;
    legalDisclaimer: string | null;
    core: Record<string, string>;
  };
  authors: Array<{ displayName: string; identityStatus: string; isCorresponding: boolean; affiliation: string | null; sortOrder: number }>;
  contributions: Array<{ displayName: string; creditRole: string }>;
  licenses: Record<string, string>;
  aiReview: { status: string; hardBlocks: unknown[]; warnings: unknown[] } | null;
  citation: string;
  artifactPaths: Array<{ logicalPath: string; blobSha256: string }>;
}

/** 公开页版本详情（§4.3 必显 + 十标签数据；匿名可访问 public）。 */
export async function getPublicResearchVersion(publicId: string, versionNo: number): Promise<{ research: PublicResearchVersion }> {
  return request(`/api/research/${publicId}/v/${versionNo}`);
}

// ===== P1E-6：沙箱任务查询与产物下载 =====

export interface SandboxJobView {
  id: string;
  workspaceId: string;
  script: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  context?: SandboxJobContext | null;
  result: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    timeout?: boolean;
    runtimeSeconds: number;
  } | null;
  artifacts: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  createdAt: string;
  completedAt?: string;
}

/** 查询沙箱任务状态（P1E-5 已实现 GET /sandbox-jobs/:id）。 */
export async function getSandboxJob(jobId: string): Promise<{ job: SandboxJobView }> {
  return request(`/api/sandbox-jobs/${jobId}`);
}

/** 下载沙箱产物（P1E-5 已实现 GET /sandbox-jobs/:id/artifacts/:artifactId）。 */
export async function downloadArtifact(jobId: string, artifactId: string): Promise<Blob> {
  const res = await fetch(`/api/sandbox-jobs/${jobId}/artifacts/${artifactId}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiClientError('DOWNLOAD_FAILED', `下载失败 ${res.status}`, res.status);
  }
  return res.blob();
}

/** 轮询任务直到完成（最多 35 秒，§10.3 沙箱 30s + 5s 缓冲）。 */
export async function pollSandboxJob(jobId: string, maxWaitMs = 35000): Promise<SandboxJobView> {
  const startTime = Date.now();
  const pollInterval = 500; // 500ms

  while (Date.now() - startTime < maxWaitMs) {
    const { job } = await getSandboxJob(jobId);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'timeout') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error('任务轮询超时');
}

// ===== P1E-7：脚本修改与 diff 预览 =====

export interface ModifyScriptRequest {
  prompt: string;
}

export interface ModifyScriptResponse {
  newScript: string;
  diff: string;
  policyResult: {
    allowed: boolean;
    violations: string[];
  };
}

/** 生成修改后的脚本预览（带 diff 和策略检查） */
export async function modifyScript(
  jobId: string,
  input: ModifyScriptRequest
): Promise<ModifyScriptResponse> {
  return apiRequest(`/api/sandbox-jobs/${jobId}/modify`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface SandboxJobContext {
  visualizationType?: 'plot' | 'simulation' | 'diagram';
  description?: string;
}

export interface CreateSandboxJobRequest {
  workspaceId: string;
  script: string;
  context?: SandboxJobContext;
}

export interface CreateSandboxJobResponse {
  job: {
    id: string;
    status: string;
    createdAt: string;
  };
}

/** 创建新的沙箱作业（P1E-5 POST /sandbox-jobs） */
export async function createSandboxJob(
  input: CreateSandboxJobRequest
): Promise<CreateSandboxJobResponse> {
  return apiRequest('/api/sandbox-jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}



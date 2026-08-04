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

/** 上传附件（P1B-3 管线，multipart）。 */
export async function uploadArtifact(workspaceId: string, logicalPath: string, file: File): Promise<{ artifact: { artifactId: string; blobSha256: string; size: number } }> {
  const form = new FormData();
  form.append('workspaceId', workspaceId);
  form.append('logicalPath', logicalPath);
  form.append('file', file, file.name);
  const res = await fetch('/api/artifacts/upload', { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try { body = await res.json() as ApiErrorBody; } catch { /* 非 JSON */ }
    throw new ApiClientError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? `上传失败 ${res.status}`, res.status);
  }
  return res.json() as Promise<{ artifact: { artifactId: string; blobSha256: string; size: number } }>;
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

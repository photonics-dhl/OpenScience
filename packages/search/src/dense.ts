const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_DENSE_CANDIDATES = 10_000;
const MAX_RESULT_LIMIT = 100;

export interface DenseCandidate {
  id: string;
  tenantId: string;
  vector: Float32Array;
}

export interface DenseCandidateSet {
  status: 'ok';
  candidates: DenseCandidate[];
  needsReviewCount: number;
}

export interface DenseStorageFailure {
  status: 'unavailable';
  code: 'dense_capacity_exceeded' | 'model_identity_unavailable' | 'search_storage_unavailable';
}

export interface DenseModelIdentity {
  modelVersionId: string;
  modelRevision: string;
  sourceSha256: string;
  packageFreezeSha256: string;
  modelManifestSha256: string;
}

export interface DenseCandidateStorage {
  denseCandidates(input: {
    tenantId: string;
    modelIdentity: DenseModelIdentity;
  }): Promise<DenseCandidateSet | DenseStorageFailure>;
}

export interface RankedDenseCandidate {
  id: string;
  score: number;
  rank: number;
}

export type DenseSearchResult =
  | { status: 'ok'; candidates: RankedDenseCandidate[]; needsReviewCount: number }
  | DenseStorageFailure;

function squaredNorm(vector: Float32Array): number | undefined {
  if (!(vector instanceof Float32Array) || vector.length < 1 || vector.length > 4_096) return undefined;
  let norm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return undefined;
    norm += value * value;
  }
  return Number.isFinite(norm) && norm > 0 ? norm : undefined;
}

function isNormalized(vector: Float32Array): boolean {
  const norm = squaredNorm(vector);
  return norm !== undefined && Math.abs(Math.sqrt(norm) - 1) <= 1e-4;
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  const leftNorm = squaredNorm(left);
  const rightNorm = squaredNorm(right);
  if (leftNorm === undefined || rightNorm === undefined || left.length !== right.length) {
    throw new Error('dense_vector_invalid');
  }
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) dot += left[index]! * right[index]!;
  const result = dot / Math.sqrt(leftNorm * rightNorm);
  if (!Number.isFinite(result)) throw new Error('dense_vector_invalid');
  return Math.max(-1, Math.min(1, result));
}

export function rankDenseCandidates(input: {
  tenantId: string;
  queryVector: Float32Array;
  candidates: readonly DenseCandidate[];
  limit: number;
  initialNeedsReviewCount?: number;
}): DenseSearchResult {
  if (!UUID_PATTERN.test(input.tenantId)) throw new Error('dense_tenant_invalid');
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULT_LIMIT) {
    throw new Error('dense_limit_invalid');
  }
  if (input.candidates.length > MAX_DENSE_CANDIDATES) {
    return { status: 'unavailable', code: 'dense_capacity_exceeded' };
  }
  if (!isNormalized(input.queryVector)) throw new Error('dense_vector_invalid');
  let needsReviewCount = input.initialNeedsReviewCount ?? 0;
  if (!Number.isInteger(needsReviewCount) || needsReviewCount < 0) throw new Error('dense_review_count_invalid');
  const seen = new Set<string>();
  const scored: Array<{ id: string; score: number }> = [];
  for (const candidate of input.candidates) {
    if (
      !HASH_PATTERN.test(candidate.id)
      || candidate.tenantId !== input.tenantId
      || seen.has(candidate.id)
      || candidate.vector.length !== input.queryVector.length
      || !isNormalized(candidate.vector)
    ) {
      needsReviewCount += 1;
      continue;
    }
    seen.add(candidate.id);
    scored.push({ id: candidate.id, score: cosineSimilarity(input.queryVector, candidate.vector) });
  }
  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return {
    status: 'ok',
    candidates: scored.slice(0, input.limit).map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    needsReviewCount,
  };
}

export async function denseSearch(input: {
  storage: DenseCandidateStorage;
  tenantId: string;
  modelIdentity: DenseModelIdentity;
  queryVector: Float32Array;
  limit: number;
}): Promise<DenseSearchResult> {
  const stored = await input.storage.denseCandidates({
    tenantId: input.tenantId,
    modelIdentity: input.modelIdentity,
  });
  if (stored.status === 'unavailable') return stored;
  return rankDenseCandidates({
    tenantId: input.tenantId,
    queryVector: input.queryVector,
    candidates: stored.candidates,
    limit: input.limit,
    initialNeedsReviewCount: stored.needsReviewCount,
  });
}

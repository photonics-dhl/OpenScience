export const CANDIDATE_EVALUATION_ERROR_CODES = [
  'locator_miss',
  'parser_exit',
  'timeout',
  'limit_exceeded',
  'invalid_output',
] as const;

export type CandidateEvaluationErrorCode = (typeof CANDIDATE_EVALUATION_ERROR_CODES)[number];
export type CandidateEvaluationStatus = 'succeeded' | 'needs_review' | 'failed';

export interface CandidateIdentity {
  name: string;
  version: string;
  imageDigest: string;
  license: string;
}

export interface CandidateCaseResult {
  id: string;
  contentHash: string;
  status: CandidateEvaluationStatus;
  locatorMatches: number;
  locatorTotal: number;
  elapsedMs: number;
  peakRssBytes: number;
  errorCode?: CandidateEvaluationErrorCode;
}

export interface CandidateEvaluationReport {
  schemaVersion: 1;
  candidate: CandidateIdentity;
  summary: {
    cases: number;
    succeeded: number;
    needsReview: number;
    failed: number;
    locatorMatches: number;
    locatorTotal: number;
    p50ElapsedMs: number;
    p95ElapsedMs: number;
    peakRssBytes: number;
  };
  cases: CandidateCaseResult[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

function exactObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} has unknown field "${unknown}"`);
  return record;
}

function boundedString(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function safeNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value as number;
}

function canonicalCandidate(value: unknown): CandidateIdentity {
  const candidate = exactObject(value, ['name', 'version', 'imageDigest', 'license'], 'candidate');
  const name = boundedString(candidate.name, 'candidate name');
  const version = boundedString(candidate.version, 'candidate version');
  const imageDigest = boundedString(candidate.imageDigest, 'candidate image digest');
  const license = boundedString(candidate.license, 'candidate license');
  if (!SAFE_IDENTIFIER.test(name) || !SAFE_IDENTIFIER.test(version)) throw new Error('candidate identity is invalid');
  if (!IMAGE_DIGEST.test(imageDigest)) throw new Error('candidate image digest must be a SHA-256 digest');
  return { name, version, imageDigest, license };
}

function canonicalCase(value: unknown): CandidateCaseResult {
  const item = exactObject(value, [
    'id', 'contentHash', 'status', 'locatorMatches', 'locatorTotal', 'elapsedMs', 'peakRssBytes', 'errorCode',
  ], 'candidate case');
  const id = boundedString(item.id, 'case id');
  const contentHash = boundedString(item.contentHash, 'case content hash', 64);
  const status = item.status;
  if (!SAFE_IDENTIFIER.test(id)) throw new Error('case id is invalid');
  if (!SHA256.test(contentHash)) throw new Error('case content hash must be a SHA-256 digest');
  if (status !== 'succeeded' && status !== 'needs_review' && status !== 'failed') throw new Error('case status is invalid');
  const locatorMatches = safeNonNegativeInteger(item.locatorMatches, 'locator matches');
  const locatorTotal = safeNonNegativeInteger(item.locatorTotal, 'locator total');
  if (locatorMatches > locatorTotal) throw new Error('locator matches cannot exceed total');
  const elapsedMs = safeNonNegativeInteger(item.elapsedMs, 'elapsed milliseconds');
  const peakRssBytes = safeNonNegativeInteger(item.peakRssBytes, 'peak RSS bytes');
  let errorCode: CandidateEvaluationErrorCode | undefined;
  if (item.errorCode !== undefined) {
    if (typeof item.errorCode !== 'string'
      || !CANDIDATE_EVALUATION_ERROR_CODES.includes(item.errorCode as CandidateEvaluationErrorCode)) {
      throw new Error('candidate case error code is invalid');
    }
    errorCode = item.errorCode as CandidateEvaluationErrorCode;
  }
  return {
    id,
    contentHash,
    status,
    locatorMatches,
    locatorTotal,
    elapsedMs,
    peakRssBytes,
    ...(errorCode === undefined ? {} : { errorCode }),
  };
}

function nearestRank(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] ?? 0;
}

export function buildCandidateEvaluationReport(value: {
  candidate: CandidateIdentity;
  cases: CandidateCaseResult[];
}): CandidateEvaluationReport {
  const input = exactObject(value, ['candidate', 'cases'], 'candidate evaluation');
  const candidate = canonicalCandidate(input.candidate);
  if (!Array.isArray(input.cases) || input.cases.length === 0 || input.cases.length > 1_000) {
    throw new Error('candidate evaluation cases must be a bounded non-empty array');
  }
  const cases = input.cases.map(canonicalCase);
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error('duplicate candidate case id');

  return {
    schemaVersion: 1,
    candidate,
    summary: {
      cases: cases.length,
      succeeded: cases.filter(({ status }) => status === 'succeeded').length,
      needsReview: cases.filter(({ status }) => status === 'needs_review').length,
      failed: cases.filter(({ status }) => status === 'failed').length,
      locatorMatches: cases.reduce((total, item) => total + item.locatorMatches, 0),
      locatorTotal: cases.reduce((total, item) => total + item.locatorTotal, 0),
      p50ElapsedMs: nearestRank(cases.map(({ elapsedMs }) => elapsedMs), 0.5),
      p95ElapsedMs: nearestRank(cases.map(({ elapsedMs }) => elapsedMs), 0.95),
      peakRssBytes: Math.max(...cases.map(({ peakRssBytes }) => peakRssBytes)),
    },
    cases,
  };
}

export function serializeCandidateEvaluationReport(value: {
  candidate: CandidateIdentity;
  cases: CandidateCaseResult[];
}): string {
  return `${JSON.stringify(buildCandidateEvaluationReport(value), null, 2)}\n`;
}

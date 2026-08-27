import type { SourceLocator } from '@openscience/domain';

import { tokenizeSearchText } from './tokenizer';

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const MAX_QUERY_CHARACTERS = 4_096;
const MAX_QUERY_TOKENS = 512;
const MAX_RESULT_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Bm25Input {
  tf: number;
  df: number;
  documentLength: number;
  documentCount: number;
  averageLength: number;
}

export interface LexicalCandidateDocument {
  id: string;
  tenantId: string;
  text: string;
  tokenCount: number;
  locators: SourceLocator[];
  claimIds: string[];
  termFrequencies: Record<string, number>;
}

export interface LexicalScoringDocument {
  id: string;
  tenantId: string;
  tokenCount: number;
  termFrequencies: Record<string, number>;
}

export interface LexicalCandidatePayload {
  id: string;
  tenantId: string;
  text: string;
  locators: SourceLocator[];
  claimIds: string[];
}

export interface LexicalCandidateSet {
  status: 'ok';
  corpus: { documentCount: number; averageLength: number };
  documentFrequencies: Record<string, number>;
  candidates: LexicalScoringDocument[];
  needsReviewCount: number;
}

export interface LexicalHydrationSet {
  status: 'ok';
  candidates: LexicalCandidatePayload[];
  needsReviewCount: number;
}

export interface SearchStorageFailure {
  status: 'unavailable';
  code: 'search_storage_unavailable' | 'lexical_capacity_exceeded';
}

export type LexicalCandidateStorageResult = LexicalCandidateSet | SearchStorageFailure;

export interface LexicalCandidateStorage {
  lexicalCandidates(input: {
    tenantId: string;
    query: string;
    terms: string[];
    limit: number;
  }): Promise<LexicalCandidateStorageResult>;
  hydrateCandidates(input: {
    tenantId: string;
    ids: string[];
  }): Promise<LexicalHydrationSet | SearchStorageFailure>;
}

export interface RankedCandidate extends LexicalCandidateDocument {
  score: number;
  rank: number;
}

export interface RankedLexicalCandidate extends LexicalScoringDocument {
  score: number;
  rank: number;
}

export type LexicalRankResult =
  | { status: 'ok'; candidates: RankedLexicalCandidate[]; needsReviewCount: number }
  | { status: 'unavailable'; code: SearchStorageFailure['code']; candidates: [] };

export type LexicalSearchResult =
  | { status: 'ok'; candidates: RankedCandidate[]; needsReviewCount: number }
  | { status: 'unavailable'; code: SearchStorageFailure['code']; candidates: [] };

export interface LexicalSearchInput {
  storage: LexicalCandidateStorage;
  tenantId: string;
  query: string;
  limit?: number;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function scoreBm25(input: Bm25Input): number {
  if (!finitePositive(input.tf)
    || !finitePositive(input.documentLength)
    || !finitePositive(input.documentCount)
    || !finitePositive(input.averageLength)
    || !Number.isFinite(input.df)
    || input.df < 0) {
    return 0;
  }
  const boundedDf = Math.min(input.df, input.documentCount);
  const inverseDocumentFrequency = Math.log(
    1 + (input.documentCount - boundedDf + 0.5) / (boundedDf + 0.5),
  );
  const lengthNormalization = 1 - BM25_B + BM25_B * (input.documentLength / input.averageLength);
  return inverseDocumentFrequency
    * ((input.tf * (BM25_K1 + 1)) / (input.tf + BM25_K1 * lengthNormalization));
}

function validateSearchInput(input: LexicalSearchInput): { query: string; terms: string[]; limit: number } {
  if (!UUID_PATTERN.test(input.tenantId)) throw new Error('tenantId must be a canonical lowercase UUID');
  const query = input.query.trim();
  if (query.length === 0 || query.length > MAX_QUERY_CHARACTERS) {
    throw new Error(`query must contain 1-${MAX_QUERY_CHARACTERS} characters`);
  }
  const terms = [...new Set(tokenizeSearchText(query))];
  if (terms.length === 0 || terms.length > MAX_QUERY_TOKENS || terms.some((term) => term.length > 256)) {
    throw new Error(`query must contain 1-${MAX_QUERY_TOKENS} searchable tokens`);
  }
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULT_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_RESULT_LIMIT}`);
  }
  return { query, terms, limit };
}

export async function lexicalSearch(input: LexicalSearchInput): Promise<LexicalSearchResult> {
  const rankedResult = await rankLexicalCandidates(input);
  if (rankedResult.status === 'unavailable') return rankedResult;
  const hydrated = await input.storage.hydrateCandidates({
    tenantId: input.tenantId,
    ids: rankedResult.candidates.map((candidate) => candidate.id),
  });
  if (hydrated.status === 'unavailable') {
    return { status: 'unavailable', code: hydrated.code, candidates: [] };
  }
  const payloadById = new Map(hydrated.candidates.map((candidate) => [candidate.id, candidate]));
  const ranked: RankedCandidate[] = [];
  for (const candidate of rankedResult.candidates) {
    const payload = payloadById.get(candidate.id);
    if (payload === undefined) continue;
    ranked.push({ ...candidate, ...payload, rank: ranked.length + 1 });
  }
  return {
    status: 'ok',
    candidates: ranked,
    needsReviewCount: rankedResult.needsReviewCount + hydrated.needsReviewCount,
  };
}

export async function rankLexicalCandidates(input: LexicalSearchInput): Promise<LexicalRankResult> {
  const { query, terms, limit } = validateSearchInput(input);
  const stored = await input.storage.lexicalCandidates({
    tenantId: input.tenantId,
    query,
    terms,
    limit,
  });
  if (stored.status === 'unavailable') {
    return { status: 'unavailable', code: stored.code, candidates: [] };
  }

  const candidates = stored.candidates.map((candidate) => {
    let score = 0;
    for (const term of terms) {
      const tf = Object.prototype.hasOwnProperty.call(candidate.termFrequencies, term)
        ? candidate.termFrequencies[term] ?? 0
        : 0;
      score += scoreBm25({
        tf,
        df: stored.documentFrequencies[term] ?? 0,
        documentLength: candidate.tokenCount,
        documentCount: stored.corpus.documentCount,
        averageLength: stored.corpus.averageLength,
      });
    }
    return { ...candidate, score, rank: 0 };
  });
  candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return {
    status: 'ok',
    candidates: candidates.slice(0, limit).map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    needsReviewCount: stored.needsReviewCount,
  };
}

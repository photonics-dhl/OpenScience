const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_RESULT_LIMIT = 100;

export interface FusedCandidate {
  id: string;
  score: number;
  rank: number;
  lexicalRank?: number;
  denseRank?: number;
}

function validateList(values: readonly string[]): void {
  if (values.length > MAX_RESULT_LIMIT || new Set(values).size !== values.length
    || values.some((value) => !HASH_PATTERN.test(value))) throw new Error('fusion_input_invalid');
}

export function fuseRankedLists(input: {
  lexical: readonly string[];
  dense: readonly string[];
  k?: number;
  limit: number;
}): FusedCandidate[] {
  validateList(input.lexical);
  validateList(input.dense);
  const k = input.k ?? 60;
  if (!Number.isInteger(k) || k < 1 || k > 1_000) throw new Error('fusion_k_invalid');
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULT_LIMIT) {
    throw new Error('fusion_limit_invalid');
  }
  const candidates = new Map<string, Omit<FusedCandidate, 'rank'>>();
  const add = (id: string, rank: number, kind: 'lexicalRank' | 'denseRank') => {
    const current = candidates.get(id) ?? { id, score: 0 };
    current.score += 1 / (k + rank);
    current[kind] = rank;
    candidates.set(id, current);
  };
  input.lexical.forEach((id, index) => add(id, index + 1, 'lexicalRank'));
  input.dense.forEach((id, index) => add(id, index + 1, 'denseRank'));
  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, input.limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

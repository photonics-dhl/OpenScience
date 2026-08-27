import { describe, expect, it } from 'vitest';

import { fuseRankedLists } from '../src/fusion';

describe('reciprocal-rank fusion', () => {
  it('promotes overlap and keeps stable chunk-ID ties', () => {
    const result = fuseRankedLists({
      lexical: ['b', 'a'].map((value) => value.repeat(64)),
      dense: ['b', 'c'].map((value) => value.repeat(64)),
      k: 60,
      limit: 10,
    });
    expect(result.map((candidate) => candidate.id)).toEqual([
      'b'.repeat(64),
      'a'.repeat(64),
      'c'.repeat(64),
    ]);
    expect(result[0]).toMatchObject({ lexicalRank: 1, denseRank: 1, rank: 1 });
    expect(result[0]!.score).toBeCloseTo(2 / 61, 12);
    expect(result[1]!.score).toBe(result[2]!.score);
  });

  it('rejects duplicate IDs and result limits above 100', () => {
    expect(() => fuseRankedLists({
      lexical: ['a'.repeat(64), 'a'.repeat(64)], dense: [], k: 60, limit: 10,
    })).toThrow('fusion_input_invalid');
    expect(() => fuseRankedLists({ lexical: [], dense: [], k: 60, limit: 101 }))
      .toThrow('fusion_limit_invalid');
  });
});

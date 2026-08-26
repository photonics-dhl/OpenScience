import { describe, expect, it } from 'vitest';
import type { ClaimNode } from '../../src';

const provenance = {
  source: 'deterministic',
  provider: 'openscience-fixture',
  providerVersion: '1.0.0',
  inputHash: 'a'.repeat(64),
} as const;

function claim(id: string, kind: ClaimNode['kind'] = 'core', parentClaimId?: string): ClaimNode {
  return {
    id,
    researchObjectId: 'ro-1',
    versionId: 'version-1',
    parentClaimId,
    kind,
    statement: `Statement ${id}`,
    assessment: 'supported',
    conditions: [],
    limitations: [],
    evidenceIds: [],
    counterEvidenceIds: [],
    provenance,
  };
}

async function validate(claims: readonly ClaimNode[]): Promise<readonly ClaimNode[]> {
  const domain = await import('../../src') as unknown as {
    validateClaimGraph(value: readonly ClaimNode[]): readonly ClaimNode[];
  };
  return domain.validateClaimGraph(claims);
}

describe('validateClaimGraph', () => {
  it('accepts 3-7 core Claims and scoped child Claims', async () => {
    const graph = [
      claim('core-1'),
      claim('core-2'),
      claim('core-3'),
      claim('method-1', 'method', 'core-1'),
      claim('boundary-1', 'boundary', 'method-1'),
    ];

    await expect(validate(graph)).resolves.toEqual(graph);
  });

  it.each([
    [[claim('core-1'), claim('core-2')]],
    [Array.from({ length: 8 }, (_, index) => claim(`core-${index + 1}`))],
  ])('rejects a graph outside the 3-7 core Claim publication boundary', async (graph) => {
    await expect(validate(graph)).rejects.toThrow(/3-7/);
  });

  it('rejects duplicate IDs and a core Claim with a parent', async () => {
    await expect(validate([
      claim('core-1'),
      claim('core-1'),
      claim('core-3'),
    ])).rejects.toThrow(/duplicate/);
    await expect(validate([
      claim('core-1'),
      claim('core-2', 'core', 'core-1'),
      claim('core-3'),
    ])).rejects.toThrow(/core Claim.*parent/);
  });

  it('rejects a child whose parent is missing or belongs to another scope', async () => {
    await expect(validate([
      claim('core-1'),
      claim('core-2'),
      claim('core-3'),
      claim('child-1', 'supporting', 'missing'),
    ])).rejects.toThrow(/parent/);

    const foreign = { ...claim('foreign', 'supporting', 'core-1'), versionId: 'version-2' };
    await expect(validate([
      claim('core-1'),
      claim('core-2'),
      claim('core-3'),
      foreign,
    ])).rejects.toThrow(/same Research Object and Version/);
  });

  it('rejects circular child dependencies', async () => {
    await expect(validate([
      claim('core-1'),
      claim('core-2'),
      claim('core-3'),
      claim('child-a', 'supporting', 'child-b'),
      claim('child-b', 'boundary', 'child-a'),
    ])).rejects.toThrow(/cycle/);
  });

  it('validates a deep acyclic graph without consuming the JavaScript call stack', async () => {
    const graph: ClaimNode[] = [claim('core-1'), claim('core-2'), claim('core-3')];
    let parentClaimId = 'core-1';
    for (let index = 0; index < 20_000; index += 1) {
      const id = `supporting-${index}`;
      graph.push(claim(id, 'supporting', parentClaimId));
      parentClaimId = id;
    }

    await expect(validate(graph)).resolves.toBe(graph);
  });
});

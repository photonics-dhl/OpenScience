import { describe, expect, it } from 'vitest';
import {
  resolveSourceLocator,
  type DocumentBlock,
  type DocumentSourceMap,
} from '@openscience/domain';
import { chunkDocument } from '../src/chunker';
import { tokenizeSearchText } from '../src/tokenizer';

const parser = { name: 'fixture-parser', version: '1.0.0' };

function block(id: string, kind: DocumentBlock['kind'], text: string, y: number): DocumentBlock {
  return {
    id,
    kind,
    text,
    boundingBox: { x: 10, y, width: 500, height: 20 },
    parser,
    transformations: [],
  };
}

function sourceMap(): DocumentSourceMap {
  const first = Array.from({ length: 540 }, (_, index) => `pulse${index}`).join(' ');
  const second = Array.from({ length: 510 }, (_, index) => `spectrum${index}`).join(' ');
  const reference = Array.from({ length: 120 }, (_, index) => `reference${index}`).join(' ');
  return {
    artifactId: '11111111-1111-4111-8111-111111111111',
    contentHash: 'a'.repeat(64),
    parser,
    pages: [{
      page: 1,
      width: 600,
      height: 800,
      blocks: [
        block('paragraph-1', 'paragraph', first, 10),
        block('paragraph-2', 'paragraph', second, 40),
        block('reference-1', 'reference', reference, 70),
      ],
    }],
  };
}

describe('locator-safe semantic chunking', () => {
  it('tokenizes Latin words and CJK bigrams deterministically', () => {
    expect(tokenizeSearchText('Ultrafast 光谱测量 ultrafast')).toEqual([
      'ultrafast', '光谱', '谱测', '测量', 'ultrafast',
    ]);
  });

  it('produces stable bounded chunks whose locators round-trip', () => {
    const map = sourceMap();
    const input = {
      sourceMap: map,
      claimIdsByBlockId: {
        'paragraph-1': ['claim-b', 'claim-a'],
        'paragraph-2': ['claim-a'],
      },
    };

    const chunks = chunkDocument(input);
    expect(chunks).toEqual(chunkDocument(input));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 1_024)).toBe(true);
    expect(chunks.every((chunk) => chunk.text.length <= 65_536)).toBe(true);
    expect(chunks.slice(0, -1).every((chunk) => chunk.tokenCount >= 512)).toBe(true);
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(chunks.map((_, index) => index));
    expect(new Set(chunks.map((chunk) => chunk.id)).size).toBe(chunks.length);
    expect(chunks.flatMap((chunk) => chunk.locators).every((locator) => {
      resolveSourceLocator(map, locator);
      return true;
    })).toBe(true);
    expect(chunks.flatMap((chunk) => chunk.claimIds)).toContain('claim-a');
  });

  it('splits a later paragraph to fill an undersized non-final chunk', () => {
    const map = sourceMap();
    map.pages[0]!.blocks = [
      block('paragraph-1', 'paragraph', Array.from({ length: 300 }, (_, index) => `first${index}`).join(' '), 10),
      block('paragraph-2', 'paragraph', Array.from({ length: 800 }, (_, index) => `second${index}`).join(' '), 40),
    ];

    const chunks = chunkDocument({ sourceMap: map });
    expect(chunks.map((chunk) => chunk.tokenCount)).toEqual([1_024, 76]);
    expect(chunks.flatMap((chunk) => chunk.locators).every((locator) => {
      resolveSourceLocator(map, locator);
      return true;
    })).toBe(true);
  });

  it('uses a null-prototype frequency map for prototype-named terms', () => {
    const map = sourceMap();
    map.pages[0]!.blocks = [block('paragraph-1', 'paragraph', 'constructor constructor valueOf', 10)];

    const [chunk] = chunkDocument({ sourceMap: map });
    expect(Object.getPrototypeOf(chunk!.termFrequencies)).toBeNull();
    expect(chunk!.termFrequencies.constructor).toBe(2);
    expect(chunk!.termFrequencies.valueof).toBe(1);
  });

  it('normalizes content hashes and bounds claim mappings', () => {
    const map = sourceMap();
    map.contentHash = 'A'.repeat(64);
    const [chunk] = chunkDocument({ sourceMap: map, claimIdsByBlockId: { 'paragraph-1': ['claim-a'] } });
    expect(chunk!.contentHash).toBe('a'.repeat(64));
    expect(chunk!.locators.every((locator) => locator.contentHash === 'a'.repeat(64))).toBe(true);

    expect(() => chunkDocument({
      sourceMap: sourceMap(),
      claimIdsByBlockId: { 'paragraph-1': Array.from({ length: 33 }, (_, index) => `claim-${index}`) },
    })).toThrow(/claim limit/);

    const invalidArtifact = sourceMap();
    invalidArtifact.artifactId = 'artifact-1';
    expect(() => chunkDocument({ sourceMap: invalidArtifact })).toThrow(/canonical lowercase UUID/);
  });

  it('never splits an oversized indivisible scholarly block', () => {
    const map = sourceMap();
    map.pages[0]!.blocks = [
      block('table-1', 'table', Array.from({ length: 1_025 }, (_, index) => `cell${index}`).join(' '), 10),
    ];

    expect(() => chunkDocument({ sourceMap: map })).toThrow(/indivisible block exceeds 1024 tokens/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveSourceLocator,
  parseDocumentSourceMap,
  type DocumentBlock,
  type DocumentSourceMap,
} from '@openscience/domain';
import { chunkDocument, chunkDocumentForEmbedding } from '../src/chunker';
import { EmbeddingClient } from '../src/embedder';
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
  it('keeps the real page14 chunk unchanged while preparing bounded table embedding windows', async () => {
    const fixture = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/long-docling-table.json'), 'utf8'));
    const map = parseDocumentSourceMap(fixture.sourceMap), table = map.pages[0]!.blocks[0]!;
    const text = table.text!;
    expect(text.length).toBe(3051);
    expect(tokenizeSearchText(text).length).toBe(607);
    const input = { sourceMap: map, claimIdsByBlockId: { [table.id]: ['claim-a'] } };
    // This reproduces the HTTP token-limit boundary, not an executed BGE count.
    const counter = vi.fn(async (texts: string[]) => texts[0] === text ? undefined : [1024]);
    const result = await chunkDocumentForEmbedding(input, counter);
    expect(result.embeddingAvailable).toBe(true);
    expect(result.chunks).toEqual(chunkDocument(input));
    const windows = result.embeddingWindows![0]!;
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.join('')).toBe(text);
    for (const window of windows) {
      expect(counter).toHaveBeenCalledWith([window]);
      for (const row of new Set(window.match(/\[row \d+,/gu))) {
        const pattern = new RegExp(row!.replace('[', '\\['), 'gu');
        expect(window.match(pattern)).toHaveLength(text.match(pattern)!.length);
      }
    }
    expect(result.chunks[0]!.locators[0]!.charRange).toBeUndefined();
    resolveSourceLocator(map, result.chunks[0]!.locators[0]!);
  });
  it('keeps a merged-row connected group intact and covers each cell once', async () => {
    const text = '[rows 1–3, column 1] shared condition\n[row 1, column 2] first\n[row 2, column 2] second\n[row 3, column 2] third\n[row 4, column 1] independent\n[row 4, column 2] fourth';
    const map = sourceMap(); map.pages[0]!.blocks = [block('table', 'table', text, 10)];
    const result = await chunkDocumentForEmbedding({ sourceMap: map }, async texts => texts[0] === text ? undefined : [1024]);
    expect(result.embeddingAvailable).toBe(true);
    expect(result.embeddingWindows![0]).toEqual([text.slice(0, text.indexOf('[row 4,')), text.slice(text.indexOf('[row 4,'))]);
    expect(result.chunks).toEqual(chunkDocument({ sourceMap: map }));
  });
  it('keeps the established lexical result when only a new window tokenizer call fails', async () => {
    const text = '[row 1, column 1] first\n[row 2, column 1] second';
    const map = sourceMap(); map.pages[0]!.blocks = [block('table', 'table', text, 10)];
    const counter = async (texts: string[]) => {
      if (texts[0] === text) return undefined;
      throw new Error('embedding_transport_unavailable');
    };
    await expect(chunkDocumentForEmbedding({ sourceMap: map }, counter)).resolves.toEqual({
      chunks: chunkDocument({ sourceMap: map }), embeddingAvailable: false,
    });
  });
  it('does not let temporary table views change later paragraph partitions or chunk identities', async () => {
    const text = Array.from({ length: 96 }, (_, i) => `[row ${i + 1}, column 1] symbol\n[row ${i + 1}, column 2] definition`).join('\n');
    const map = sourceMap();
    map.pages[0]!.blocks = [block('table', 'table', text, 10), block('later', 'paragraph', 'ordinary '.repeat(256), 40)];
    const count = (value: string) => {
      if (value.includes('[row')) return undefined;
      const size = tokenizeSearchText(value).length;
      return size <= 32 ? [size] : undefined;
    };
    const baseline = await chunkDocumentForEmbedding({ sourceMap: map }, async texts => texts[0] === text ? [1024] : count(texts[0]!));
    const result = await chunkDocumentForEmbedding({ sourceMap: map }, async texts => {
      const value = texts[0]!;
      return value.includes('[row') && new Set(value.match(/\[row \d+,/gu)).size === 1 ? [100] : count(value);
    });
    expect(result.embeddingAvailable).toBe(false);
    expect(result.chunks).toEqual(baseline.chunks);
    expect(result.embeddingWindows).toBeUndefined();
  });
  it('does not start temporary windows after a character-only rejection without actual tokenization', async () => {
    const text = `[row 1, column 1] ${'x'.repeat(10000)}\n[row 2, column 1] ${'y'.repeat(10000)}`;
    const map = sourceMap(); map.pages[0]!.blocks = [block('table', 'table', text, 10)];
    const counter = vi.fn(async () => [1024]);
    const result = await chunkDocumentForEmbedding({ sourceMap: map }, counter);
    expect(result).toEqual({ chunks: chunkDocument({ sourceMap: map }), embeddingAvailable: false });
    expect(counter).not.toHaveBeenCalled();
  });
  it.each([
    '[rows 1–3, column 1] shared\n[row 1, column 2] first\n[row 2, column 2] second\n[row 3, column 2] third',
    '[row 2, column 1] second\n[row 1, column 1] first',
  ])('retains lexical fallback for a table that cannot be split safely', async text => {
    const map = sourceMap(); map.pages[0]!.blocks = [block('table', 'table', text, 10)];
    const result = await chunkDocumentForEmbedding({ sourceMap: map }, async () => undefined);
    expect(result.embeddingAvailable).toBe(false);
    expect(result.embeddingWindows).toBeUndefined();
    expect(result.chunks).toEqual(chunkDocument({ sourceMap: map }));
  });
  it('shares the 100-view and 200-tokenizer-attempt limits with ordinary chunks', async () => {
    const map = sourceMap();
    const text = Array.from({ length: 32 }, (_, i) => `[row ${i + 1}, column 1] symbol\n[row ${i + 1}, column 2] definition`).join('\n');
    map.pages[0]!.blocks = [
      ...Array.from({ length: 70 }, (_, i) => block(`ordinary-${i}`, 'reference', 'ordinary '.repeat(600), 10)),
      block('table', 'table', text, 10),
    ];
    const counter = vi.fn(async (texts: string[]) => {
      const value = texts[0]!;
      if (!value.includes('[row')) return [600];
      return new Set(value.match(/\[row \d+,/gu)).size === 1 ? [100] : undefined;
    });
    const result = await chunkDocumentForEmbedding({ sourceMap: map }, counter);
    expect(result.embeddingAvailable).toBe(false);
    expect(result.embeddingWindows).toBeUndefined();
    expect(counter.mock.calls.length).toBeLessThanOrEqual(200);
    expect(result.chunks.find(chunk => chunk.locators.some(locator => locator.blockId === 'table'))!.text).toBe(text);
  });
  it.each(['table', 'equation', 'reference'] as const)('retains a whole %s and its locator when the embedding tokenizer rejects it', async (kind) => {
    const map = sourceMap();
    const text = Array.from({ length: 607 }, (_, index) => `x${index}`).join(' ');
    map.pages[0]!.page = 14;
    map.pages[0]!.blocks = [block('oversized', kind, text, 10), block('after', 'paragraph', 'following text', 40)];
    const client = new EmbeddingClient({
      baseUrl: 'http://embedding-worker:8080',
      fetchImpl: async (_url, init) => {
        const { texts } = JSON.parse(String(init?.body));
        return texts[0].includes('x0')
          ? new Response(JSON.stringify({ schemaVersion: 1, error: 'token_limit_exceeded' }), { status: 422, headers: { 'content-type': 'application/json' } })
          : new Response(JSON.stringify({ schemaVersion: 1, tokenCounts: [2] }), { headers: { 'content-type': 'application/json' } });
      },
    });
    const result = await chunkDocumentForEmbedding({ sourceMap: map, claimIdsByBlockId: { oversized: ['claim-a'] } },
      texts => client.tokenCounts({ purpose: 'chunk', texts }));
    expect(result.embeddingAvailable).toBe(false);
    expect(result.chunks.map(chunk => chunk.text)).toEqual([text, 'following text']);
    expect(result.chunks[0]).toMatchObject({ tokenCount: 607, claimIds: ['claim-a'], locators: [{
      artifactId: map.artifactId, contentHash: map.contentHash, blockId: 'oversized', page: 14,
      boundingBox: { x: 10, y: 10, width: 500, height: 20 },
    }] });
    expect(result.chunks[0]!.locators[0]!.charRange).toBeUndefined();
    for (const chunk of result.chunks) for (const locator of chunk.locators) resolveSourceLocator(map, locator);
  });

  it('still refines divisible text into dense-ready chunks without losing source characters', async () => {
    const map = sourceMap();
    const text = 'alpha beta gamma delta';
    map.pages[0]!.blocks = [block('paragraph-1', 'paragraph', text, 10)];
    const result = await chunkDocumentForEmbedding({ sourceMap: map }, async texts =>
      texts[0] === text ? undefined : [1024]);
    expect(result.embeddingAvailable).toBe(true);
    expect(result.chunks.map(chunk => chunk.text)).toEqual(['alpha beta ', 'gamma delta']);
    expect(result.chunks.flatMap(chunk => chunk.locators).map(locator => locator.charRange))
      .toEqual([{ start: 0, end: 11 }, { start: 11, end: 22 }]);
  });

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

  it('changes chunk identity when its evidence claim binding changes', () => {
    const map = sourceMap();
    const [first] = chunkDocument({
      sourceMap: map,
      claimIdsByBlockId: { 'paragraph-1': ['claim-a', 'claim-b'] },
    });
    const [sameClaimsDifferentOrder] = chunkDocument({
      sourceMap: map,
      claimIdsByBlockId: { 'paragraph-1': ['claim-b', 'claim-a'] },
    });
    const [differentClaim] = chunkDocument({
      sourceMap: map,
      claimIdsByBlockId: { 'paragraph-1': ['claim-c'] },
    });

    expect(first!.id).toBe(sameClaimsDifferentOrder!.id);
    expect(first!.id).not.toBe(differentClaim!.id);
  });

  it('never splits an oversized indivisible scholarly block', () => {
    const map = sourceMap();
    map.pages[0]!.blocks = [
      block('table-1', 'table', Array.from({ length: 1_025 }, (_, index) => `cell${index}`).join(' '), 10),
    ];

    expect(() => chunkDocument({ sourceMap: map })).toThrow(/indivisible block exceeds 1024 tokens/);
  });

  it('stops generation as soon as the persisted chunk cap is exceeded', () => {
    const map = sourceMap();
    map.pages[0]!.blocks = Array.from({ length: 101 }, (_, blockIndex) => block(
      `reference-${blockIndex}`,
      'reference',
      Array.from({ length: 1_024 }, (_, tokenIndex) => `term${blockIndex}x${tokenIndex}`).join(' '),
      10,
    ));

    expect(() => chunkDocument({ sourceMap: map })).toThrow('search chunk limit exceeded');
  });
});

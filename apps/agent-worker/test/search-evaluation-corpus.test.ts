import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type SearchChunk = {
  id: string;
  language: 'zh' | 'en';
  text: string;
  locator: {
    artifactId: string;
    contentHash: string;
    page: number;
    bbox?: [number, number, number, number];
  };
};

type SearchQuery = {
  id: string;
  language: 'zh' | 'en';
  text: string;
  relevantChunkIds: string[];
};

type SearchEvaluationCorpus = {
  schemaVersion: number;
  rights: string;
  chunks: SearchChunk[];
  queries: SearchQuery[];
};

const corpusPath = new URL('../../../test/research-intelligence/search-evaluation.json', import.meta.url);

describe('search evaluation corpus', () => {
  it('provides a self-authored bilingual retrieval gate with valid locators', async () => {
    const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as SearchEvaluationCorpus;
    const chunkIds = new Set(corpus.chunks.map(({ id }) => id));

    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.rights).toBe('self-authored');
    expect(corpus.chunks.length).toBeGreaterThanOrEqual(16);
    expect(chunkIds.size).toBe(corpus.chunks.length);
    expect(corpus.queries.length).toBeGreaterThanOrEqual(24);
    expect(new Set(corpus.queries.map(({ id }) => id)).size).toBe(corpus.queries.length);
    expect(corpus.queries.some(({ language }) => language === 'zh')).toBe(true);
    expect(corpus.queries.some(({ language }) => language === 'en')).toBe(true);

    for (const chunk of corpus.chunks) {
      expect(chunk.text.trim().length, chunk.id).toBeGreaterThanOrEqual(80);
      expect(chunk.locator.artifactId, chunk.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(chunk.locator.contentHash, chunk.id).toMatch(/^[a-f0-9]{64}$/);
      expect(chunk.locator.page, chunk.id).toBeGreaterThan(0);
      if (chunk.locator.bbox) {
        expect(chunk.locator.bbox, chunk.id).toHaveLength(4);
        expect(chunk.locator.bbox[2], chunk.id).toBeGreaterThan(chunk.locator.bbox[0]);
        expect(chunk.locator.bbox[3], chunk.id).toBeGreaterThan(chunk.locator.bbox[1]);
      }
    }

    for (const query of corpus.queries) {
      expect(query.text.trim().length, query.id).toBeGreaterThanOrEqual(4);
      expect(query.relevantChunkIds.length, query.id).toBeGreaterThan(0);
      expect(query.relevantChunkIds.every((id) => chunkIds.has(id)), query.id).toBe(true);
    }
  });
});

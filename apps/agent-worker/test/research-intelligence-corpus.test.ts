import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { createParserSelfTestFixtures } from '../src/parser-self-test';
import {
  buildResearchIntelligenceManifest,
  parseResearchCorpusCase,
  RESEARCH_INTELLIGENCE_CORPUS,
} from './support/research-intelligence-corpus';

const manifestPath = new URL('../../../test/research-intelligence/manifest.json', import.meta.url);

describe('research-intelligence fixture contract', () => {
  it('returns fresh deterministic copies', () => {
    const first = createParserSelfTestFixtures();
    const second = createParserSelfTestFixtures();

    expect(first.pdf).not.toBe(second.pdf);
    expect(first.docx).not.toBe(second.docx);
    expect(createHash('sha256').update(first.pdf).digest('hex'))
      .toBe(createHash('sha256').update(second.pdf).digest('hex'));
    expect(createHash('sha256').update(first.docx).digest('hex'))
      .toBe(createHash('sha256').update(second.docx).digest('hex'));
  });
});

describe('research-intelligence corpus contract', () => {
  it('defines six deterministic self-authored cases with unique hashes', () => {
    expect(RESEARCH_INTELLIGENCE_CORPUS).toHaveLength(6);
    expect(new Set(RESEARCH_INTELLIGENCE_CORPUS.map(({ id }) => id)).size).toBe(6);
    expect(RESEARCH_INTELLIGENCE_CORPUS.every(({ rights }) => rights === 'self-authored')).toBe(true);

    const hashes = RESEARCH_INTELLIGENCE_CORPUS.map(({ content }) => (
      createHash('sha256').update(content).digest('hex')
    ));
    expect(new Set(hashes).size).toBe(6);
    expect(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
  });

  it('keeps the tracked manifest byte-stable', async () => {
    const expected = `${JSON.stringify(buildResearchIntelligenceManifest(), null, 2)}\n`;
    if (process.env.WRITE_RESEARCH_INTELLIGENCE_MANIFEST === '1') {
      await mkdir(new URL('../../../test/research-intelligence/', import.meta.url), { recursive: true });
      await writeFile(manifestPath, expected, 'utf8');
    }

    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(expected);
  });

  it('matches the current parser status and expected text contract', async () => {
    for (const corpusCase of RESEARCH_INTELLIGENCE_CORPUS) {
      const parsed = await parseResearchCorpusCase(corpusCase);
      expect(parsed.status, corpusCase.id).toBe(corpusCase.expectedCurrentStatus);
      if (corpusCase.expectedText) {
        expect(parsed.status, corpusCase.id).toBe('ready');
        expect(parsed.status === 'ready' && parsed.text.includes(corpusCase.expectedText), corpusCase.id).toBe(true);
      }
    }
  }, 30_000);
});

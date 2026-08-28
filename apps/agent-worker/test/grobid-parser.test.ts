import { describe, expect, it } from 'vitest';
import type { DocumentBlock, DocumentSourceMap } from '@openscience/domain';
import {
  enrichWithGrobid,
  type GrobidEnrichmentResult,
} from '../src/parsers/grobid-parser';

const HASH = 'a'.repeat(64);
const LAYOUT = { name: 'openscience-layout-normalizer', version: '2.0.0' } as const;
const NATIVE = { name: 'native-pdf', version: '1.0.0' } as const;
const GROBID = { name: 'grobid', version: '0.9.1-crf', modelHash: 'sha256:fixture' } as const;

function nativeBlock(overrides: Partial<DocumentBlock> = {}): DocumentBlock {
  return {
    id: `block:${HASH}:1:1`,
    kind: 'paragraph',
    text: 'Native introduction',
    boundingBox: { x: 50, y: 80, width: 500, height: 30 },
    confidence: 0.98,
    parser: { ...NATIVE },
    transformations: [{ stage: 'extract_text', processor: { ...NATIVE } }],
    ...overrides,
  };
}

function sourceMap(blocks: DocumentBlock[] = []): DocumentSourceMap {
  return {
    artifactId: 'artifact-grobid-fixture',
    contentHash: HASH,
    parser: { ...LAYOUT },
    pages: [{ page: 1, width: 600, height: 800, blocks }],
  };
}

function succeeded(tei: string): GrobidEnrichmentResult {
  return { status: 'succeeded', parser: { ...GROBID }, tei };
}

describe('enrichWithGrobid', () => {
  it('handles a default TEI namespace and maps section headings and references only', () => {
    const original = sourceMap();
    const enriched = enrichWithGrobid(original, succeeded(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <text><body><div><head coords="1,50,80,500,30">Introduction</head></div></body></text>
        <back><listBibl>
          <biblStruct coords="1,50,700,500,40"><note type="raw_reference">[1] OpenScience Team. Reproducible evidence. 2026.</note></biblStruct>
        </listBibl></back>
      </TEI>
    `));

    expect(enriched.pages[0]?.blocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: 'heading', text: 'Introduction' },
      { kind: 'reference', text: '[1] OpenScience Team. Reproducible evidence. 2026.' },
    ]);
    expect(enriched.artifactId).toBe(original.artifactId);
    expect(enriched.contentHash).toBe(original.contentHash);
    expect(enriched.pages[0]).toMatchObject({ page: 1, width: 600, height: 800 });
    expect(enriched.parser).toEqual(LAYOUT);
  });

  it('handles prefixed TEI elements and unions same-page coordinate fragments', () => {
    const enriched = enrichWithGrobid(sourceMap(), succeeded(`
      <tei:TEI xmlns:tei="http://www.tei-c.org/ns/1.0">
        <tei:text><tei:body><tei:div>
          <tei:head tei:coords="1,40,40,200,20;1,40,62,300,20">Methods and reproducibility</tei:head>
        </tei:div></tei:body></tei:text>
      </tei:TEI>
    `));

    expect(enriched.pages[0]?.blocks[0]).toMatchObject({
      kind: 'heading',
      text: 'Methods and reproducibility',
      boundingBox: { x: 40, y: 40, width: 300, height: 42 },
      parser: GROBID,
      transformations: [
        { stage: 'classify', processor: GROBID },
        { stage: 'merge', processor: GROBID },
      ],
    });
  });

  it('rejects wrong or undeclared element namespaces instead of trusting local names', () => {
    const original = sourceMap();
    const body = '<evil:text><evil:body><evil:head coords="1,40,40,300,20">Injected heading</evil:head></evil:body></evil:text>';

    expect(enrichWithGrobid(original, succeeded(`<evil:TEI xmlns:evil="urn:not-tei">${body}</evil:TEI>`))).toBe(original);
    expect(enrichWithGrobid(original, succeeded(`<evil:TEI>${body}</evil:TEI>`))).toBe(original);
  });

  it('keeps structured reference fields separated in the normalized reference text', () => {
    const enriched = enrichWithGrobid(sourceMap(), succeeded(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0"><text><back><listBibl>
        <biblStruct coords="1,40,700,520,35"><analytic><author><persName><forename>Ada</forename><surname>Lovelace</surname></persName></author><title>Reproducible evidence</title></analytic><monogr><imprint><date when="2026">2026</date></imprint></monogr></biblStruct>
      </listBibl></back></text></TEI>
    `));

    expect(enriched.pages[0]?.blocks[0]?.text).toBe('Ada Lovelace Reproducible evidence 2026');
  });

  it('returns the original map unchanged for malformed or entity-bearing XML', () => {
    const original = sourceMap([nativeBlock()]);

    expect(enrichWithGrobid(original, succeeded('<TEI><text><head>broken</text></TEI>'))).toEqual(original);
    expect(enrichWithGrobid(original, succeeded('<!DOCTYPE TEI [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><TEI>&xxe;</TEI>'))).toEqual(original);
    expect(enrichWithGrobid(original, succeeded('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,,80,500,30">Broken x</head></text></TEI>'))).toBe(original);
    expect(enrichWithGrobid(original, succeeded('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,50,,500,30">Broken y</head></text></TEI>'))).toBe(original);
  });

  it('does not create an invalid text-bearing block from an empty TEI element', () => {
    const original = sourceMap();
    expect(enrichWithGrobid(original, succeeded('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,40,40,300,20"/></text></TEI>'))).toBe(original);
  });

  it('fails closed when TEI text or parser metadata violates the Domain contract', () => {
    const original = sourceMap();
    const oversized = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,40,40,300,20">${'x'.repeat(50_001)}</head></text></TEI>`;
    const blankMetadata: GrobidEnrichmentResult = {
      status: 'succeeded',
      parser: { name: ' ', version: '0.9.1-crf' },
      tei: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,40,40,300,20">Heading</head></text></TEI>',
    };

    expect(enrichWithGrobid(original, succeeded(oversized))).toBe(original);
    expect(enrichWithGrobid(original, blankMetadata)).toBe(original);
  });

  it('fails closed rather than exceeding per-block transformation limits', () => {
    const originalBlock = nativeBlock({
      confidence: 0.1,
      transformations: Array.from({ length: 100 }, () => ({ stage: 'extract_text' as const, processor: { ...NATIVE } })),
    });
    const original = sourceMap([originalBlock]);
    const result = succeeded('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,50,80,500,30">Native introduction</head></text></TEI>');

    expect(enrichWithGrobid(original, result)).toBe(original);
  });

  it('fails closed rather than exceeding the 10,000-block source-map limit', () => {
    const blocks = Array.from({ length: 10_000 }, (_, index) => nativeBlock({
      id: `native-${index}`,
      text: `Native block ${index}`,
      boundingBox: { x: 10, y: 200, width: 100, height: 10 },
    }));
    const original = sourceMap(blocks);
    const result = succeeded('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,50,20,500,30">Heading</head></text></TEI>');

    expect(enrichWithGrobid(original, result)).toBe(original);
  });

  it('returns the non-enriched layout map after a timeout', () => {
    const original = sourceMap([nativeBlock()]);
    const timedOut: GrobidEnrichmentResult = { status: 'failed', errorCode: 'timeout' };

    expect(enrichWithGrobid(original, timedOut)).toBe(original);
  });

  it('upgrades only matching low-confidence native classification while preserving native text and ID', () => {
    const originalBlock = nativeBlock({ confidence: 0.45 });
    const original = sourceMap([originalBlock]);
    const enriched = enrichWithGrobid(original, succeeded(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><head coords="1,50,80,500,30">Native introduction</head></body></text></TEI>
    `));

    expect(enriched.pages[0]?.blocks[0]).toEqual({
      ...originalBlock,
      kind: 'heading',
      confidence: 0.9,
      transformations: [
        ...originalBlock.transformations,
        { stage: 'classify', processor: GROBID },
      ],
    });
  });

  it('does not replace or duplicate higher-confidence native text on a conflicting region', () => {
    const originalBlock = nativeBlock({ kind: 'heading', confidence: 0.99 });
    const original = sourceMap([originalBlock]);
    const enriched = enrichWithGrobid(original, succeeded(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><head coords="1,50,80,500,30">Provider rewrite</head></body></text></TEI>
    `));

    expect(enriched.pages[0]?.blocks).toEqual([originalBlock]);
    expect(enriched.pages[0]?.blocks[0]?.id).toBe(`block:${HASH}:1:1`);
    expect(enriched.pages[0]?.blocks[0]?.text).toBe('Native introduction');
    expect(enriched.pages[0]?.blocks[0]?.parser).toEqual(NATIVE);
  });

  it('assigns deterministic enrichment IDs without renumbering existing blocks', () => {
    const originalBlock = nativeBlock({ boundingBox: { x: 50, y: 200, width: 500, height: 30 } });
    const original = sourceMap([originalBlock]);
    const result = succeeded(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><head coords="1,50,20,500,30">Abstract</head></body></text></TEI>
    `);

    const first = enrichWithGrobid(original, result);
    const second = enrichWithGrobid(original, result);

    expect(first.pages[0]?.blocks.find(({ text }) => text === 'Native introduction')?.id).toBe(originalBlock.id);
    expect(first.pages[0]?.blocks.map(({ id }) => id)).toEqual(second.pages[0]?.blocks.map(({ id }) => id));
    expect(first.pages[0]?.blocks[0]?.id).toMatch(/^block:grobid:[a-f0-9]{64}$/);
  });

  it('keeps a new right-column heading after all left-column blocks', () => {
    const original = sourceMap([
      nativeBlock({ id: 'left-1', text: 'Left first', boundingBox: { x: 50, y: 100, width: 220, height: 30 } }),
      nativeBlock({ id: 'left-2', text: 'Left second', boundingBox: { x: 50, y: 200, width: 220, height: 30 } }),
      nativeBlock({ id: 'right-1', text: 'Right paragraph', boundingBox: { x: 330, y: 100, width: 220, height: 30 } }),
    ]);
    const result = succeeded('<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><head coords="1,330,50,220,30">Right heading</head></text></TEI>');

    expect(enrichWithGrobid(original, result).pages[0]?.blocks.map(({ text }) => text)).toEqual([
      'Left first',
      'Left second',
      'Right heading',
      'Right paragraph',
    ]);
  });
});

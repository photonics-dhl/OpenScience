import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLayoutParser, type LayoutAdapter } from '../src/parsers/layout-parser';
import { runDocumentParser } from '../src/parsers/base-parser';
import {
  SafeParserWarningCode,
  type ParserStageResult,
  type StageBlock,
} from '../src/parsers/job-protocol';
import type { ParserInput } from '../src/parsers/types';

const METADATA = { name: 'normalized-layout-fixture', version: '2.0.0', modelHash: 'fixture-model' } as const;

function input(): ParserInput {
  const content = Buffer.from('%PDF-1.7\nself-authored layout fixture', 'utf8');
  return {
    artifactId: 'artifact-layout-fixture',
    contentHash: createHash('sha256').update(content).digest('hex'),
    content,
    mediaType: 'application/pdf',
  };
}

function block(
  kind: StageBlock['kind'],
  text: string | undefined,
  x: number,
  y: number,
  width: number,
  height = 30,
  confidence = 0.9,
): StageBlock {
  return {
    kind,
    ...(text === undefined ? {} : { text }),
    boundingBox: { x, y, width, height },
    confidence,
  };
}

function stage(blocks: StageBlock[]): ParserStageResult {
  return {
    schemaVersion: 2,
    parser: { ...METADATA },
    pages: [{ page: 1, width: 600, height: 800, blocks }],
    warnings: [],
  };
}

function adapter(result: unknown): LayoutAdapter {
  return {
    metadata: { ...METADATA },
    supports: ({ mediaType }) => mediaType === 'application/pdf',
    detectLayout: async () => result as ParserStageResult,
  };
}

describe('createLayoutParser', () => {
  it('orders a dual-column page by spanning heading then left and right columns', async () => {
    const source = input();
    const parser = createLayoutParser(adapter(stage([
      block('paragraph', 'Right second', 330, 150, 220),
      block('paragraph', 'Left second', 50, 150, 220),
      block('heading', 'A bounded scholarly fixture', 40, 20, 520, 35),
      block('paragraph', 'Right first', 330, 90, 220),
      block('paragraph', 'Left first', 50, 90, 220),
    ])));

    const result = await runDocumentParser(source, parser);

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected a succeeded result');
    expect(result.sourceMap.pages[0]?.blocks.map(({ text }) => text)).toEqual([
      'A bounded scholarly fixture',
      'Left first',
      'Left second',
      'Right first',
      'Right second',
    ]);
  });

  it('preserves normalized block kinds, table-cell text and page-bounded geometry', async () => {
    const source = input();
    const normalizedBlocks = [
      block('heading', 'Heading', 10, 10, 580),
      block('paragraph', 'Paragraph', 10, 60, 580),
      block('figure', undefined, 10, 110, 120, 80),
      block('table', 'Metric', 10, 210, 280),
      block('table', '42 fs', 310, 210, 280),
      block('equation', 'I(t) = I0 exp(-t/tau)', 10, 260, 580),
      block('caption', 'Figure 1', 10, 310, 580),
      block('reference', '[1] OpenScience Team. 2026.', 10, 360, 580),
    ];
    const result = await runDocumentParser(source, createLayoutParser(adapter(stage(normalizedBlocks))));

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected a succeeded result');
    const blocks = result.sourceMap.pages[0]?.blocks ?? [];
    expect(blocks.map(({ kind }) => kind)).toEqual([
      'heading', 'paragraph', 'figure', 'table', 'table', 'equation', 'caption', 'reference',
    ]);
    expect(blocks.filter(({ kind }) => kind === 'table').map(({ text }) => text)).toEqual(['Metric', '42 fs']);
    expect(blocks.every(({ boundingBox }) => (
      boundingBox.x >= 0
      && boundingBox.y >= 0
      && boundingBox.x + boundingBox.width <= 600
      && boundingBox.y + boundingBox.height <= 800
    ))).toBe(true);
  });

  it('assigns repeatable IDs after canonical reading order', async () => {
    const source = input();
    const resultFixture = stage([
      block('paragraph', 'Right', 330, 80, 220),
      block('paragraph', 'Left', 50, 80, 220),
    ]);

    const first = await runDocumentParser(source, createLayoutParser(adapter(resultFixture)));
    const second = await runDocumentParser(source, createLayoutParser(adapter(resultFixture)));

    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('succeeded');
    if (first.status !== 'succeeded' || second.status !== 'succeeded') throw new Error('expected succeeded results');
    expect(first.sourceMap.pages[0]?.blocks.map(({ id }) => id)).toEqual([
      `block:${source.contentHash}:1:1`,
      `block:${source.contentHash}:1:2`,
    ]);
    expect(second.sourceMap.pages[0]?.blocks.map(({ id }) => id)).toEqual(
      first.sourceMap.pages[0]?.blocks.map(({ id }) => id),
    );
  });

  it('records provider parser metadata and detect-layout/normalize transformation provenance', async () => {
    const source = input();
    const result = await runDocumentParser(
      source,
      createLayoutParser(adapter({
        ...stage([block('paragraph', 'Provenance', 10, 10, 580)]),
        warnings: [SafeParserWarningCode.LAYOUT_AMBIGUOUS],
      })),
    );

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') throw new Error('expected a succeeded result');
    expect(result.sourceMap.parser).toEqual(METADATA);
    expect(result.sourceMap.pages[0]?.blocks[0]).toMatchObject({
      parser: METADATA,
      transformations: [
        { stage: 'detect_layout', processor: METADATA },
        { stage: 'normalize', processor: { name: 'openscience-layout-normalizer', version: '2.0.0' } },
      ],
    });
    expect(result.warnings).toEqual([SafeParserWarningCode.LAYOUT_AMBIGUOUS]);
  });

  it('rejects an out-of-page bounding box from an alleged V2 stage result', async () => {
    const source = input();
    const invalid = stage([block('paragraph', 'Outside', 590, 10, 20)]);

    await expect(createLayoutParser(adapter(invalid)).parse(source)).rejects.toThrow(
      'boundingBox must be within its page',
    );
  });

  it('rejects non-V2 and metadata-mismatched adapter results', async () => {
    const source = input();
    await expect(createLayoutParser(adapter({ ...stage([]), schemaVersion: 1 })).parse(source)).rejects.toThrow(
      'schema version mismatch',
    );
    await expect(createLayoutParser(adapter({
      ...stage([]),
      parser: { name: 'private-provider', version: '1.0.0' },
    })).parse(source)).rejects.toThrow('layout adapter metadata mismatch');
  });
});

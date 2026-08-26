import { describe, expect, it } from 'vitest';

async function documentSourceMapContract() {
  return await import('../../src') as unknown as {
    DOCUMENT_BLOCK_KINDS: readonly string[];
    DOCUMENT_TRANSFORMATION_STAGES: readonly string[];
    parseDocumentSourceMap(value: unknown): unknown;
    serializeDocumentSourceMap(value: unknown): string;
    deserializeDocumentSourceMap(json: string): unknown;
  };
}

function validMap() {
  return {
    artifactId: 'artifact-1',
    contentHash: 'a'.repeat(64),
    parser: { name: 'deterministic-pdf', version: '1.0.0' },
    pages: [{
      page: 1,
      width: 612.25,
      height: 792.5,
      blocks: [{
        id: 'block-1',
        kind: 'paragraph',
        text: 'Measured pulse width is 42 fs.',
        boundingBox: { x: 72.125, y: 600.25, width: 310.5, height: 18.75 },
        confidence: 0.975,
        parser: { name: 'deterministic-pdf', version: '1.0.0' },
        transformations: [{ stage: 'extract_text', processor: { name: 'deterministic-pdf', version: '1.0.0' } }],
      }, {
        id: 'block-2',
        kind: 'figure',
        boundingBox: { x: 72.125, y: 72.5, width: 310.5, height: 240.25 },
        confidence: 0.99,
        parser: { name: 'deterministic-pdf', version: '1.0.0' },
        transformations: [{ stage: 'detect_layout', processor: { name: 'deterministic-pdf', version: '1.0.0' } }],
      }],
    }],
  };
}

function block(id: string, options: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'figure',
    boundingBox: { x: 0, y: 0, width: 1, height: 1 },
    parser: { name: 'parser', version: '1' },
    transformations: [],
    ...options,
  };
}

describe('DocumentSourceMap boundary', () => {
  it('round-trips a page map without changing decimal coordinates', async () => {
    const map = validMap();
    const { deserializeDocumentSourceMap, serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(deserializeDocumentSourceMap(serializeDocumentSourceMap(map))).toEqual(map);
  });

  it('exports the exact block and transformation vocabularies', async () => {
    const { DOCUMENT_BLOCK_KINDS, DOCUMENT_TRANSFORMATION_STAGES } = await documentSourceMapContract();

    expect(DOCUMENT_BLOCK_KINDS).toEqual(['heading', 'paragraph', 'figure', 'table', 'equation', 'caption', 'reference']);
    expect(DOCUMENT_TRANSFORMATION_STAGES).toEqual(['extract_text', 'detect_layout', 'classify', 'ocr', 'normalize', 'merge']);
  });

  it('parses model provenance through the direct public decoder', async () => {
    const map = validMap();
    map.parser.modelHash = 'model-hash-1';
    map.pages[0].blocks[0].parser.modelHash = 'model-hash-2';
    map.pages[0].blocks[0].transformations[0].processor.modelHash = 'model-hash-3';
    const { parseDocumentSourceMap } = await documentSourceMapContract();

    expect(parseDocumentSourceMap(map)).toEqual(map);
  });

  it('accepts a decimal bounding box aligned with the page edge', async () => {
    const map = { ...validMap(), pages: [{
      page: 1,
      width: 0.3,
      height: 0.3,
      blocks: [block('decimal-edge', { boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } })],
    }] };
    const { serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(() => serializeDocumentSourceMap(map)).not.toThrow();
  });

  it('rejects a bounding box materially beyond a decimal page edge', async () => {
    const map = { ...validMap(), pages: [{
      page: 1,
      width: 0.3,
      height: 0.3,
      blocks: [block('decimal-outside', { boundingBox: { x: 0.1, y: 0.1, width: 0.200001, height: 0.2 } })],
    }] };
    const { serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(() => serializeDocumentSourceMap(map)).toThrow(/within its page/);
  });

  it('does not let a large y-axis scale relax x-axis bounds', async () => {
    const map = { ...validMap(), pages: [{
      page: 1,
      width: 1,
      height: 1e15,
      blocks: [block('asymmetric-outside', { boundingBox: { x: 0, y: 0, width: 4, height: 1 } })],
    }] };
    const { serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(() => serializeDocumentSourceMap(map)).toThrow(/within its page/);
  });

  it.each([
    ['whitespace padding', () => `${JSON.stringify(validMap())}${' '.repeat(16_000_001)}`],
    ['unknown payload', () => `{"privateProviderPayload":"${'x'.repeat(16_000_001)}"}`],
  ])('rejects oversized raw JSON with %s before parsing', async (_label, createJson) => {
    const { deserializeDocumentSourceMap } = await documentSourceMapContract();

    expect(() => deserializeDocumentSourceMap(createJson())).toThrow(/limit_exceeded/);
  });

  it.each([
    ['total blocks', () => ({ ...validMap(), pages: [{ page: 1, width: 2, height: 2, blocks: Array.from({ length: 10_001 }, (_, index) => block(`block-${index}`)) }] })],
    ['total transformations', () => ({ ...validMap(), pages: [{ page: 1, width: 2, height: 2, blocks: Array.from({ length: 251 }, (_, index) => block(`block-${index}`, {
      transformations: Array.from({ length: 100 }, () => ({ stage: 'extract_text', processor: { name: 'parser', version: '1' } })),
    })) }] })],
    ['total text', () => ({ ...validMap(), pages: [{ page: 1, width: 2, height: 2, blocks: Array.from({ length: 101 }, (_, index) => block(`block-${index}`, { text: 'x'.repeat(50_000) })) }] })],
    ['serialized content', () => ({ ...validMap(), pages: [{ page: 1, width: 2, height: 2, blocks: Array.from({ length: 10_000 }, (_, index) => block(`block-${index.toString().padStart(194, 'x')}`, {
      text: 'x'.repeat(500),
      parser: { name: 'n'.repeat(200), version: 'v'.repeat(200) },
    })) }] })],
  ])('rejects source maps exceeding the %s budget', async (_label, createMap) => {
    const { serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(() => serializeDocumentSourceMap(createMap())).toThrow(/limit_exceeded/);
  });

  it.each([
    ['unknown provider field', () => ({ ...validMap(), parser: { ...validMap().parser, privateProviderPayload: {} } })],
    ['unknown source-map field', () => ({ ...validMap(), privateProviderPayload: {} })],
    ['unknown page field', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], privateProviderPage: {} }] })],
    ['unknown block field', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], privateProviderBlock: {} }] }] })],
    ['unknown transformation field', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], transformations: [{ ...validMap().pages[0].blocks[0].transformations[0], privateProviderStage: {} }] }] }] })],
    ['duplicate page number', () => ({ ...validMap(), pages: [...validMap().pages, { ...validMap().pages[0], blocks: [] }] })],
    ['duplicate block ID across pages', () => ({ ...validMap(), pages: [validMap().pages[0], { ...validMap().pages[0], page: 2, blocks: [{ ...validMap().pages[0].blocks[0] }] }] })],
    ['non-finite dimensions', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], width: Number.POSITIVE_INFINITY }] })],
    ['out-of-page bounding box', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], boundingBox: { x: 600, y: 600, width: 20, height: 18.75 } }] }] })],
    ['confidence below zero', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], confidence: -0.001 }] }] })],
    ['confidence above one', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], confidence: 1.001 }] }] })],
    ['invalid content hash', () => ({ ...validMap(), contentHash: 'not-a-hash' })],
    ['missing paragraph text', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], text: undefined }] }] })],
    ['unsupported block kind', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], kind: 'provider_private_block' }] }] })],
    ['unsupported transformation stage', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], transformations: [{ stage: 'provider_private_stage', processor: validMap().parser }] }] }] })],
    ['unknown bounding box field', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], boundingBox: { ...validMap().pages[0].blocks[0].boundingBox, privateProviderCoordinate: 1 } }] }] })],
    ['unknown transformation processor field', () => ({ ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], transformations: [{ stage: 'extract_text', processor: { ...validMap().parser, privateProviderModel: 'internal' } }] }] }] })],
  ])('rejects %s', async (_label, createMalformedMap) => {
    const { serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(() => serializeDocumentSourceMap(createMalformedMap())).toThrow();
  });

  it.each(['heading', 'paragraph', 'caption', 'reference'])('requires text for %s blocks', async (kind) => {
    const map = { ...validMap(), pages: [{ ...validMap().pages[0], blocks: [{ ...validMap().pages[0].blocks[0], kind, text: undefined }] }] };
    const { parseDocumentSourceMap } = await documentSourceMapContract();

    expect(() => parseDocumentSourceMap(map)).toThrow(/text/);
  });
});

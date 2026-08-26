import { describe, expect, it } from 'vitest';

async function documentSourceMapContract() {
  return await import('../../src') as unknown as {
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

describe('DocumentSourceMap boundary', () => {
  it('round-trips a page map without changing decimal coordinates', async () => {
    const map = validMap();
    const { deserializeDocumentSourceMap, serializeDocumentSourceMap } = await documentSourceMapContract();

    expect(deserializeDocumentSourceMap(serializeDocumentSourceMap(map))).toEqual(map);
  });

  it.each([
    ['unknown provider field', () => ({ ...validMap(), parser: { ...validMap().parser, privateProviderPayload: {} } })],
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
});

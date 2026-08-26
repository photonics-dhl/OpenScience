import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DocumentParserMetadata, ExtractionResult, DocumentSourceMap } from '@openscience/domain';
import { ParserContractError, runDocumentParser } from '../src/parsers/base-parser';
import type { DocumentParser, ParserInput } from '../src/parsers/types';

const content = Buffer.from('deterministic parser contract fixture');
const contentHash = createHash('sha256').update(content).digest('hex');
const metadata: DocumentParserMetadata = { name: 'memory-parser', version: '1.0.0' };

function sourceMap(overrides: Partial<DocumentSourceMap> = {}): DocumentSourceMap {
  return {
    artifactId: 'artifact-1',
    contentHash,
    parser: metadata,
    pages: [{
      page: 1,
      width: 612.25,
      height: 792.5,
      blocks: [{
        id: 'paragraph-1', kind: 'paragraph', text: 'Measured pulse width is 42 fs.',
        boundingBox: { x: 72.125, y: 600.25, width: 310.5, height: 18.75 },
        confidence: 0.975, parser: metadata,
        transformations: [{ stage: 'extract_text', processor: metadata }],
      }],
    }],
    ...overrides,
  };
}

function input(overrides: Partial<ParserInput> = {}): ParserInput {
  return { artifactId: 'artifact-1', contentHash, content, mediaType: 'application/pdf', ...overrides };
}

function parser(result: ExtractionResult<DocumentSourceMap>, overrides: Partial<DocumentParser> = {}): DocumentParser {
  return {
    metadata,
    supports: () => true,
    parse: async () => result,
    ...overrides,
  };
}

describe('runDocumentParser', () => {
  it('returns a strict succeeded result with decimal coordinates', async () => {
    const result = await runDocumentParser(input(), parser({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] }));

    expect(result).toEqual({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] });
    if (result.status === 'succeeded') expect(result.sourceMap.pages[0]?.blocks[0]?.boundingBox.x).toBe(72.125);
  });

  it('validates the input hash before supports or parse', async () => {
    let supportsCalled = false;
    let parseCalled = false;
    const candidate = parser({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] }, {
      supports: () => { supportsCalled = true; return true; },
      parse: async () => { parseCalled = true; return { status: 'succeeded', sourceMap: sourceMap(), warnings: [] }; },
    });

    await expect(runDocumentParser(input({ contentHash: '0'.repeat(64) }), candidate)).rejects.toBeInstanceOf(ParserContractError);
    expect(supportsCalled).toBe(false);
    expect(parseCalled).toBe(false);
  });

  it('calls parse only after supports accepts the validated input', async () => {
    let parseCalled = false;
    const candidate = parser({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] }, {
      supports: () => false,
      parse: async () => { parseCalled = true; return { status: 'succeeded', sourceMap: sourceMap(), warnings: [] }; },
    });

    await expect(runDocumentParser(input(), candidate)).rejects.toBeInstanceOf(ParserContractError);
    expect(parseCalled).toBe(false);
  });

  it.each([
    ['source-map artifact mismatch', sourceMap({ artifactId: 'artifact-2' })],
    ['source-map hash mismatch', sourceMap({ contentHash: 'b'.repeat(64) })],
    ['map parser metadata mismatch', sourceMap({ parser: { name: 'other-parser', version: '1.0.0' } })],
    ['unknown nested field', { ...sourceMap(), pages: [{ ...sourceMap().pages[0]!, blocks: [{ ...sourceMap().pages[0]!.blocks[0]!, unexpected: true }] }] }],
    ['malformed confidence', { ...sourceMap(), pages: [{ ...sourceMap().pages[0]!, blocks: [{ ...sourceMap().pages[0]!.blocks[0]!, confidence: 1.01 }] }] }],
    ['malformed bounding box', { ...sourceMap(), pages: [{ ...sourceMap().pages[0]!, blocks: [{ ...sourceMap().pages[0]!.blocks[0]!, boundingBox: { x: 610, y: 1, width: 3, height: 1 } }] }] }],
  ])('rejects %s', async (_name, invalidMap) => {
    await expect(runDocumentParser(input(), parser({ status: 'succeeded', sourceMap: invalidMap as DocumentSourceMap, warnings: [] }))).rejects.toBeInstanceOf(ParserContractError);
  });

  it('rejects succeeded results with no blocks globally', async () => {
    await expect(runDocumentParser(input(), parser({ status: 'succeeded', sourceMap: sourceMap({ pages: [{ page: 1, width: 612.25, height: 792.5, blocks: [] }] }), warnings: [] }))).rejects.toBeInstanceOf(ParserContractError);
  });

  it('allows needs_review results with an empty page', async () => {
    const map = sourceMap({ pages: [{ page: 1, width: 612.25, height: 792.5, blocks: [] }] });
    await expect(runDocumentParser(input(), parser({ status: 'needs_review', sourceMap: map, reasons: ['layout ambiguous'] }))).resolves.toEqual({ status: 'needs_review', sourceMap: map, reasons: ['layout ambiguous'] });
  });
});

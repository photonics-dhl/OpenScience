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

  it.each([
    ['null input', null],
    ['non-Buffer content', { ...input(), content: 'not-a-buffer' }],
    ['non-string artifact id', { ...input(), artifactId: 1 }],
    ['unbounded media type', { ...input(), mediaType: 'x'.repeat(201) }],
    ['invalid content hash type', { ...input(), contentHash: null }],
  ])('turns %s into ParserContractError', async (_name, malformedInput) => {
    await expect(runDocumentParser(malformedInput as ParserInput, parser({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] }))).rejects.toBeInstanceOf(ParserContractError);
  });

  it('rejects oversized and sparse output arrays before JSON serialization', async () => {
    const oversizedWarnings = new Array(101) as string[];
    Object.defineProperty(oversizedWarnings, 'toJSON', { value: () => { throw new Error('JSON serialization reached'); } });
    const sparseWarnings = new Array(2) as string[];
    sparseWarnings[0] = 'warning';
    Object.defineProperty(sparseWarnings, 'toJSON', { value: () => { throw new Error('JSON serialization reached'); } });

    for (const warnings of [oversizedWarnings, sparseWarnings]) {
      await expect(runDocumentParser(input(), parser({ status: 'succeeded', sourceMap: sourceMap(), warnings }))).rejects.toThrow(/preflight/);
    }
  });

  it('rejects unselected result branches before JSON serialization', async () => {
    const hiddenBranch = new Array(1) as string[];
    hiddenBranch[0] = 'unselected';
    Object.defineProperty(hiddenBranch, 'toJSON', { value: () => { throw new Error('JSON serialization reached'); } });
    const result = { status: 'succeeded' as const, sourceMap: sourceMap(), warnings: [], reasons: hiddenBranch };

    await expect(runDocumentParser(input(), parser(result as ExtractionResult<DocumentSourceMap>))).rejects.toThrow(/preflight/);
  });

  it('isolates caller input and snapshots parser metadata across untrusted callbacks', async () => {
    const callerInput = input({ content: Buffer.from(content) });
    const mutableMetadata: DocumentParserMetadata = { name: 'memory-parser', version: '1.0.0' };
    const expectedMap = sourceMap({ parser: { ...mutableMetadata } });
    let parseInput: ParserInput | undefined;
    let parseContentBeforeMutation: Buffer | undefined;
    const candidate: DocumentParser = {
      metadata: mutableMetadata,
      supports: (received) => {
        received.artifactId = 'mutated-artifact';
        received.contentHash = '0'.repeat(64);
        received.mediaType = 'text/plain';
        received.content.fill(0);
        mutableMetadata.name = 'mutated-parser';
        mutableMetadata.version = '9.9.9';
        return true;
      },
      parse: async (received) => {
        parseInput = received;
        parseContentBeforeMutation = Buffer.from(received.content);
        received.content.fill(1);
        mutableMetadata.name = 'mutated-again';
        return { status: 'succeeded', sourceMap: expectedMap, warnings: [] };
      },
    };

    await expect(runDocumentParser(callerInput, candidate)).resolves.toEqual({ status: 'succeeded', sourceMap: expectedMap, warnings: [] });
    expect(parseInput).toMatchObject({ artifactId: 'artifact-1', contentHash, mediaType: 'application/pdf' });
    expect(parseContentBeforeMutation?.equals(content)).toBe(true);
    expect(callerInput).toMatchObject({ artifactId: 'artifact-1', contentHash, mediaType: 'application/pdf' });
    expect(callerInput.content.equals(content)).toBe(true);
  });

  it('rejects changing and throwing input accessors before parser callbacks', async () => {
    let supportsCalled = false;
    const candidate = parser({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] }, { supports: () => { supportsCalled = true; return true; } });
    const changingContent = { ...input() } as Record<string, unknown>;
    Object.defineProperty(changingContent, 'content', { enumerable: true, get: () => Buffer.from(content) });
    const throwingArtifact = { ...input() } as Record<string, unknown>;
    Object.defineProperty(throwingArtifact, 'artifactId', { enumerable: true, get: () => { throw new Error('getter reached'); } });

    for (const malformedInput of [changingContent, throwingArtifact]) {
      await expect(runDocumentParser(malformedInput as ParserInput, candidate)).rejects.toBeInstanceOf(ParserContractError);
    }
    expect(supportsCalled).toBe(false);
  });

  it('rejects accessors and prototype/toJSON tricks before serializing provider output', async () => {
    const changingWarnings = { status: 'succeeded', sourceMap: sourceMap(), warnings: [] as string[] } as Record<string, unknown>;
    Object.defineProperty(changingWarnings, 'warnings', { enumerable: true, get: () => [] });
    const nestedAccessorMap = sourceMap();
    Object.defineProperty(nestedAccessorMap.pages[0]!.blocks[0]!, 'text', { enumerable: true, get: () => 'safe then unsafe' });
    const nestedAccessor = { status: 'succeeded' as const, sourceMap: nestedAccessorMap, warnings: [] };
    const inheritedToJson = Object.create({ toJSON: () => { throw new Error('serialization reached'); } }) as DocumentSourceMap;
    Object.assign(inheritedToJson, sourceMap());
    const prototypeTrick = { status: 'succeeded' as const, sourceMap: inheritedToJson, warnings: [] };
    const throwingStatus = { sourceMap: sourceMap(), warnings: [] } as Record<string, unknown>;
    Object.defineProperty(throwingStatus, 'status', { enumerable: true, get: () => { throw new Error('getter reached'); } });

    for (const result of [changingWarnings, nestedAccessor, prototypeTrick, throwingStatus]) {
      await expect(runDocumentParser(input(), parser(result as ExtractionResult<DocumentSourceMap>))).rejects.toThrow(/preflight/);
    }
  });

  it('rejects oversized whitespace before trim work', async () => {
    await expect(runDocumentParser(input({ mediaType: ' '.repeat(201) }), parser({ status: 'succeeded', sourceMap: sourceMap(), warnings: [] }))).rejects.toThrow(/preflight/);
  });
});

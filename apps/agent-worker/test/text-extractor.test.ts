import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { executeDocumentParser } from '../src/ingestion-parser';
import { createTextExtractor, type TextExtractionAdapters } from '../src/parsers/text-extractor';
import type { ParserStageResult } from '../src/parsers/job-protocol';
import type { ParserInput } from '../src/parsers/types';

const XLSX_FIXTURE = Buffer.from(
  'UEsDBBQAAAAIADJeHF0W9TzBpAAAAA8BAAAPAAAAeGwvd29ya2Jvb2sueG1sjJBBCoMwEEWvEuYARl10IUZo6cZjpGZsgkkmZFLq8UtrBbvr6sPn8T78/kl5uREtYg0+sgJbSuqk5Mli0FxRwrgGP1MOunBF+S45ZdSGLWIJXrZ1fZJBuwibocv/OGie3YRXmh4BY9kkGb0ujiJblxiG/rPA3xRRB1Rw9slqEJ9qNAoaELlzRkEeTQPyF75gObLtgW3frNwX5H7C8AIAAP//AwBQSwMEFAAAAAgAMl4cXV8MAtqDAAAA1AAAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc3TPTQrCMBCG4auEOUCmzcKFNN13K14gtGNSmj9mAub4giBU0NW3el74phtF1/aSJexVVE8xi4XQWr0iyhooOdGlUu4pPgon10QX9ljdejhPaIbhgnxuwDydm2rZLPCyjaDujj01C8/ChwSiJvieUfcUAX8789+Zj8OvE/MLAAD//wMAUEsDBBQAAAAIADJeHF1qyOmAhwAAALMAAAAUAAAAeGwvc2hhcmVkU3RyaW5ncy54bWxcyT0KAjEQQOGrhNSysyhYSDaFNtt6hCEZTSB/ZiayxxcRESzf9wyzqC2nwosOIu0EwC5QRp5qo7LldKs9o/BU+x24dULPgUhygv08HyFjLFq5Ooos+qDVKPEx6PJtazhaI3Yl9NQNiDXwlo9eRxXyO+Uopf93JkH1xDTod4BZ7AsAAP//AwBQSwMEFAAAAAgAMl4cXazfQPOnAAAAAAEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxMj1EKgzAMhq8iPYBRH/YwYmCyG+wEpXZTZltJgvX4Q9mcb+H//nwkmBO/ZfBeizVMUVozqM5XAHGDD1bKNPu4humZOFiVMvELZGZv+30pTNBU1QWCHaMh3LO7VUvIKRfcmtoQum241abQ1oghXKhCWAjBfVl3ZvXBgFM+RM1P1DV7eYzTGP1D2RCOQqgk3qXYF5wyghLClv41cLoNjqfpAwAA//8DAFBLAwQUAAAACAAyXhxdD4FUyn8AAACdAAAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbEyOSwrCMBBArxLmAJ3SgguZzEYvEmI0Yn7MhKbHL3Yh7h4PHjwaVT4aQ+hmz6mohdh7uyKqjyE7nWoLZc/pWSW7rlOVF2qT4B5nlBMu83zB7N4FmE53d90xSR1GLKzA5L9wW8F0CwpMGy+EGxN6JpQ6mPAvxN8RHwAAAP//AwBQSwECFAAUAAAACAAyXhxdFvU8waQAAAAPAQAADwAAAAAAAAAAAAAAAAAAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQAFAAAAAgAMl4cXV8MAtqDAAAA1AAAABoAAAAAAAAAAAAAAAAA0QAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQAFAAAAAgAMl4cXWrI6YCHAAAAswAAABQAAAAAAAAAAAAAAAAAjAEAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQAFAAAAAgAMl4cXazfQPOnAAAAAAEAABgAAAAAAAAAAAAAAAAARQIAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbFBLAQIUABQAAAAIADJeHF0PgVTKfwAAAJ0AAAAYAAAAAAAAAAAAAAAAACIDAAB4bC93b3Jrc2hlZXRzL3NoZWV0Mi54bWxQSwUGAAAAAAUABQBTAQAA1wMAAAAA',
  'base64',
);

function input(content: Buffer | string, mediaType: string, artifactId = 'artifact-text'): ParserInput {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  return {
    artifactId,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    content: bytes,
    mediaType,
  };
}

function expectedId(contentHash: string, page: number, ordinal: number): string {
  return `block:${contentHash}:${page}:${ordinal}`;
}

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const fileName = Buffer.from(name);
    const content = Buffer.from(value);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    localParts.push(local, fileName, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, fileName);
    offset += local.length + fileName.length + content.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function xlsxWithCellReference(reference: string): Buffer {
  return storedZip({
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData><row r="1"><c r="${reference}" t="inlineStr"><is><t>value</t></is></c></row></sheetData></worksheet>`,
  });
}

const virtualGeometry = { name: 'openscience-virtual-page', version: 'openscience-virtual-page-v1' };
const extractorMetadata = { name: 'openscience-text-extractor', version: '1.0.0' };

function stage(overrides: Partial<ParserStageResult> = {}): ParserStageResult {
  return {
    schemaVersion: 2,
    parser: { name: 'current-v2-text', version: '2.0.0' },
    pages: [],
    warnings: [],
    ...overrides,
  };
}

describe('deterministic text DocumentParser', () => {
  it.each([
    ['text/markdown', '# Heading\nBody', ['heading', 'paragraph']],
    ['application/x-tex', '\\section{Heading}\nBody', ['heading', 'paragraph']],
  ])('maps %s source lines onto versioned virtual geometry', async (mediaType, text, kinds) => {
    const parserInput = input(text, mediaType);
    const result = await executeDocumentParser(createTextExtractor({}), parserInput);

    expect(result).toEqual({
      status: 'succeeded',
      warnings: [],
      sourceMap: {
        artifactId: parserInput.artifactId,
        contentHash: parserInput.contentHash,
        parser: extractorMetadata,
        pages: [{
          page: 1,
          width: 1000,
          height: 48,
          blocks: text.split('\n').map((line, index) => ({
            id: expectedId(parserInput.contentHash, 1, index + 1),
            kind: kinds[index],
            text: line,
            boundingBox: { x: 0, y: index * 24, width: 1000, height: 24 },
            parser: extractorMetadata,
            transformations: [
              { stage: 'extract_text', processor: extractorMetadata },
              { stage: 'normalize', processor: virtualGeometry },
            ],
          })),
        }],
      },
    });
  });

  it('keeps quoted CSV commas/newlines in their cells and uses row/cell geometry', async () => {
    const parserInput = input('"alpha, one",beta\r\n"line\nbreak",gamma', 'text/csv');
    const result = await executeDocumentParser(createTextExtractor({}), parserInput);

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.sourceMap.pages[0]).toMatchObject({ page: 1, width: 1000, height: 48 });
    expect(result.sourceMap.pages[0]?.blocks.map((block) => ({ text: block.text, boundingBox: block.boundingBox }))).toEqual([
      { text: 'alpha, one', boundingBox: { x: 0, y: 0, width: 500, height: 24 } },
      { text: 'beta', boundingBox: { x: 500, y: 0, width: 500, height: 24 } },
      { text: 'line\nbreak', boundingBox: { x: 0, y: 24, width: 500, height: 24 } },
      { text: 'gamma', boundingBox: { x: 500, y: 24, width: 500, height: 24 } },
    ]);
  });

  it('extracts bounded XLSX sheets in workbook order with sheet/row/cell coordinates', async () => {
    const parserInput = input(XLSX_FIXTURE, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const result = await executeDocumentParser(createTextExtractor({}), parserInput);

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.sourceMap.pages).toHaveLength(2);
    expect(result.sourceMap.pages.map((page) => page.blocks.map((block) => block.text))).toEqual([
      ['Alpha', 'Header', 'Quoted, cell', 'second row'],
      ['Beta', 'Beta value'],
    ]);
    expect(result.sourceMap.pages[0]).toMatchObject({
      page: 1,
      width: 1000,
      height: 72,
      blocks: [
        { kind: 'heading', boundingBox: { x: 0, y: 0, width: 1000, height: 24 } },
        { boundingBox: { x: 0, y: 24, width: 500, height: 24 } },
        { boundingBox: { x: 500, y: 24, width: 500, height: 24 } },
        { boundingBox: { x: 500, y: 48, width: 500, height: 24 } },
      ],
    });
    expect(result.sourceMap.pages[1]?.blocks[1]?.boundingBox).toEqual({ x: 2000 / 3, y: 72, width: 1000 / 3, height: 24 });
  });

  it('turns current V2 DOCX text into ordered virtual paragraphs', async () => {
    const content = Buffer.from('PK\u0003\u0004docx');
    const adapters: TextExtractionAdapters = {
      docx: async (_request, actualContent) => {
        expect(actualContent).toEqual(content);
        return stage({
          pages: [{
            page: 1,
            width: 1000,
            height: 24,
            blocks: [{
              kind: 'paragraph',
              text: 'First paragraph\n\nSecond paragraph',
              boundingBox: { x: 0, y: 0, width: 1000, height: 24 },
            }],
          }],
          warnings: ['partial_result'],
        });
      },
    };
    const parserInput = input(content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const result = await executeDocumentParser(createTextExtractor(adapters), parserInput);

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.sourceMap.pages[0]?.blocks.map((block) => ({ text: block.text, y: block.boundingBox.y }))).toEqual([
      { text: 'First paragraph', y: 0 },
      { text: 'Second paragraph', y: 24 },
    ]);
    expect(result.sourceMap.pages[0]?.blocks[0]?.transformations).toEqual([
      { stage: 'extract_text', processor: { name: 'current-v2-text', version: '2.0.0' } },
      { stage: 'normalize', processor: virtualGeometry },
    ]);
  });

  it('preserves native PDF page coordinates and stage provenance', async () => {
    const content = Buffer.from('%PDF-1.7 native text');
    const adapters: TextExtractionAdapters = {
      pdf: async () => stage({
        parser: { name: 'current-v2-text', version: '2.1.0' },
        pages: [{
          page: 2,
          width: 612,
          height: 792,
          blocks: [{
            kind: 'paragraph',
            text: 'Native page text',
            boundingBox: { x: 72, y: 640, width: 300, height: 20 },
            confidence: 0.98,
          }],
        }],
      }),
    };
    const parserInput = input(content, 'application/pdf');
    const result = await executeDocumentParser(createTextExtractor(adapters), parserInput);

    expect(result.status).toBe('succeeded');
    if (result.status !== 'succeeded') return;
    expect(result.sourceMap.pages).toEqual([{
      page: 2,
      width: 612,
      height: 792,
      blocks: [{
        id: expectedId(parserInput.contentHash, 2, 1),
        kind: 'paragraph',
        text: 'Native page text',
        boundingBox: { x: 72, y: 640, width: 300, height: 20 },
        confidence: 0.98,
        parser: { name: 'current-v2-text', version: '2.1.0' },
        transformations: [{ stage: 'extract_text', processor: { name: 'current-v2-text', version: '2.1.0' } }],
      }],
    }]);
  });

  it('returns stable block IDs for identical bytes regardless of artifact ID', async () => {
    const first = await executeDocumentParser(createTextExtractor({}), input('same bytes', 'text/markdown', 'artifact-a'));
    const second = await executeDocumentParser(createTextExtractor({}), input('same bytes', 'text/markdown', 'artifact-b'));
    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('succeeded');
    if (first.status !== 'succeeded' || second.status !== 'succeeded') return;
    expect(first.sourceMap.pages[0]?.blocks[0]?.id).toBe(second.sourceMap.pages[0]?.blocks[0]?.id);
  });

  it.each([
    ['malformed UTF-8', input(Buffer.from([0xc3, 0x28]), 'text/markdown'), {}],
    ['malformed ZIP', input(Buffer.from('PK malformed'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), {}],
    ['malformed PDF', input(Buffer.from('%PDF malformed'), 'application/pdf'), { pdf: async () => { throw new Error('private parser detail'); } }],
  ])('sends %s to review without provider or document detail', async (_label, parserInput, adapters) => {
    await expect(executeDocumentParser(createTextExtractor(adapters), parserInput)).resolves.toMatchObject({
      status: 'needs_review',
      reasons: ['parser-failed'],
      sourceMap: { artifactId: parserInput.artifactId, contentHash: parserInput.contentHash, pages: [] },
    });
  });

  it('sends empty or control-only output to review', async () => {
    const parserInput = input('\u0000\n\t', 'text/markdown');
    await expect(executeDocumentParser(createTextExtractor({}), parserInput)).resolves.toMatchObject({
      status: 'needs_review',
      reasons: ['empty-parsed-text'],
    });
  });

  it('blocks a text block that cannot fit the source-map contract', async () => {
    const parserInput = input('a'.repeat(50_001), 'text/markdown');
    await expect(executeDocumentParser(createTextExtractor({}), parserInput)).resolves.toEqual({
      status: 'blocked',
      code: 'limit_exceeded',
      message: 'document parsing safety limit exceeded',
    });
  });

  it('sends invalid characters after a closing CSV quote to review', async () => {
    const parserInput = input('"quoted"trailer,next', 'text/csv');
    await expect(executeDocumentParser(createTextExtractor({}), parserInput)).resolves.toMatchObject({
      status: 'needs_review',
      reasons: ['parser-failed'],
    });
  });

  it('counts empty Markdown rows while scanning and blocks before materializing them', async () => {
    const parserInput = input(Buffer.alloc(48 * 1024 * 1024, 0x0a), 'text/markdown');
    await expect(executeDocumentParser(createTextExtractor({}), parserInput)).resolves.toMatchObject({
      status: 'blocked',
      code: 'limit_exceeded',
    });
  });

  it('counts empty CSV fields during scanning and blocks before building a wide row', async () => {
    const parserInput = input(Buffer.alloc(48 * 1024 * 1024, 0x2c), 'text/csv');
    await expect(executeDocumentParser(createTextExtractor({}), parserInput)).resolves.toMatchObject({
      status: 'blocked',
      code: 'limit_exceeded',
    });
  });

  it('maps DOCX paragraph expansion beyond the source-map block budget to a controlled result', async () => {
    const content = Buffer.from('PK\u0003\u0004docx-many-paragraphs');
    const parserInput = input(content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const parser = createTextExtractor({
      docx: async () => stage({
        pages: [{
          page: 1,
          width: 1000,
          height: 24,
          blocks: [{
            kind: 'paragraph',
            text: 'x\n'.repeat(10_001),
            boundingBox: { x: 0, y: 0, width: 1000, height: 24 },
          }],
        }],
      }),
    });
    await expect(executeDocumentParser(parser, parserInput)).resolves.toMatchObject({
      status: 'blocked',
      code: 'limit_exceeded',
    });
  });

  it('maps PDF source-map serialization growth from repeated provenance to a controlled result', async () => {
    const content = Buffer.from('%PDF source-map budget');
    const parserInput = input(content, 'application/pdf');
    const longParser = { name: 'p'.repeat(200), version: 'v'.repeat(200) };
    const blocks = Array.from({ length: 10_000 }, () => ({
      kind: 'paragraph' as const,
      text: 'x'.repeat(499),
      boundingBox: { x: 0, y: 0, width: 1, height: 1 },
    }));
    const parser = createTextExtractor({
      pdf: async () => stage({
        parser: longParser,
        pages: [{ page: 1, width: 1, height: 1, blocks }],
      }),
    });
    await expect(executeDocumentParser(parser, parserInput)).resolves.toMatchObject({
      status: 'blocked',
      code: 'limit_exceeded',
    });
  });

  it.each(['XFE1', `${'A'.repeat(128)}1`, 'A1048577'])(
    'rejects XLSX cell reference %s before constructing geometry',
    async (reference) => {
      const parserInput = input(xlsxWithCellReference(reference), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await expect(executeDocumentParser(createTextExtractor({}), parserInput)).resolves.toMatchObject({
        status: 'needs_review',
        reasons: ['parser-failed'],
      });
    },
  );
});

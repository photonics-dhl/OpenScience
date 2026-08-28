import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_OCR_LIMITS,
  ocrSelectedPages,
  parseTesseractTsv,
  type LocalOcrAdapter,
  type OcrRasterPage,
} from '../src/parsers/ocr-parser';
import { SafeParserWarningCode, type StagePage } from '../src/parsers/job-protocol';
import type { ParserInput } from '../src/parsers/types';

const TSV_HEADER = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function raster(pageNumber: number, width = 1000, height = 2000): OcrRasterPage {
  const bytes = png(width, height);
  return {
    pageNumber,
    mediaType: 'image/png',
    bytes,
    width,
    height,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };
}

function input(): ParserInput {
  const content = Buffer.from('%PDF-1.7\nselected-page OCR fixture', 'utf8');
  return {
    artifactId: 'artifact-ocr-fixture',
    contentHash: createHash('sha256').update(content).digest('hex'),
    content,
    mediaType: 'application/pdf',
  };
}

function page(pageNumber: number): StagePage {
  return { page: pageNumber, width: 500, height: 1000, blocks: [] };
}

function tsv(...rows: string[]): string {
  return [TSV_HEADER, ...rows].join('\n');
}

function adapter(
  recognize: LocalOcrAdapter['recognizePage'],
  render: LocalOcrAdapter['renderPdfPages'] = async (_input, pageNumbers) => pageNumbers.map((number) => raster(number)),
  timeoutMs = 100,
): LocalOcrAdapter {
  return {
    metadata: { name: 'tesseract', version: '5.3.0-test' },
    timeoutMs,
    renderPdfPages: render,
    recognizePage: recognize,
  };
}

describe('parseTesseractTsv', () => {
  it('normalizes Tesseract top-left pixels into PDF bottom-left coordinates', () => {
    const blocks = parseTesseractTsv(
      tsv('5\t1\t1\t1\t1\t1\t100\t200\t300\t100\t96.5\tPULSE'),
      raster(1),
      page(1),
    );

    expect(blocks).toEqual([{
      kind: 'paragraph',
      text: 'PULSE',
      boundingBox: { x: 50, y: 850, width: 150, height: 50 },
      confidence: 0.965,
    }]);
  });

  it.each([
    ['negative', '5\t1\t1\t1\t1\t1\t-1\t200\t300\t100\t90\tunsafe'],
    ['overflow', '5\t1\t1\t1\t1\t1\t900\t200\t200\t100\t90\tunsafe'],
    ['degenerate', '5\t1\t1\t1\t1\t1\t100\t200\t0\t100\t90\tunsafe'],
    ['non-finite', '5\t1\t1\t1\t1\t1\tNaN\t200\t100\t100\t90\tunsafe'],
  ])('rejects a %s OCR bounding box instead of clipping it', (_label, row) => {
    expect(() => parseTesseractTsv(tsv(row), raster(1), page(1))).toThrow('invalid OCR bounding box');
  });

  it('preserves mixed Chinese and English word boxes and confidences', () => {
    const blocks = parseTesseractTsv(tsv(
      '5\t1\t1\t1\t1\t1\t10\t20\t100\t40\t88\tOpenScience',
      '5\t1\t1\t1\t1\t2\t120\t20\t80\t40\t92\t证据',
    ), raster(1), page(1));

    expect(blocks.map(({ text, confidence }) => ({ text, confidence }))).toEqual([
      { text: 'OpenScience', confidence: 0.88 },
      { text: '证据', confidence: 0.92 },
    ]);
  });
});

describe('ocrSelectedPages', () => {
  it('renders and OCRs only the selected PDF pages', async () => {
    const result = await ocrSelectedPages(input(), [page(2)], adapter(
      async () => tsv('5\t1\t1\t1\t1\t1\t10\t20\t100\t40\t90\tselected'),
      async (_source, pageNumbers) => {
        expect(pageNumbers).toEqual([2]);
        return [raster(2)];
      },
    ));

    expect(result.pages.map(({ page }) => page)).toEqual([2]);
    expect(result.pages[0]?.blocks[0]?.text).toBe('selected');
    expect(result.warnings).toEqual([SafeParserWarningCode.OCR_APPLIED]);
  });

  it('rejects a raster whose magic, encoded dimensions or content hash is inconsistent', async () => {
    const invalidMagic = raster(1);
    invalidMagic.bytes[0] = 0;
    const invalidDimensions = raster(2);
    invalidDimensions.width = 999;
    const invalidHash = raster(3);
    invalidHash.contentHash = '0'.repeat(64);

    const result = await ocrSelectedPages(input(), [page(1), page(2), page(3)], adapter(
      async () => tsv('5\t1\t1\t1\t1\t1\t10\t20\t100\t40\t90\tignored'),
      async () => [invalidMagic, invalidDimensions, invalidHash],
    ));

    expect(result.pages.every(({ blocks }) => blocks.length === 0)).toBe(true);
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it('enforces selected-page and aggregate encoded-byte bounds before OCR', async () => {
    const pages = Array.from({ length: LOCAL_OCR_LIMITS.maxPages + 1 }, (_, index) => page(index + 1));
    await expect(ocrSelectedPages(input(), pages, adapter(async () => ''))).rejects.toThrow('selected page limit exceeded');

    const large = raster(1);
    large.bytes = Buffer.concat([large.bytes, Buffer.alloc(LOCAL_OCR_LIMITS.maxPageBytes)]);
    large.contentHash = createHash('sha256').update(large.bytes).digest('hex');
    const result = await ocrSelectedPages(input(), [page(1)], adapter(async () => '', async () => [large]));
    expect(result.warnings).toEqual([SafeParserWarningCode.PARTIAL_RESULT]);
  });

  it('times out one page without discarding a successful page', async () => {
    const never = new Promise<string>(() => undefined);
    const result = await ocrSelectedPages(input(), [page(1), page(2)], adapter(
      async (image) => image.pageNumber === 1
        ? tsv('5\t1\t1\t1\t1\t1\t10\t20\t100\t40\t90\tkept')
        : never,
      undefined,
      10,
    ));

    expect(result.pages[0]?.blocks.map(({ text }) => text)).toEqual(['kept']);
    expect(result.pages[1]?.blocks).toEqual([]);
    expect(result.warnings).toEqual([
      SafeParserWarningCode.OCR_APPLIED,
      SafeParserWarningCode.PARTIAL_RESULT,
    ]);
  });

  it('marks a malformed page as partial while retaining other page coordinates', async () => {
    const result = await ocrSelectedPages(input(), [page(1), page(2)], adapter(async (image) => (
      image.pageNumber === 1
        ? tsv('5\t1\t1\t1\t1\t1\t10\t20\t100\t40\t90\tkept')
        : tsv('5\t1\t1\t1\t1\t1\t-1\t20\t100\t40\t90\trejected')
    )));

    expect(result.pages[0]?.blocks[0]?.boundingBox).toEqual({ x: 5, y: 970, width: 50, height: 20 });
    expect(result.pages[1]?.blocks).toEqual([]);
    expect(result.warnings).toContain(SafeParserWarningCode.PARTIAL_RESULT);
  });
});

import { createRequire } from 'node:module';

import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  parseParserStageResult,
  type ParserStageResult,
  type StagePage,
} from './job-protocol';
import { PDF_TEXT_ITEM_METADATA } from './native-pdf-contract';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_PARSED_TEXT_CHARS = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 10_000;
const MAX_PDF_BLOCKS = 10_000;

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PdfViewport {
  width: number;
  height: number;
  transform: number[];
}

interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport;
  getTextContent(options: { includeMarkedContent: boolean; disableNormalization: boolean }): Promise<{
    items: Array<PdfTextItem | { type: string }>;
  }>;
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
}

interface PdfParseRuntime {
  load(): Promise<PdfDocument>;
  destroy(): Promise<void>;
}

interface PdfParseModule {
  PDFParse: new (options: { data: Uint8Array }) => PdfParseRuntime;
}

function transformProduct(left: readonly number[], right: readonly number[]): number[] {
  if (left.length < 6 || right.length < 6 || ![...left.slice(0, 6), ...right.slice(0, 6)].every(Number.isFinite)) {
    throw new Error('invalid PDF text transform');
  }
  return [
    left[0]! * right[0]! + left[2]! * right[1]!,
    left[1]! * right[0]! + left[3]! * right[1]!,
    left[0]! * right[2]! + left[2]! * right[3]!,
    left[1]! * right[2]! + left[3]! * right[3]!,
    left[0]! * right[4]! + left[2]! * right[5]! + left[4]!,
    left[1]! * right[4]! + left[3]! * right[5]! + left[5]!,
  ];
}

function textItemBoundingBox(item: PdfTextItem, viewport: PdfViewport) {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
    || viewport.width <= 0 || viewport.height <= 0
    || !Number.isFinite(item.width) || !Number.isFinite(item.height)
    || item.width <= 0 || item.height <= 0) {
    throw new Error('invalid PDF text geometry');
  }
  const transform = transformProduct(viewport.transform, item.transform);
  const inlineMagnitude = Math.hypot(transform[0]!, transform[1]!);
  const blockMagnitude = Math.hypot(transform[2]!, transform[3]!);
  if (!Number.isFinite(inlineMagnitude) || !Number.isFinite(blockMagnitude)
    || inlineMagnitude <= 0 || blockMagnitude <= 0) {
    throw new Error('invalid PDF text geometry');
  }
  const inline = {
    x: transform[0]! / inlineMagnitude * item.width,
    y: transform[1]! / inlineMagnitude * item.width,
  };
  const block = {
    x: transform[2]! / blockMagnitude * item.height,
    y: transform[3]! / blockMagnitude * item.height,
  };
  const corners = [
    [transform[4]!, transform[5]!],
    [transform[4]! + inline.x, transform[5]! + inline.y],
    [transform[4]! + block.x, transform[5]! + block.y],
    [transform[4]! + inline.x + block.x, transform[5]! + inline.y + block.y],
  ];
  const minX = Math.min(...corners.map(([x]) => x!));
  const maxX = Math.max(...corners.map(([x]) => x!));
  const minY = Math.min(...corners.map(([, y]) => y!));
  const maxY = Math.max(...corners.map(([, y]) => y!));
  const tolerance = Number.EPSILON * Math.max(
    viewport.width,
    viewport.height,
    Math.abs(minX),
    Math.abs(maxX),
    Math.abs(minY),
    Math.abs(maxY),
  ) * 64;
  if (minX < -tolerance || minY < -tolerance
    || maxX - viewport.width > tolerance || maxY - viewport.height > tolerance) {
    throw new Error('PDF text geometry outside page');
  }
  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const right = Math.min(viewport.width, maxX);
  const bottom = Math.min(viewport.height, maxY);
  const width = right - x;
  const height = bottom - y;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('invalid PDF text geometry');
  }
  return { x, y, width, height };
}

export async function parseStructuredPdfResult(content: Buffer): Promise<ParserStageResult> {
  const loadRuntimeModule = createRequire(__filename);
  const { PDFParse } = loadRuntimeModule('pdf-parse') as PdfParseModule;
  const parser = new PDFParse({ data: new Uint8Array(content) });
  try {
    const document = await parser.load();
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
      throw new Error('invalid PDF page count');
    }
    let blockCount = 0;
    let textCharacters = 0;
    const pages: StagePage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent({
          includeMarkedContent: false,
          disableNormalization: false,
        });
        const blocks: StagePage['blocks'] = [];
        for (const item of textContent.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          blockCount += 1;
          textCharacters += item.str.length;
          if (blockCount > MAX_PDF_BLOCKS || item.str.length > 50_000
            || textCharacters > MAX_PARSED_TEXT_CHARS) {
            throw new Error('PDF text item limit exceeded');
          }
          blocks.push({
            kind: 'paragraph',
            text: item.str,
            boundingBox: textItemBoundingBox(item, viewport),
          });
        }
        pages.push({ page: pageNumber, width: viewport.width, height: viewport.height, blocks });
      } finally {
        page.cleanup();
      }
    }
    return parseParserStageResult({
      schemaVersion: 2,
      parser: PDF_TEXT_ITEM_METADATA,
      pages,
      warnings: [],
    });
  } finally {
    await parser.destroy();
  }
}

async function runNativePdfStageChild(): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error('PDF parser input too large');
    chunks.push(Buffer.from(chunk));
  }
  const serialized = JSON.stringify(await parseStructuredPdfResult(Buffer.concat(chunks, size)));
  if (Buffer.byteLength(serialized) > PARSER_JOB_RESPONSE_MAX_BYTES) {
    throw new Error('PDF parser output too large');
  }
  process.stdout.write(serialized);
}

if (require.main === module && process.argv[2] === '--pdf-stage-child') {
  void runNativePdfStageChild().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : 'PDF parser failed');
    process.exitCode = 1;
  });
}

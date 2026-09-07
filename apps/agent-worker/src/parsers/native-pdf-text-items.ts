import { createRequire } from 'node:module';

import {
  PARSER_JOB_RESPONSE_MAX_BYTES,
  SafeParserWarningCode,
  parseParserStageResult,
  type ParserStageResult,
  type StagePage,
} from './job-protocol';
import { PDF_TEXT_ITEM_METADATA } from './native-pdf-contract';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_PARSED_TEXT_CHARS = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 10_000;
const MAX_PDF_BLOCKS = 10_000;
const MAX_PDF_OPERATORS = 100_000;
// Pinned pdfjs-dist 5.4.296 operator identifiers.
const PDFJS_OP_SET_FONT = 37;
const PDFJS_OP_MOVE_TEXT = 40;
const PDFJS_OP_SHOW_TEXT = 44;

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
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
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  commonObjs: { get(id: string): unknown };
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

class PdfTextGeometryError extends Error {}

interface CertifiedNotEqualsOverlay {
  overlayFontName: string;
  equalsFontName: string;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function operatorArguments(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function singleGlyph(value: unknown): Record<string, unknown> | undefined {
  const args = operatorArguments(value);
  if (!args || !Array.isArray(args[0]) || args[0].length !== 1) return undefined;
  return objectValue(args[0][0]);
}

function fontArguments(value: unknown): [string, number] | undefined {
  const args = operatorArguments(value);
  return args && typeof args[0] === 'string' && typeof args[1] === 'number' && Number.isFinite(args[1])
    ? [args[0], args[1]]
    : undefined;
}

function zeroMove(value: unknown): boolean {
  const args = operatorArguments(value);
  return args?.length === 2 && args[0] === 0 && args[1] === 0;
}

function embeddedCmsy10Font(page: PdfPage, fontName: string): boolean {
  const font = objectValue(page.commonObjs.get(fontName));
  const matrix = font?.fontMatrix;
  return typeof font?.name === 'string'
    && /^(?:[A-Z]{6}\+)?CMSY10$/u.test(font.name)
    && font.missingFile === false
    && font.vertical === false
    && font.defaultWidth === 0
    && Array.isArray(matrix)
    && matrix.length >= 6
    && [0.001, 0, 0, 0.001, 0, 0].every((value, index) => matrix[index] === value);
}

function loadedHorizontalFont(page: PdfPage, fontName: string): boolean {
  const font = objectValue(page.commonObjs.get(fontName));
  return typeof font?.name === 'string' && font.name.length > 0
    && font.missingFile === false && font.vertical === false;
}

async function certifiedNotEqualsOverlays(
  page: PdfPage,
  remainingOperatorBudget: number,
): Promise<{ overlays: CertifiedNotEqualsOverlay[]; inspected: number }> {
  const operators = await page.getOperatorList();
  if (operators.fnArray.length !== operators.argsArray.length
    || operators.fnArray.length > remainingOperatorBudget) {
    throw new Error('PDF operator limit exceeded');
  }
  const result: CertifiedNotEqualsOverlay[] = [];
  let activeFont: string | undefined;
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operation = operators.fnArray[index];
    if (operation === PDFJS_OP_SET_FONT) {
      activeFont = fontArguments(operators.argsArray[index])?.[0];
      continue;
    }
    if (operation !== PDFJS_OP_SHOW_TEXT || !activeFont) continue;
    const glyph = singleGlyph(operators.argsArray[index]);
    // LaTeX OMS/CMSY10 slot 0x36 is \not and \neq is defined as \not=.
    // Certify the embedded glyph/operator pair before correcting PDF.js's fallback Unicode "6".
    if (glyph?.originalCharCode !== 0x36 || glyph.unicode !== '6' || glyph.fontChar !== '\ue008'
      || glyph.width !== 0 || glyph.isSpace !== false || !embeddedCmsy10Font(page, activeFont)) continue;
    const equalsFont = operators.fnArray[index + 1] === PDFJS_OP_SET_FONT
      ? fontArguments(operators.argsArray[index + 1])
      : undefined;
    const equalsGlyph = operators.fnArray[index + 2] === PDFJS_OP_MOVE_TEXT
      && zeroMove(operators.argsArray[index + 2])
      && operators.fnArray[index + 3] === PDFJS_OP_SHOW_TEXT
      ? singleGlyph(operators.argsArray[index + 3])
      : undefined;
    if (!equalsFont || !loadedHorizontalFont(page, equalsFont[0])
      || equalsGlyph?.originalCharCode !== 0x3d || equalsGlyph.unicode !== '='
      || typeof equalsGlyph.width !== 'number' || !Number.isFinite(equalsGlyph.width) || equalsGlyph.width <= 0
      || equalsGlyph.isSpace !== false) continue;
    result.push({ overlayFontName: activeFont, equalsFontName: equalsFont[0] });
  }
  return { overlays: result, inspected: operators.fnArray.length };
}

function sameFiniteTransform(left: readonly number[], right: readonly number[]): boolean {
  if (left.length < 6 || right.length < 6) return false;
  return left.slice(0, 6).every((value, index) => Number.isFinite(value)
    && Number.isFinite(right[index])
    && Math.abs(value - right[index]!) <= Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(right[index]!)) * 16);
}

function followingNonblankTextItem(items: Array<PdfTextItem | { type: string }>, start: number) {
  for (let index = start + 1; index < items.length; index += 1) {
    const candidate = items[index]!;
    if (!('str' in candidate)) return undefined;
    if (candidate.str.trim()) return { index, item: candidate };
    if (candidate.hasEOL) return undefined;
  }
  return undefined;
}

function transformProduct(left: readonly number[], right: readonly number[]): number[] {
  if (left.length < 6 || right.length < 6 || ![...left.slice(0, 6), ...right.slice(0, 6)].every(Number.isFinite)) {
    throw new PdfTextGeometryError('invalid PDF text transform');
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
    throw new PdfTextGeometryError('invalid PDF text geometry');
  }
  const transform = transformProduct(viewport.transform, item.transform);
  const inlineMagnitude = Math.hypot(transform[0]!, transform[1]!);
  const blockMagnitude = Math.hypot(transform[2]!, transform[3]!);
  if (!Number.isFinite(inlineMagnitude) || !Number.isFinite(blockMagnitude)
    || inlineMagnitude <= 0 || blockMagnitude <= 0) {
    throw new PdfTextGeometryError('invalid PDF text geometry');
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
    throw new PdfTextGeometryError('PDF text geometry outside page');
  }
  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const right = Math.min(viewport.width, maxX);
  const bottom = Math.min(viewport.height, maxY);
  const width = right - x;
  const height = bottom - y;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new PdfTextGeometryError('invalid PDF text geometry');
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
    let inspectedOperators = 0;
    let partialResult = false;
    const pages: StagePage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent({
          includeMarkedContent: false,
          disableNormalization: false,
        });
        let hasPotentialNotEqualsOverlay = false;
        for (const item of textContent.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          blockCount += 1;
          textCharacters += item.str.length;
          if (blockCount > MAX_PDF_BLOCKS || item.str.length > 50_000
            || textCharacters > MAX_PARSED_TEXT_CHARS) {
            throw new Error('PDF text item limit exceeded');
          }
          hasPotentialNotEqualsOverlay ||= item.str === '6' && item.width === 0;
        }
        const certified = hasPotentialNotEqualsOverlay
          ? await certifiedNotEqualsOverlays(page, MAX_PDF_OPERATORS - inspectedOperators)
          : { overlays: [], inspected: 0 };
        inspectedOperators += certified.inspected;
        const certifiedOverlays = certified.overlays;
        let certifiedOverlayIndex = 0;
        let sawCertifiedOverlayCandidate = false;
        const consumedItems = new Set<number>();
        const blocks: StagePage['blocks'] = [];
        let pageHasUnrepresentableTextGeometry = false;
        for (const [itemIndex, item] of textContent.items.entries()) {
          if (!('str' in item) || !item.str.trim()) continue;
          if (consumedItems.has(itemIndex)) continue;
          try {
            blocks.push({
              kind: 'paragraph',
              text: item.str,
              boundingBox: textItemBoundingBox(item, viewport),
            });
          } catch (error) {
            if (!(error instanceof PdfTextGeometryError)) throw error;
            const certified = certifiedOverlays[certifiedOverlayIndex];
            const following = followingNonblankTextItem(textContent.items, itemIndex);
            const composableNotEquals = item.str === '6' && item.width === 0
              && certified?.overlayFontName === item.fontName
              && following?.item.str === '='
              && following.item.fontName === certified.equalsFontName
              && following.item.width > 0
              && item.height === following.item.height
              && sameFiniteTransform(item.transform, following.item.transform);
            if (composableNotEquals && following) {
              sawCertifiedOverlayCandidate = true;
              try {
                blocks.push({
                  kind: 'paragraph',
                  text: '≠',
                  boundingBox: textItemBoundingBox(following.item, viewport),
                });
                consumedItems.add(following.index);
                certifiedOverlayIndex += 1;
                continue;
              } catch (followingError) {
                if (!(followingError instanceof PdfTextGeometryError)) throw followingError;
              }
            }
            pageHasUnrepresentableTextGeometry = true;
          }
        }
        if (sawCertifiedOverlayCandidate && certifiedOverlayIndex !== certifiedOverlays.length) {
          pageHasUnrepresentableTextGeometry = true;
        }
        if (pageHasUnrepresentableTextGeometry) partialResult = true;
        pages.push({
          page: pageNumber,
          width: viewport.width,
          height: viewport.height,
          blocks: pageHasUnrepresentableTextGeometry ? [] : blocks,
        });
      } finally {
        page.cleanup();
      }
    }
    return parseParserStageResult({
      schemaVersion: 2,
      parser: PDF_TEXT_ITEM_METADATA,
      pages,
      warnings: partialResult ? [SafeParserWarningCode.PARTIAL_RESULT] : [],
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

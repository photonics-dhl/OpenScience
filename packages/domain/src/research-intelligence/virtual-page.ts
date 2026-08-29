import type { DocumentBlock, DocumentPage, DocumentParserMetadata } from './document-source-map';

export const VIRTUAL_PAGE_WIDTH = 1000;
export const VIRTUAL_LINE_HEIGHT = 24;
export const VIRTUAL_PAGE_METADATA: DocumentParserMetadata = Object.freeze({
  name: 'openscience-virtual-page',
  version: 'openscience-virtual-page-v1',
});

function closeTo(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-6;
}

export function virtualPageNormalization(block: DocumentBlock): 'absent' | 'current' | 'unknown' {
  const normalization = block.transformations.find(({ stage, processor }) => (
    stage === 'normalize' && processor.name === VIRTUAL_PAGE_METADATA.name
  ));
  if (!normalization) return 'absent';
  return normalization.processor.version === VIRTUAL_PAGE_METADATA.version ? 'current' : 'unknown';
}

export function deriveVirtualTableCoordinates(
  page: DocumentPage,
  block: DocumentBlock,
): { row: number; column: number } | undefined {
  const normalization = virtualPageNormalization(block);
  if (normalization === 'absent') return undefined;
  if (normalization === 'unknown') throw new Error('unknown virtual-page normalization version');
  const { x, y, width, height } = block.boundingBox;
  const rawRow = y / VIRTUAL_LINE_HEIGHT + 1;
  const rawColumnCount = VIRTUAL_PAGE_WIDTH / width;
  const rawColumn = x / width + 1;
  const row = Math.round(rawRow);
  const columnCount = Math.round(rawColumnCount);
  const column = Math.round(rawColumn);
  if (!closeTo(page.width, VIRTUAL_PAGE_WIDTH)
    || !closeTo(height, VIRTUAL_LINE_HEIGHT)
    || !closeTo(rawRow, row) || row < 1
    || !closeTo(rawColumnCount, columnCount) || columnCount < 1
    || !closeTo(rawColumn, column) || column < 1 || column > columnCount
    || !closeTo(x, (column - 1) * width)
    || !closeTo(width, VIRTUAL_PAGE_WIDTH / columnCount)) {
    throw new Error('virtual table geometry does not match the document source map');
  }
  return { row, column };
}

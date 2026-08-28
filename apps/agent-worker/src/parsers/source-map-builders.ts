import type { DocumentBlockKind, DocumentParserMetadata } from '@openscience/domain';
import type { StagePage } from './job-protocol';
import type { SourceMapBlockDraft, SourceMapPageDraft } from './source-map-merge';

export const TEXT_EXTRACTOR_METADATA: DocumentParserMetadata = {
  name: 'openscience-text-extractor',
  version: '1.0.0',
};

export const VIRTUAL_PAGE_METADATA: DocumentParserMetadata = {
  name: 'openscience-virtual-page',
  version: 'openscience-virtual-page-v1',
};

export const VIRTUAL_PAGE_WIDTH = 1000;
export const VIRTUAL_LINE_HEIGHT = 24;

export interface VirtualTextCell {
  line: number;
  column?: number;
  columnCount?: number;
  kind: DocumentBlockKind;
  text: string;
  parser?: DocumentParserMetadata;
}

function metadataCopy(metadata: DocumentParserMetadata): DocumentParserMetadata {
  return {
    name: metadata.name,
    version: metadata.version,
    ...(metadata.modelHash === undefined ? {} : { modelHash: metadata.modelHash }),
  };
}

export function buildVirtualPage(
  page: number,
  cells: readonly VirtualTextCell[],
  lineCount: number,
): SourceMapPageDraft {
  const height = Math.max(VIRTUAL_LINE_HEIGHT, lineCount * VIRTUAL_LINE_HEIGHT);
  return {
    page,
    width: VIRTUAL_PAGE_WIDTH,
    height,
    blocks: cells.map((cell): SourceMapBlockDraft => {
      const columnCount = cell.columnCount ?? 1;
      const column = cell.column ?? 1;
      const width = VIRTUAL_PAGE_WIDTH / columnCount;
      const parser = metadataCopy(cell.parser ?? TEXT_EXTRACTOR_METADATA);
      return {
        kind: cell.kind,
        text: cell.text,
        boundingBox: {
          x: (column - 1) * width,
          y: (cell.line - 1) * VIRTUAL_LINE_HEIGHT,
          width,
          height: VIRTUAL_LINE_HEIGHT,
        },
        parser,
        transformations: [
          { stage: 'extract_text', processor: metadataCopy(parser) },
          { stage: 'normalize', processor: metadataCopy(VIRTUAL_PAGE_METADATA) },
        ],
      };
    }),
  };
}

export function buildPhysicalPages(
  pages: readonly StagePage[],
  parser: DocumentParserMetadata,
): SourceMapPageDraft[] {
  const copiedParser = metadataCopy(parser);
  return pages.map((page) => ({
    page: page.page,
    width: page.width,
    height: page.height,
    blocks: page.blocks.map((block): SourceMapBlockDraft => ({
      kind: block.kind,
      ...(block.text === undefined ? {} : { text: block.text }),
      boundingBox: { ...block.boundingBox },
      ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
      parser: metadataCopy(copiedParser),
      transformations: [{ stage: 'extract_text', processor: metadataCopy(copiedParser) }],
    })),
  }));
}

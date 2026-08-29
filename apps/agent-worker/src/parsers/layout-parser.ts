import type { DocumentParserMetadata, ExtractionResult, DocumentSourceMap } from '@openscience/domain';
import {
  parseParserStageResult,
  type ParserStageResult,
  type StageBlock,
  type StagePage,
} from './job-protocol';
import { mergeSourceMapPages, type SourceMapBlockDraft, type SourceMapPageDraft } from './source-map-merge';
import type { DocumentParser, ParserInput } from './types';

const LAYOUT_NORMALIZER_METADATA: DocumentParserMetadata = {
  name: 'openscience-layout-normalizer',
  version: '2.0.0',
};

/** Provider seam. Concrete candidates remain outside the production graph until retained. */
export interface LayoutAdapter {
  readonly metadata: DocumentParserMetadata;
  supports(input: ParserInput): boolean | Promise<boolean>;
  detectLayout(input: ParserInput): Promise<ParserStageResult>;
}

function metadataCopy(metadata: DocumentParserMetadata): DocumentParserMetadata {
  return {
    name: metadata.name,
    version: metadata.version,
    ...(metadata.modelHash === undefined ? {} : { modelHash: metadata.modelHash }),
  };
}

function metadataEqual(left: DocumentParserMetadata, right: DocumentParserMetadata): boolean {
  return left.name === right.name && left.version === right.version && left.modelHash === right.modelHash;
}

type ReadingOrderBlock = Pick<StageBlock, 'boundingBox' | 'kind' | 'text'>;

function deterministicTie<T extends ReadingOrderBlock>(left: T, right: T): number {
  return left.boundingBox.y - right.boundingBox.y
    || left.boundingBox.x - right.boundingBox.x
    || left.boundingBox.width - right.boundingBox.width
    || left.boundingBox.height - right.boundingBox.height
    || left.kind.localeCompare(right.kind)
    || (left.text ?? '').localeCompare(right.text ?? '');
}

function isSpanning<T extends ReadingOrderBlock>(block: T, pageWidth: number): boolean {
  const { x, width } = block.boundingBox;
  const right = x + width;
  return width >= pageWidth * 0.65 || (x <= pageWidth * 0.35 && right >= pageWidth * 0.65);
}

function orderColumns<T extends ReadingOrderBlock>(blocks: readonly T[], pageWidth: number): T[] {
  const midpoint = pageWidth / 2;
  return [...blocks].sort((left, right) => {
    const leftColumn = left.boundingBox.x + left.boundingBox.width / 2 < midpoint ? 0 : 1;
    const rightColumn = right.boundingBox.x + right.boundingBox.width / 2 < midpoint ? 0 : 1;
    return leftColumn - rightColumn || deterministicTie(left, right);
  });
}

/**
 * Treat wide blocks as reading-order barriers. Within each barrier interval,
 * columns read top-to-bottom from left to right.
 */
export function canonicalLayoutReadingOrder<T extends ReadingOrderBlock>(blocks: readonly T[], pageWidth: number): T[] {
  const spanning = blocks.filter((block) => isSpanning(block, pageWidth)).sort(deterministicTie);
  const columns = blocks.filter((block) => !isSpanning(block, pageWidth));
  const ordered: T[] = [];
  const emitted = new Set<T>();
  for (const barrier of spanning) {
    const beforeBarrier = columns.filter((block) => !emitted.has(block) && block.boundingBox.y < barrier.boundingBox.y);
    for (const block of orderColumns(beforeBarrier, pageWidth)) {
      ordered.push(block);
      emitted.add(block);
    }
    ordered.push(barrier);
  }
  ordered.push(...orderColumns(columns.filter((block) => !emitted.has(block)), pageWidth));
  return ordered;
}

function normalizedPage(page: StagePage, parser: DocumentParserMetadata): SourceMapPageDraft {
  const provider = metadataCopy(parser);
  const normalizer = metadataCopy(LAYOUT_NORMALIZER_METADATA);
  return {
    page: page.page,
    width: page.width,
    height: page.height,
    blocks: canonicalLayoutReadingOrder(page.blocks, page.width).map((block): SourceMapBlockDraft => ({
      kind: block.kind,
      ...(block.text === undefined ? {} : { text: block.text }),
      boundingBox: { ...block.boundingBox },
      ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
      parser: metadataCopy(provider),
      transformations: [
        { stage: 'detect_layout', processor: metadataCopy(provider) },
        { stage: 'normalize', processor: metadataCopy(normalizer) },
      ],
    })),
  };
}

export function createLayoutParser(adapter: LayoutAdapter): DocumentParser {
  const metadata = metadataCopy(adapter.metadata);
  return {
    metadata,
    supports: (input) => adapter.supports(input),
    async parse(input): Promise<ExtractionResult<DocumentSourceMap>> {
      const result = parseParserStageResult(await adapter.detectLayout(input));
      if (!metadataEqual(result.parser, metadata)) throw new Error('layout adapter metadata mismatch');
      const sourceMap = mergeSourceMapPages(
        input,
        metadataCopy(metadata),
        result.pages.map((page) => normalizedPage(page, result.parser)),
      );
      if (sourceMap.pages.every((page) => page.blocks.length === 0)) {
        return { status: 'needs_review', sourceMap, reasons: ['layout parser returned no blocks'] };
      }
      return { status: 'succeeded', sourceMap, warnings: [...result.warnings] };
    },
  };
}

import type {
  DocumentBlock,
  DocumentPage,
  DocumentParserMetadata,
  DocumentSourceMap,
} from '@openscience/domain';
import type { ParserInput } from './types';

export type SourceMapBlockDraft = Omit<DocumentBlock, 'id'>;
export type SourceMapPageDraft = Omit<DocumentPage, 'blocks'> & { blocks: SourceMapBlockDraft[] };

function deterministicBlockId(contentHash: string, page: number, ordinal: number): string {
  return `block:${contentHash.toLowerCase()}:${page}:${ordinal}`;
}

/** Merge provider-neutral page drafts and assign canonical IDs after final ordering. */
export function mergeSourceMapPages(
  input: ParserInput,
  parser: DocumentParserMetadata,
  drafts: readonly SourceMapPageDraft[],
): DocumentSourceMap {
  const byPage = new Map<number, SourceMapPageDraft>();
  for (const draft of drafts) {
    const existing = byPage.get(draft.page);
    if (!existing) {
      byPage.set(draft.page, {
        page: draft.page,
        width: draft.width,
        height: draft.height,
        blocks: [...draft.blocks],
      });
      continue;
    }
    if (existing.width !== draft.width || existing.height !== draft.height) {
      throw new Error('source-map page geometry mismatch');
    }
    existing.blocks.push(...draft.blocks);
  }

  const pages = [...byPage.values()]
    .sort((left, right) => left.page - right.page)
    .map((page): DocumentPage => ({
      page: page.page,
      width: page.width,
      height: page.height,
      blocks: page.blocks.map((block, index) => ({
        id: deterministicBlockId(input.contentHash, page.page, index + 1),
        ...block,
      })),
    }));

  return {
    artifactId: input.artifactId,
    contentHash: input.contentHash.toLowerCase(),
    parser,
    pages,
  };
}

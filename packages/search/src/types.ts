import type { DocumentSourceMap, SourceLocator } from '@openscience/domain';

export const SEARCH_CHUNK_SCHEMA_VERSION = 2;
export const MAX_SEARCH_CHUNKS_PER_DOCUMENT = 100;

export interface ChunkDocumentInput {
  sourceMap: DocumentSourceMap;
  claimIdsByBlockId?: Readonly<Record<string, readonly string[]>>;
}

/** Undefined means the tokenizer rejected this batch because its token limit was exceeded. */
export type SearchChunkTokenCounter = (texts: string[]) => Promise<number[] | undefined>;

export interface SearchChunkDraft {
  id: string;
  artifactId: string;
  contentHash: string;
  ordinal: number;
  language: 'zh' | 'en' | 'und';
  text: string;
  tokenCount: number;
  locators: SourceLocator[];
  claimIds: string[];
  lexicalTerms: string[];
  termFrequencies: Record<string, number>;
}

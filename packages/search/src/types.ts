import type { DocumentSourceMap, SourceLocator } from '@openscience/domain';

export const SEARCH_CHUNK_SCHEMA_VERSION = 1;
export const MAX_SEARCH_CHUNKS_PER_DOCUMENT = 100;

export interface ChunkDocumentInput {
  sourceMap: DocumentSourceMap;
  claimIdsByBlockId?: Readonly<Record<string, readonly string[]>>;
}

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

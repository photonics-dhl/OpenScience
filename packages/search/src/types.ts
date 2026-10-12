import type { DocumentSourceMap, SourceLocator } from '@openscience/domain';

export const SEARCH_CHUNK_SCHEMA_VERSION = 2;
export const MAX_SEARCH_CHUNKS_PER_DOCUMENT = 100;

/** Internal, server-resolved identity. The caller authorizes the source before retrieval. */
export interface SearchGenerationScope {
  readonly researchObjectId: string;
  readonly artifactId: string;
  readonly sourceVersionId: string;
  readonly contentHash: string;
  /** Core search.index task, not the Search DB task or SDF task. */
  readonly fenceOwnerTaskId: string;
}

export function parseSearchGenerationScope(value: unknown): Readonly<SearchGenerationScope> {
  const keys = ['researchObjectId', 'artifactId', 'sourceVersionId', 'contentHash', 'fenceOwnerTaskId'] as const;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('search_generation_invalid');
  }
  const scope = { ...value } as SearchGenerationScope;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (keys.some(key => typeof scope[key] !== 'string'
    || !(key === 'contentHash' ? /^[0-9a-f]{64}$/ : uuid).test(scope[key]))) {
    throw new Error('search_generation_invalid');
  }
  return Object.freeze(scope);
}

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

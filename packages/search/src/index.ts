export {
  createSearchPrismaClient,
  type CreateSearchPrismaClientOptions,
} from './client';
export type { PrismaClient as SearchPrismaClient } from '../generated/client';
export { chunkDocument } from './chunker';
export {
  lexicalSearch,
  scoreBm25,
  type Bm25Input,
  type LexicalCandidateDocument,
  type LexicalCandidatePayload,
  type LexicalCandidateSet,
  type LexicalCandidateStorage,
  type LexicalCandidateStorageResult,
  type LexicalHydrationSet,
  type LexicalScoringDocument,
  type LexicalSearchInput,
  type LexicalSearchResult,
  type RankedCandidate,
  type SearchStorageFailure,
} from './lexical';
export { SearchStorage, type UpsertSearchChunksInput } from './storage';
export { tokenizeSearchText, tokenizeSearchTextWithOffsets, type SearchToken } from './tokenizer';
export { SEARCH_CHUNK_SCHEMA_VERSION, type ChunkDocumentInput, type SearchChunkDraft } from './types';

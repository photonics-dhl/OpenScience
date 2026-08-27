export {
  createSearchPrismaClient,
  type CreateSearchPrismaClientOptions,
} from './client';
export type { PrismaClient as SearchPrismaClient } from '../generated/client';
export { chunkDocument } from './chunker';
export {
  lexicalSearch,
  rankLexicalCandidates,
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
  type RankedLexicalCandidate,
  type LexicalRankResult,
  type SearchStorageFailure,
} from './lexical';
export { SearchStorage, type UpsertSearchChunksInput } from './storage';
export {
  EmbeddingClient,
  type EmbeddingClientOptions,
  type EmbeddingPurpose,
  type EmbeddingResult,
} from './embedder';
export {
  cosineSimilarity,
  denseSearch,
  rankDenseCandidates,
  type DenseCandidate,
  type DenseCandidateSet,
  type DenseCandidateStorage,
  type DenseModelIdentity,
  type DenseSearchResult,
  type DenseStorageFailure,
  type RankedDenseCandidate,
} from './dense';
export { fuseRankedLists, type FusedCandidate } from './fusion';
export {
  createHybridSearchService,
  type HybridCandidate,
  type HybridSearchResponse,
  type HybridSearchStorage,
  type QueryMetricInput,
} from './service';
export { tokenizeSearchText, tokenizeSearchTextWithOffsets, type SearchToken } from './tokenizer';
export { SEARCH_CHUNK_SCHEMA_VERSION, type ChunkDocumentInput, type SearchChunkDraft } from './types';

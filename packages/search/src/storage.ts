import { createHash } from 'node:crypto';

import { validateSourceLocator, type SourceLocator } from '@openscience/domain';

import { Prisma, type PrismaClient } from '../generated/client';
import type {
  LexicalCandidatePayload,
  LexicalCandidateStorageResult,
  LexicalHydrationSet,
  LexicalScoringDocument,
} from './lexical';
import type { DenseCandidateSet, DenseModelIdentity, DenseStorageFailure } from './dense';
import type { QueryMetricInput } from './service';
import { tokenizeSearchText } from './tokenizer';
import { MAX_SEARCH_CHUNKS_PER_DOCUMENT, type SearchChunkDraft } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_QUERY_CHARACTERS = 4_096;
const MAX_QUERY_TOKENS = 512;
const MAX_QUERY_TERM_CHARACTERS = 256;
const MAX_RESULT_LIMIT = 100;
const MAX_LEXICAL_CORPUS_DOCUMENTS = 10_000;
const MAX_BM25_SCORE_CELLS = 1_000_000;
const MAX_HYDRATED_PAYLOAD_BYTES = 8 * 1_024 * 1_024;
const MAX_CHUNKS_PER_UPSERT = MAX_SEARCH_CHUNKS_PER_DOCUMENT;
const MAX_DENSE_CORPUS_DOCUMENTS = 10_000;
const EMBEDDING_DIMENSION = 1_024;
const BGE_M3_REVISION = '5617a9f61b028005a4858fdac845db406aefb181';
const MAX_UPSERT_TEXT_CHARACTERS = 8 * 1_024 * 1_024;
const MAX_UPSERT_LOCATORS = 10_000;
const MAX_UPSERT_CLAIM_CHARACTERS = 1_000_000;
const STATEMENT_TIMEOUT_MILLISECONDS = 2_000;
const INDEX_LEASE_MILLISECONDS = 15 * 60_000;

interface CorpusRow {
  document_count: bigint | number;
  average_length: number | null;
}

interface ScoringRow {
  id: string;
  tenant_id: string;
  token_count: number;
  query_term_frequencies: number[];
}

interface HydrationRow {
  id: string;
  tenant_id: string;
  artifact_id: string;
  content_hash: string;
  text: string;
  locators: unknown;
  claim_ids: unknown;
}

interface CountRow {
  count: bigint | number;
}

interface PayloadSizeRow {
  payload_bytes: bigint | number;
}

interface DenseRow {
  id: string;
  tenant_id: string;
  dimension: number;
  vector: Buffer;
  vector_sha256: string;
  norm: number;
}

interface ModelIdentityRow {
  id: string;
}

export interface UpsertSearchChunksInput {
  tenantId: string;
  researchObjectId: string;
  chunks: readonly SearchChunkDraft[];
}

export interface SearchEmbeddingDraft {
  chunkId: string;
  vector: Buffer;
  vectorSha256: string;
  norm: number;
}

export interface BeginIndexTaskInput {
  taskId: string;
  tenantId: string;
  researchObjectId: string;
  artifactId: string;
  sourceVersionId: string;
  sourceVersionNo: number;
  contentHash: string;
  sourceGenerationSha256: string;
  sourceCreatedAt: Date;
  leaseToken: string;
  executionAttempt: number;
  modelIdentity: DenseModelIdentity;
}

export type BeginIndexTaskResult =
  | { action: 'run'; taskId: string; leaseToken: string }
  | { action: 'skip'; taskId: string; status: 'running' | 'succeeded' | 'failed' }
  | {
    action: 'skip';
    taskId: string;
    status: 'needs_review';
    errorCode: 'embedding_unavailable' | 'no_searchable_content';
  };

export interface StageIndexGenerationInput {
  taskId: string;
  leaseToken: string;
  chunks: readonly SearchChunkDraft[];
}

export interface FinalizeIndexGenerationInput {
  taskId: string;
  leaseToken: string;
  status: 'succeeded' | 'needs_review';
  errorCode?: 'embedding_unavailable' | 'no_searchable_content';
  embeddings: readonly SearchEmbeddingDraft[];
}

export interface IndexTaskLeaseInput {
  taskId: string;
  leaseToken: string;
}

function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a canonical lowercase UUID`);
}

function boundedCount(value: bigint | number | undefined): number {
  const converted = typeof value === 'bigint' ? Number(value) : value ?? 0;
  return Number.isSafeInteger(converted) && converted >= 0 ? converted : 0;
}

function sourceLocators(value: unknown, artifactId: string, contentHash: string): SourceLocator[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1_024) return undefined;
  try {
    const locators = value.map((entry) => validateSourceLocator(entry));
    return locators.every((locator) => locator.artifactId === artifactId && locator.contentHash === contentHash)
      ? locators
      : undefined;
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown, maximumEntries = 10_000): string[] | undefined {
  return Array.isArray(value)
    && value.length <= maximumEntries
    && value.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 200)
    ? value
    : undefined;
}

function termFrequencyRecord(value: unknown): Record<string, number> | undefined {
  const output = Object.create(null) as Record<string, number>;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (Object.keys(value).length > 1_024) return undefined;
  for (const [term, frequency] of Object.entries(value)) {
    if (term.length === 0 || term.length > MAX_QUERY_TERM_CHARACTERS
      || typeof frequency !== 'number' || !Number.isInteger(frequency)
      || frequency < 1 || frequency > 1_024) return undefined;
    output[term] = frequency;
  }
  return output;
}

function validateStorageQuery(input: { tenantId: string; query: string; terms: readonly string[]; limit: number }): void {
  assertUuid(input.tenantId, 'tenantId');
  if (input.query !== input.query.trim() || input.query.length === 0 || input.query.length > MAX_QUERY_CHARACTERS) {
    throw new Error('query is outside storage bounds');
  }
  const canonicalTerms = [...new Set(tokenizeSearchText(input.query))];
  if (canonicalTerms.length === 0 || canonicalTerms.length > MAX_QUERY_TOKENS
    || canonicalTerms.some((term) => term.length > MAX_QUERY_TERM_CHARACTERS)
    || canonicalTerms.length !== input.terms.length
    || canonicalTerms.some((term, index) => term !== input.terms[index])) {
    throw new Error('terms do not match the bounded query');
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULT_LIMIT) {
    throw new Error('limit is outside storage bounds');
  }
}

function validateChunk(chunk: SearchChunkDraft): void {
  if (!HASH_PATTERN.test(chunk.id) || !HASH_PATTERN.test(chunk.contentHash)) throw new Error('chunk hash is invalid');
  assertUuid(chunk.artifactId, 'artifactId');
  if (!Number.isInteger(chunk.ordinal) || chunk.ordinal < 0
    || !Number.isInteger(chunk.tokenCount) || chunk.tokenCount < 1 || chunk.tokenCount > 1_024
    || chunk.text.length < 1 || chunk.text.length > 65_536) throw new Error('chunk bounds are invalid');
  const locators = sourceLocators(chunk.locators, chunk.artifactId, chunk.contentHash);
  const claimIds = stringArray(chunk.claimIds, 1_024);
  const frequencies = termFrequencyRecord(chunk.termFrequencies);
  const textTerms = tokenizeSearchText(chunk.text);
  const expectedFrequencies = Object.create(null) as Record<string, number>;
  for (const term of textTerms) expectedFrequencies[term] = (expectedFrequencies[term] ?? 0) + 1;
  const expectedTerms = Object.keys(expectedFrequencies).sort();
  const canonicalTerms = chunk.lexicalTerms.every((term, index) => typeof term === 'string'
    && term.length > 0 && term.length <= MAX_QUERY_TERM_CHARACTERS
    && term === term.normalize('NFKC').toLocaleLowerCase('und')
    && tokenizeSearchText(term).length === 1
    && (index === 0 || chunk.lexicalTerms[index - 1]! < term));
  if (locators === undefined || claimIds === undefined || frequencies === undefined || !canonicalTerms
    || !['zh', 'en', 'und'].includes(chunk.language)
    || chunk.tokenCount !== textTerms.length
    || chunk.lexicalTerms.length === 0 || chunk.lexicalTerms.length > 1_024
    || chunk.lexicalTerms.length !== expectedTerms.length
    || chunk.lexicalTerms.some((term, index) => term !== expectedTerms[index]
      || frequencies[term] !== expectedFrequencies[term])
    || chunk.lexicalTerms.some((term) => frequencies[term] === undefined)
    || Object.keys(frequencies).length !== chunk.lexicalTerms.length) throw new Error('chunk search metadata is invalid');
}

function validateUpsertBatch(chunks: readonly SearchChunkDraft[]): void {
  if (chunks.length > MAX_CHUNKS_PER_UPSERT) throw new Error('chunk batch limit exceeded');
  if (new Set(chunks.map((chunk) => chunk.id)).size !== chunks.length) throw new Error('chunk batch contains duplicate IDs');
  let textCharacters = 0;
  let locatorCount = 0;
  let claimCharacters = 0;
  for (const chunk of chunks) {
    validateChunk(chunk);
    textCharacters += chunk.text.length;
    locatorCount += chunk.locators.length;
    claimCharacters += chunk.claimIds.reduce((total, claimId) => total + claimId.length, 0);
    if (textCharacters > MAX_UPSERT_TEXT_CHARACTERS
      || locatorCount > MAX_UPSERT_LOCATORS
      || claimCharacters > MAX_UPSERT_CLAIM_CHARACTERS) throw new Error('chunk batch payload limit exceeded');
  }
}

function validateModelIdentity(identity: DenseModelIdentity): void {
  assertUuid(identity.modelVersionId, 'modelVersionId');
  if (identity.modelRevision !== BGE_M3_REVISION
    || !HASH_PATTERN.test(identity.sourceSha256)
    || !HASH_PATTERN.test(identity.packageFreezeSha256)
    || !HASH_PATTERN.test(identity.modelManifestSha256)) throw new Error('model identity is invalid');
}

function validateEmbeddingDrafts(embeddings: readonly SearchEmbeddingDraft[]): void {
  if (embeddings.length > MAX_CHUNKS_PER_UPSERT
    || new Set(embeddings.map(({ chunkId }) => chunkId)).size !== embeddings.length) {
    throw new Error('embedding batch is outside storage bounds');
  }
  for (const embedding of embeddings) {
    let squaredNorm = 0;
    if (Buffer.isBuffer(embedding.vector)
      && embedding.vector.length === EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT) {
      for (let offset = 0; offset < embedding.vector.length; offset += Float32Array.BYTES_PER_ELEMENT) {
        const value = embedding.vector.readFloatLE(offset);
        if (!Number.isFinite(value)) {
          squaredNorm = Number.NaN;
          break;
        }
        squaredNorm += value * value;
      }
    }
    const actualNorm = Math.sqrt(squaredNorm);
    if (!HASH_PATTERN.test(embedding.chunkId)
      || !Buffer.isBuffer(embedding.vector)
      || embedding.vector.length !== EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT
      || !HASH_PATTERN.test(embedding.vectorSha256)
      || createHash('sha256').update(embedding.vector).digest('hex') !== embedding.vectorSha256
      || !Number.isFinite(embedding.norm)
      || !Number.isFinite(actualNorm)
      || Math.abs(actualNorm - 1) > 1e-4
      || Math.abs(actualNorm - embedding.norm) > 1e-4) throw new Error('embedding batch is outside storage bounds');
  }
}

async function upsertChunkRows(transaction: Prisma.TransactionClient, input: UpsertSearchChunksInput): Promise<void> {
  for (const chunk of input.chunks) {
    const data = chunkRowData(input.tenantId, input.researchObjectId, chunk, null, true);
    await transaction.searchChunk.upsert({
      where: { workspaceId_id: { workspaceId: input.tenantId, id: chunk.id } },
      create: { id: chunk.id, ...data },
      update: data,
    });
  }
}

function chunkRowData(
  tenantId: string,
  researchObjectId: string,
  chunk: SearchChunkDraft,
  indexTaskId: string | null,
  active: boolean,
  sourceVersion?: { id: string; versionNo: number },
) {
  return {
    workspaceId: tenantId,
    researchObjectId,
    artifactId: chunk.artifactId,
    sourceVersionId: sourceVersion?.id ?? null,
    sourceVersionNo: sourceVersion?.versionNo ?? null,
    indexTaskId,
    contentHash: chunk.contentHash,
    ordinal: chunk.ordinal,
    language: chunk.language,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    locators: chunk.locators as unknown as Prisma.InputJsonValue,
    claimIds: chunk.claimIds as Prisma.InputJsonValue,
    lexicalTerms: chunk.lexicalTerms as Prisma.InputJsonValue,
    termFrequencies: chunk.termFrequencies as Prisma.InputJsonValue,
    lexicalText: chunk.lexicalTerms.join(' '),
    active,
  };
}

function sourceCreatedAtIsValid(value: Date): boolean {
  const time = value.getTime();
  return Number.isFinite(time) && time >= Date.UTC(2020, 0, 1) && time <= Date.now() + 5 * 60_000;
}

function compareExecutionFence(
  incoming: { taskId: string; createdAt: Date; attempt: number },
  current: { taskId: string; createdAt: Date; attempt: number },
): number {
  const timeDifference = incoming.createdAt.getTime() - current.createdAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  if (incoming.taskId !== current.taskId) return incoming.taskId < current.taskId ? -1 : 1;
  return incoming.attempt - current.attempt;
}

function isNewerGeneration(
  incoming: { sourceVersionNo: number; sourceCreatedAt: Date; id: string },
  current: { sourceVersionNo: number; sourceCreatedAt: Date; id: string },
): boolean {
  const versionDifference = incoming.sourceVersionNo - current.sourceVersionNo;
  if (versionDifference !== 0) return versionDifference > 0;
  const timeDifference = incoming.sourceCreatedAt.getTime() - current.sourceCreatedAt.getTime();
  return timeDifference > 0 || (timeDifference === 0 && incoming.id > current.id);
}

function decodeStoredVector(row: DenseRow): Float32Array | undefined {
  if (
    !HASH_PATTERN.test(row.id)
    || !UUID_PATTERN.test(row.tenant_id)
    || row.dimension !== EMBEDDING_DIMENSION
    || !Buffer.isBuffer(row.vector)
    || row.vector.length !== EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT
    || !HASH_PATTERN.test(row.vector_sha256)
    || createHash('sha256').update(row.vector).digest('hex') !== row.vector_sha256
    || !Number.isFinite(row.norm)
    || Math.abs(row.norm - 1) > 1e-4
  ) return undefined;
  const vector = new Float32Array(EMBEDDING_DIMENSION);
  let squaredNorm = 0;
  for (let offset = 0; offset < row.vector.length; offset += Float32Array.BYTES_PER_ELEMENT) {
    const value = row.vector.readFloatLE(offset);
    if (!Number.isFinite(value)) return undefined;
    vector[offset / Float32Array.BYTES_PER_ELEMENT] = value;
    squaredNorm += value * value;
  }
  return Number.isFinite(squaredNorm) && Math.abs(Math.sqrt(squaredNorm) - 1) <= 1e-4
    ? vector
    : undefined;
}

function validateMetric(metric: QueryMetricInput): void {
  assertUuid(metric.tenantId, 'tenantId');
  if (!HASH_PATTERN.test(metric.queryHash)
    || typeof metric.lexicalAvailable !== 'boolean' || typeof metric.denseAvailable !== 'boolean'
    || !Number.isInteger(metric.resultCount) || metric.resultCount < 0 || metric.resultCount > MAX_RESULT_LIMIT
    || !Number.isInteger(metric.totalLatencyMs) || metric.totalLatencyMs < 0 || metric.totalLatencyMs > 3_600_000
    || [metric.lexicalLatencyMs, metric.denseLatencyMs].some((value) => value !== undefined
      && (!Number.isInteger(value) || value < 0 || value > 3_600_000))
    || (metric.errorCode !== undefined && ![
      'embedding_unavailable', 'dense_capacity_exceeded', 'lexical_unavailable', 'model_identity_unavailable',
      'payload_capacity_exceeded', 'search_unavailable', 'search_storage_unavailable',
    ].includes(metric.errorCode))) throw new Error('query metric is outside storage bounds');
}

export function buildLexicalCandidateQuery(input: {
  tenantId: string;
  query: string;
  terms: readonly string[];
}): Prisma.Sql {
  validateStorageQuery({ ...input, limit: 1 });
  const termArray = Prisma.sql`ARRAY[${Prisma.join(input.terms)}]::text[]`;
  const termQuery = input.terms.join(' | ');
  return Prisma.sql`
    SELECT chunk."id", chunk."workspace_id"::text AS tenant_id, chunk."token_count",
           ARRAY(
             SELECT CASE
               WHEN NOT (chunk."term_frequencies" ? query_term.term) THEN 0
               WHEN jsonb_typeof(chunk."term_frequencies" -> query_term.term) = 'number' THEN
                 CASE
                   WHEN (chunk."term_frequencies" ->> query_term.term) ~ '^[0-9]+$' THEN
                     CASE
                       WHEN (chunk."term_frequencies" ->> query_term.term)::numeric BETWEEN 1 AND 1024
                         THEN (chunk."term_frequencies" ->> query_term.term)::integer
                       ELSE -1
                     END
                   ELSE -1
                 END
               ELSE -1
             END
             FROM unnest(${termArray}) WITH ORDINALITY AS query_term(term, position)
             ORDER BY query_term.position
           ) AS query_term_frequencies
    FROM "search_chunks" AS chunk
    WHERE chunk."workspace_id" = ${input.tenantId}::uuid
      AND chunk."active" = true
      AND (
        chunk."search_vector" @@ websearch_to_tsquery('simple'::regconfig, ${input.query})
        OR chunk."search_vector" @@ to_tsquery('simple'::regconfig, ${termQuery})
      )
    ORDER BY chunk."id" ASC
    LIMIT ${MAX_LEXICAL_CORPUS_DOCUMENTS + 1}
  `;
}

function buildLexicalMatchCountQuery(input: {
  tenantId: string;
  query: string;
  terms: readonly string[];
}): Prisma.Sql {
  validateStorageQuery({ ...input, limit: 1 });
  const termQuery = input.terms.join(' | ');
  return Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "search_chunks" AS chunk
    WHERE chunk."workspace_id" = ${input.tenantId}::uuid
      AND chunk."active" = true
      AND (
        chunk."search_vector" @@ websearch_to_tsquery('simple'::regconfig, ${input.query})
        OR chunk."search_vector" @@ to_tsquery('simple'::regconfig, ${termQuery})
      )
  `;
}

export class SearchStorage {
  constructor(private readonly client: PrismaClient) {}

  async upsertChunks(input: UpsertSearchChunksInput): Promise<void> {
    assertUuid(input.tenantId, 'tenantId');
    assertUuid(input.researchObjectId, 'researchObjectId');
    validateUpsertBatch(input.chunks);
    await this.client.$transaction((transaction) => upsertChunkRows(transaction, input));
  }

  async beginIndexTask(input: BeginIndexTaskInput): Promise<BeginIndexTaskResult> {
    assertUuid(input.taskId, 'taskId');
    assertUuid(input.tenantId, 'tenantId');
    assertUuid(input.researchObjectId, 'researchObjectId');
    assertUuid(input.artifactId, 'artifactId');
    assertUuid(input.sourceVersionId, 'sourceVersionId');
    if (!HASH_PATTERN.test(input.contentHash) || !HASH_PATTERN.test(input.sourceGenerationSha256)
      || !HASH_PATTERN.test(input.leaseToken) || !sourceCreatedAtIsValid(input.sourceCreatedAt)
      || !Number.isInteger(input.sourceVersionNo) || input.sourceVersionNo < 1
      || !Number.isInteger(input.executionAttempt) || input.executionAttempt < 1) {
      throw new Error('index task source identity is invalid');
    }
    validateModelIdentity(input.modelIdentity);
    return this.client.$transaction(async (transaction) => {
      const modelRows = await transaction.$queryRaw<ModelIdentityRow[]>(Prisma.sql`
        SELECT "id"::text AS "id" FROM "search_model_versions"
        WHERE "id" = ${input.modelIdentity.modelVersionId}::uuid
          AND "provider" = 'BAAI' AND "model" = 'bge-m3'
          AND "revision" = ${input.modelIdentity.modelRevision}
          AND "dimension" = ${EMBEDDING_DIMENSION}
          AND "source_sha256" = ${input.modelIdentity.sourceSha256}
          AND "package_freeze_sha256" = ${input.modelIdentity.packageFreezeSha256}
          AND "model_manifest_sha256" = ${input.modelIdentity.modelManifestSha256}
          AND "status" = 'active'
        LIMIT 2
      `);
      if (modelRows.length !== 1 || modelRows[0]?.id !== input.modelIdentity.modelVersionId) {
        throw new Error('active model identity is unavailable');
      }
      const task = await transaction.searchIndexTask.upsert({
        where: { workspaceId_researchObjectId_artifactId_sourceVersionId_contentHash_modelVersionId_sourceGenerationSha256: {
          workspaceId: input.tenantId,
          researchObjectId: input.researchObjectId,
          artifactId: input.artifactId,
          sourceVersionId: input.sourceVersionId,
          contentHash: input.contentHash,
          modelVersionId: input.modelIdentity.modelVersionId,
          sourceGenerationSha256: input.sourceGenerationSha256,
        } },
        create: {
          id: input.taskId,
          workspaceId: input.tenantId,
          researchObjectId: input.researchObjectId,
          artifactId: input.artifactId,
          sourceVersionId: input.sourceVersionId,
          sourceVersionNo: input.sourceVersionNo,
          contentHash: input.contentHash,
          modelVersionId: input.modelIdentity.modelVersionId,
          sourceGenerationSha256: input.sourceGenerationSha256,
          sourceCreatedAt: input.sourceCreatedAt,
          status: 'running',
          attemptCount: 1,
          leaseToken: input.leaseToken,
          fenceOwnerTaskId: input.taskId,
          fenceOwnerCreatedAt: input.sourceCreatedAt,
          fenceOwnerAttempt: input.executionAttempt,
          leaseExpiresAt: new Date(Date.now() + INDEX_LEASE_MILLISECONDS),
          startedAt: new Date(),
        },
        update: {},
      });
      if (task.workspaceId !== input.tenantId || task.researchObjectId !== input.researchObjectId
        || task.artifactId !== input.artifactId || task.contentHash !== input.contentHash
        || task.sourceVersionId !== input.sourceVersionId || task.sourceVersionNo !== input.sourceVersionNo
        || task.modelVersionId !== input.modelIdentity.modelVersionId
        || task.sourceGenerationSha256 !== input.sourceGenerationSha256) throw new Error('index task identity mismatch');
      if (task.status === 'succeeded') return { action: 'skip', taskId: task.id, status: 'succeeded' };
      const initialLease = task.id === input.taskId && task.attemptCount === 1
        && task.leaseToken === input.leaseToken && task.fenceOwnerTaskId === input.taskId
        && task.fenceOwnerCreatedAt?.getTime() === input.sourceCreatedAt.getTime()
        && task.fenceOwnerAttempt === input.executionAttempt;
      const hasFence = task.fenceOwnerTaskId !== null && task.fenceOwnerCreatedAt !== null
        && task.fenceOwnerAttempt !== null;
      const newerFence = !hasFence || compareExecutionFence({
        taskId: input.taskId,
        createdAt: input.sourceCreatedAt,
        attempt: input.executionAttempt,
      }, {
        taskId: task.fenceOwnerTaskId!,
        createdAt: task.fenceOwnerCreatedAt!,
        attempt: task.fenceOwnerAttempt!,
      }) > 0;
      if (!initialLease && !newerFence) {
        if (task.status === 'needs_review') {
          if (task.errorCode !== 'embedding_unavailable' && task.errorCode !== 'no_searchable_content') {
            throw new Error('index task review reason is invalid');
          }
          return { action: 'skip', taskId: task.id, status: 'needs_review', errorCode: task.errorCode };
        }
        if (task.status === 'running' || task.status === 'failed') {
          return { action: 'skip', taskId: task.id, status: task.status };
        }
        throw new Error('index task state is invalid');
      }
      if (task.status === 'running' && !initialLease
        && task.leaseExpiresAt !== null && task.leaseExpiresAt.getTime() > Date.now()) {
        const newerSameOwnerEpoch = task.fenceOwnerTaskId === input.taskId
          && task.fenceOwnerAttempt !== null
          && input.executionAttempt > task.fenceOwnerAttempt;
        if (!newerSameOwnerEpoch) return { action: 'skip', taskId: task.id, status: 'running' };
      }
      if (task.attemptCount >= 3) {
        if (task.status === 'needs_review') {
          if (task.errorCode !== 'embedding_unavailable' && task.errorCode !== 'no_searchable_content') {
            throw new Error('index task review reason is invalid');
          }
          return { action: 'skip', taskId: task.id, status: 'needs_review', errorCode: task.errorCode };
        }
        if (!task.isCurrent) {
          await transaction.searchChunk.deleteMany({ where: { indexTaskId: task.id, active: false } });
        }
        const exhausted = await transaction.searchIndexTask.updateMany({
          where: { id: task.id, status: task.status, attemptCount: task.attemptCount },
          data: {
            status: 'failed',
            errorCode: 'attempts_exhausted',
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          },
        });
        if (exhausted.count !== 1) throw new Error('index task lease contention');
        return { action: 'skip', taskId: task.id, status: 'failed' };
      }
      if (!initialLease) {
        const claimed = await transaction.searchIndexTask.updateMany({
          where: { id: task.id, status: task.status, attemptCount: task.attemptCount },
          data: {
            status: 'running',
            attemptCount: { increment: 1 },
            errorCode: null,
            leaseToken: input.leaseToken,
            fenceOwnerTaskId: input.taskId,
            fenceOwnerCreatedAt: input.sourceCreatedAt,
            fenceOwnerAttempt: input.executionAttempt,
            leaseExpiresAt: new Date(Date.now() + INDEX_LEASE_MILLISECONDS),
            startedAt: new Date(),
            finishedAt: null,
          },
        });
        if (claimed.count !== 1) throw new Error('index task lease contention');
      }
      return { action: 'run', taskId: task.id, leaseToken: input.leaseToken };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: 5_000 });
  }

  async renewIndexTaskLease(input: IndexTaskLeaseInput): Promise<void> {
    assertUuid(input.taskId, 'taskId');
    if (!HASH_PATTERN.test(input.leaseToken)) throw new Error('index task lease is invalid');
    const renewed = await this.client.searchIndexTask.updateMany({
      where: { id: input.taskId, status: 'running', leaseToken: input.leaseToken },
      data: { leaseExpiresAt: new Date(Date.now() + INDEX_LEASE_MILLISECONDS) },
    });
    if (renewed.count !== 1) throw new Error('running index task lease is unavailable');
  }

  async failIndexTask(input: IndexTaskLeaseInput): Promise<void> {
    assertUuid(input.taskId, 'taskId');
    if (!HASH_PATTERN.test(input.leaseToken)) throw new Error('index task lease is invalid');
    await this.client.$transaction(async (transaction) => {
      const task = await transaction.searchIndexTask.findUnique({ where: { id: input.taskId } });
      if (!task || task.status !== 'running' || task.leaseToken !== input.leaseToken) return;
      if (!task.isCurrent) {
        await transaction.searchChunk.deleteMany({ where: { indexTaskId: task.id, active: false } });
      }
      const failed = await transaction.searchIndexTask.updateMany({
        where: { id: task.id, status: 'running', leaseToken: input.leaseToken },
        data: {
          status: 'failed',
          errorCode: 'index_storage_unavailable',
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
        },
      });
      if (failed.count !== 1) throw new Error('index task lease contention');
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: 5_000 });
  }

  async stageIndexGeneration(input: StageIndexGenerationInput): Promise<void> {
    assertUuid(input.taskId, 'taskId');
    if (!HASH_PATTERN.test(input.leaseToken)) throw new Error('index task lease is invalid');
    validateUpsertBatch(input.chunks);
    await this.client.$transaction(async (transaction) => {
      const task = await transaction.searchIndexTask.findUnique({ where: { id: input.taskId } });
      if (!task || task.status !== 'running' || task.leaseToken !== input.leaseToken
        || input.chunks.some((chunk) => chunk.artifactId !== task.artifactId
          || chunk.contentHash !== task.contentHash)) throw new Error('running index task lease is unavailable');
      const existing = await transaction.searchChunk.findMany({
        where: { indexTaskId: task.id }, select: { id: true, active: true }, orderBy: { id: 'asc' },
      });
      const incomingIds = input.chunks.map(({ id }) => id).sort();
      if (task.isCurrent) {
        if (existing.length !== incomingIds.length || existing.some(({ id }, index) => id !== incomingIds[index])) {
          throw new Error('current index generation does not match staged chunks');
        }
        return;
      }
      if (existing.some(({ active }) => active)) throw new Error('inactive staging generation is invalid');
      await transaction.searchChunk.deleteMany({ where: { indexTaskId: task.id, active: false } });
      for (const chunk of input.chunks) {
        await transaction.searchChunk.create({
          data: {
            id: chunk.id,
            ...chunkRowData(task.workspaceId, task.researchObjectId, chunk, task.id, false, {
              id: task.sourceVersionId,
              versionNo: task.sourceVersionNo,
            }),
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: 5_000 });
  }

  async finalizeIndexGeneration(input: FinalizeIndexGenerationInput): Promise<{ activated: boolean }> {
    assertUuid(input.taskId, 'taskId');
    if (!HASH_PATTERN.test(input.leaseToken)
      || (input.status === 'succeeded' && input.errorCode !== undefined)
      || (input.status === 'needs_review' && !['embedding_unavailable', 'no_searchable_content'].includes(input.errorCode ?? ''))
      || (input.status === 'needs_review' && input.embeddings.length !== 0)) {
      throw new Error('index generation result is invalid');
    }
    validateEmbeddingDrafts(input.embeddings);
    return this.client.$transaction(async (transaction) => {
      const task = await transaction.searchIndexTask.findUnique({ where: { id: input.taskId } });
      if (!task) throw new Error('index task is unavailable');
      if (task.status === input.status && task.leaseToken === null) return { activated: task.isCurrent };
      if (task.status !== 'running' || task.leaseToken !== input.leaseToken) {
        throw new Error('running index task lease is unavailable');
      }
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${task.workspaceId}:${task.researchObjectId}:${task.artifactId}`}::text, 0)
        )
      `);
      const staged = await transaction.searchChunk.findMany({
        where: { indexTaskId: task.id }, select: { id: true }, orderBy: { id: 'asc' },
      });
      const embeddingIds = input.embeddings.map(({ chunkId }) => chunkId).sort();
      if ((staged.length === 0 && input.errorCode !== 'no_searchable_content') || (input.status === 'succeeded'
        && (staged.length !== embeddingIds.length || staged.some(({ id }, index) => id !== embeddingIds[index])))) {
        throw new Error('staged index generation is incomplete');
      }
      const current = await transaction.searchIndexTask.findFirst({
        where: {
          workspaceId: task.workspaceId,
          researchObjectId: task.researchObjectId,
          artifactId: task.artifactId,
          isCurrent: true,
        },
      });
      if (current && current.id !== task.id && !isNewerGeneration(task, current)) {
        await transaction.searchIndexTask.update({
          where: { id: task.id },
          data: {
            status: input.status, errorCode: input.errorCode ?? null, leaseToken: null,
            leaseExpiresAt: null,
            isCurrent: false, finishedAt: new Date(),
          },
        });
        return { activated: false };
      }
      if (current && current.id !== task.id) {
        await transaction.searchIndexTask.update({ where: { id: current.id }, data: { isCurrent: false } });
      }
      await transaction.searchChunk.updateMany({
        where: {
          workspaceId: task.workspaceId,
          researchObjectId: task.researchObjectId,
          artifactId: task.artifactId,
          active: true,
          NOT: { indexTaskId: task.id },
        },
        data: { active: false },
      });
      await transaction.searchChunk.updateMany({ where: { indexTaskId: task.id }, data: { active: true } });
      if (input.status === 'needs_review') {
        await transaction.searchEmbedding.deleteMany({
          where: { workspaceId: task.workspaceId, modelVersionId: task.modelVersionId, chunkId: { in: staged.map(({ id }) => id) } },
        });
      }
      for (const embedding of input.embeddings) {
        const data = {
          dimension: EMBEDDING_DIMENSION,
          vector: embedding.vector,
          vectorSha256: embedding.vectorSha256,
          norm: embedding.norm,
        };
        await transaction.searchEmbedding.upsert({
          where: { workspaceId_chunkId_modelVersionId: {
            workspaceId: task.workspaceId,
            chunkId: embedding.chunkId,
            modelVersionId: task.modelVersionId,
          } },
          create: {
            workspaceId: task.workspaceId,
            chunkId: embedding.chunkId,
            modelVersionId: task.modelVersionId,
            ...data,
          },
          update: data,
        });
      }
      await transaction.searchIndexTask.update({
        where: { id: task.id },
        data: {
          status: input.status,
          errorCode: input.errorCode ?? null,
          leaseToken: null,
          leaseExpiresAt: null,
          isCurrent: true,
          finishedAt: new Date(),
        },
      });
      return { activated: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: 5_000 });
  }

  async lexicalCandidates(input: {
    tenantId: string;
    query: string;
    terms: string[];
    limit: number;
  }): Promise<LexicalCandidateStorageResult> {
    validateStorageQuery(input);
    try {
      return await this.client.$transaction(async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          SELECT set_config('statement_timeout', ${String(STATEMENT_TIMEOUT_MILLISECONDS)}, true)
        `);
        const corpusRows = await transaction.$queryRaw<CorpusRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS document_count,
                 COALESCE(AVG("token_count"), 0)::double precision AS average_length
          FROM "search_chunks"
          WHERE "workspace_id" = ${input.tenantId}::uuid AND "active" = true
        `);
        const corpus = corpusRows[0];
        const documentCount = boundedCount(corpus?.document_count);
        if (documentCount > MAX_LEXICAL_CORPUS_DOCUMENTS) {
          return { status: 'unavailable', code: 'lexical_capacity_exceeded' } as const;
        }
        const matchRows = await transaction.$queryRaw<CountRow[]>(buildLexicalMatchCountQuery(input));
        const matchCount = boundedCount(matchRows[0]?.count);
        if (matchCount > MAX_LEXICAL_CORPUS_DOCUMENTS
          || matchCount * input.terms.length > MAX_BM25_SCORE_CELLS) {
          return { status: 'unavailable', code: 'lexical_capacity_exceeded' } as const;
        }
        const candidateRows = await transaction.$queryRaw<ScoringRow[]>(buildLexicalCandidateQuery(input));
        if (candidateRows.length !== matchCount) return { status: 'unavailable', code: 'search_storage_unavailable' } as const;

        const documentFrequencies = Object.create(null) as Record<string, number>;
        for (const term of input.terms) documentFrequencies[term] = 0;
        const candidates: LexicalScoringDocument[] = [];
        let needsReviewCount = 0;
        for (const row of candidateRows) {
          if (row.tenant_id !== input.tenantId || !HASH_PATTERN.test(row.id)
            || !Number.isInteger(row.token_count) || row.token_count < 1 || row.token_count > 1_024
            || !Array.isArray(row.query_term_frequencies)
            || row.query_term_frequencies.length !== input.terms.length
            || row.query_term_frequencies.some((frequency) => !Number.isInteger(frequency)
              || frequency < 0 || frequency > 1_024)) {
            needsReviewCount += 1;
            continue;
          }
          const termFrequencies = Object.create(null) as Record<string, number>;
          for (let index = 0; index < input.terms.length; index += 1) {
            const term = input.terms[index]!;
            const frequency = row.query_term_frequencies[index]!;
            if (frequency > 0) {
              termFrequencies[term] = frequency;
              documentFrequencies[term] = (documentFrequencies[term] ?? 0) + 1;
            }
          }
          candidates.push({
            id: row.id,
            tenantId: row.tenant_id,
            tokenCount: row.token_count,
            termFrequencies,
          });
        }
        return {
          status: 'ok',
          corpus: {
            documentCount,
            averageLength: Number.isFinite(corpus?.average_length) && (corpus?.average_length ?? 0) > 0
              ? corpus!.average_length!
              : 0,
          },
          documentFrequencies,
          candidates,
          needsReviewCount,
        } as const;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch {
      return { status: 'unavailable', code: 'search_storage_unavailable' };
    }
  }

  async hydrateCandidates(input: {
    tenantId: string;
    ids: string[];
  }): Promise<LexicalHydrationSet | { status: 'unavailable'; code: 'search_storage_unavailable' | 'lexical_capacity_exceeded' }> {
    assertUuid(input.tenantId, 'tenantId');
    if (input.ids.length > MAX_RESULT_LIMIT || new Set(input.ids).size !== input.ids.length
      || input.ids.some((id) => !HASH_PATTERN.test(id))) throw new Error('candidate IDs are outside hydration bounds');
    if (input.ids.length === 0) return { status: 'ok', candidates: [], needsReviewCount: 0 };
    const idArray = Prisma.sql`ARRAY[${Prisma.join(input.ids)}]::text[]`;
    try {
      return await this.client.$transaction(async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          SELECT set_config('statement_timeout', ${String(STATEMENT_TIMEOUT_MILLISECONDS)}, true)
        `);
        const sizeRows = await transaction.$queryRaw<PayloadSizeRow[]>(Prisma.sql`
          SELECT COALESCE(SUM(
            octet_length("text") + octet_length("locators"::text) + octet_length("claim_ids"::text) + 128
          ), 0)::bigint AS payload_bytes
          FROM "search_chunks"
          WHERE "workspace_id" = ${input.tenantId}::uuid
            AND "active" = true
            AND "id"::text = ANY(${idArray})
        `);
        if (boundedCount(sizeRows[0]?.payload_bytes) > MAX_HYDRATED_PAYLOAD_BYTES) {
          return { status: 'unavailable', code: 'lexical_capacity_exceeded' } as const;
        }
        const rows = await transaction.$queryRaw<HydrationRow[]>(Prisma.sql`
          SELECT "id", "workspace_id"::text AS tenant_id, "artifact_id"::text AS artifact_id,
                 "content_hash", "text", "locators", "claim_ids"
          FROM "search_chunks"
          WHERE "workspace_id" = ${input.tenantId}::uuid
            AND "active" = true
            AND "id"::text = ANY(${idArray})
          ORDER BY "id" ASC
        `);
        const candidates: LexicalCandidatePayload[] = [];
        let needsReviewCount = input.ids.length - rows.length;
        for (const row of rows) {
          const locators = sourceLocators(row.locators, row.artifact_id, row.content_hash);
          const claimIds = stringArray(row.claim_ids, 1_024);
          if (row.tenant_id !== input.tenantId || !HASH_PATTERN.test(row.id)
            || !HASH_PATTERN.test(row.content_hash) || !UUID_PATTERN.test(row.artifact_id)
            || locators === undefined || claimIds === undefined) {
            needsReviewCount += 1;
            continue;
          }
          candidates.push({
            id: row.id,
            tenantId: row.tenant_id,
            text: row.text,
            locators,
            claimIds,
          });
        }
        return { status: 'ok', candidates, needsReviewCount } as const;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch {
      return { status: 'unavailable', code: 'search_storage_unavailable' };
    }
  }

  async denseCandidates(input: {
    tenantId: string;
    modelIdentity: DenseModelIdentity;
  }): Promise<DenseCandidateSet | DenseStorageFailure> {
    assertUuid(input.tenantId, 'tenantId');
    validateModelIdentity(input.modelIdentity);
    try {
      return await this.client.$transaction(async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          SELECT set_config('statement_timeout', ${String(STATEMENT_TIMEOUT_MILLISECONDS)}, true)
        `);
        const modelRows = await transaction.$queryRaw<ModelIdentityRow[]>(Prisma.sql`
          SELECT "id"::text AS "id"
          FROM "search_model_versions"
          WHERE "id" = ${input.modelIdentity.modelVersionId}::uuid
            AND "provider" = 'BAAI'
            AND "model" = 'bge-m3'
            AND "revision" = ${input.modelIdentity.modelRevision}
            AND "dimension" = ${EMBEDDING_DIMENSION}
            AND "source_sha256" = ${input.modelIdentity.sourceSha256}
            AND "package_freeze_sha256" = ${input.modelIdentity.packageFreezeSha256}
            AND "model_manifest_sha256" = ${input.modelIdentity.modelManifestSha256}
            AND "status" = 'active'
          LIMIT 2
        `);
        if (modelRows.length !== 1 || modelRows[0]?.id !== input.modelIdentity.modelVersionId) {
          return { status: 'unavailable', code: 'model_identity_unavailable' } as const;
        }
        const rows = await transaction.$queryRaw<DenseRow[]>(Prisma.sql`
          SELECT chunk."id", chunk."workspace_id"::text AS tenant_id,
                 embedding."dimension", embedding."vector", embedding."vector_sha256", embedding."norm"
          FROM "search_embeddings" AS embedding
          JOIN "search_chunks" AS chunk
            ON chunk."workspace_id" = embedding."workspace_id" AND chunk."id" = embedding."chunk_id"
          JOIN "search_model_versions" AS model
            ON model."id" = embedding."model_version_id"
          WHERE chunk."workspace_id" = ${input.tenantId}::uuid
            AND chunk."active" = true
            AND model."id" = ${input.modelIdentity.modelVersionId}::uuid
            AND model."provider" = 'BAAI'
            AND model."model" = 'bge-m3'
            AND model."revision" = ${input.modelIdentity.modelRevision}
            AND model."dimension" = ${EMBEDDING_DIMENSION}
            AND model."source_sha256" = ${input.modelIdentity.sourceSha256}
            AND model."package_freeze_sha256" = ${input.modelIdentity.packageFreezeSha256}
            AND model."model_manifest_sha256" = ${input.modelIdentity.modelManifestSha256}
            AND model."status" = 'active'
          ORDER BY chunk."id" ASC
          LIMIT ${MAX_DENSE_CORPUS_DOCUMENTS + 1}
        `);
        if (rows.length > MAX_DENSE_CORPUS_DOCUMENTS) {
          return { status: 'unavailable', code: 'dense_capacity_exceeded' } as const;
        }
        const candidates: DenseCandidateSet['candidates'] = [];
        let needsReviewCount = 0;
        for (const row of rows) {
          const vector = decodeStoredVector(row);
          if (row.tenant_id !== input.tenantId || vector === undefined) {
            needsReviewCount += 1;
            continue;
          }
          candidates.push({ id: row.id, tenantId: row.tenant_id, vector });
        }
        return { status: 'ok', candidates, needsReviewCount } as const;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch {
      return { status: 'unavailable', code: 'search_storage_unavailable' };
    }
  }

  async recordQueryMetric(metric: QueryMetricInput): Promise<void> {
    validateMetric(metric);
    await this.client.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT set_config('statement_timeout', '500', true)
      `);
      await transaction.searchQueryMetric.create({
        data: {
          workspaceId: metric.tenantId,
          queryHash: metric.queryHash,
          lexicalAvailable: metric.lexicalAvailable,
          denseAvailable: metric.denseAvailable,
          resultCount: metric.resultCount,
          lexicalLatencyMs: metric.lexicalLatencyMs,
          denseLatencyMs: metric.denseLatencyMs,
          totalLatencyMs: metric.totalLatencyMs,
          errorCode: metric.errorCode,
        },
      });
    }, { maxWait: 500, timeout: 1_000 });
  }
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseDocumentSourceMap, type AgentDeps, type DocumentSourceMap } from '@openscience/domain';
import {
  chunkDocument,
  SEARCH_CHUNK_SCHEMA_VERSION,
  type DenseModelIdentity,
  type EmbeddingClient,
  type EmbeddingResult,
  type SearchChunkDraft,
} from '@openscience/search';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_EMBEDDING_BATCH = 8;
const EMBEDDING_DIMENSION = 1_024;
const MAX_CLAIMS_PER_BLOCK = 32;
const MAX_CLAIMS_PER_DOCUMENT = 10_000;
const MAX_CLAIM_CHARACTERS = 1_000_000;

export interface SearchIndexJob {
  taskId: string;
  tenantId: string;
  researchObjectId: string;
  artifactId: string;
  sourceVersionId: string;
  sourceVersionNo: number;
  contentHash: string;
  sourceCreatedAt: Date;
  sourceExecutionAttempt: number;
  sourceMap: DocumentSourceMap;
  claimIdsByBlockId?: Readonly<Record<string, readonly string[]>>;
}

interface DenseEmbeddingDraft {
  chunkId: string;
  vector: Buffer;
  vectorSha256: string;
  norm: number;
}

export interface SearchIndexStorage {
  beginIndexTask(input: {
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
  }): Promise<
    | { action: 'run'; taskId: string; leaseToken: string }
    | { action: 'skip'; taskId: string; status: 'running' | 'succeeded' | 'failed' }
    | {
      action: 'skip';
      taskId: string;
      status: 'needs_review';
      errorCode: 'embedding_unavailable' | 'no_searchable_content';
    }
  >;
  stageIndexGeneration(input: {
    taskId: string;
    leaseToken: string;
    chunks: readonly SearchChunkDraft[];
  }): Promise<void>;
  renewIndexTaskLease(input: { taskId: string; leaseToken: string }): Promise<void>;
  failIndexTask(input: { taskId: string; leaseToken: string }): Promise<void>;
  finalizeIndexGeneration(input: {
    taskId: string;
    leaseToken: string;
    status: 'succeeded' | 'needs_review';
    errorCode?: 'embedding_unavailable' | 'no_searchable_content';
    embeddings: readonly DenseEmbeddingDraft[];
  }): Promise<{ activated: boolean }>;
}

type SearchIndexResult =
  | { status: 'succeeded'; chunkCount: number; denseChunkCount: number; activated: boolean }
  | { status: 'needs_review'; chunkCount: number; errorCode: 'embedding_unavailable' | 'no_searchable_content' };

export interface SearchIndexer {
  index(job: SearchIndexJob): Promise<SearchIndexResult>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strictKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error('search index payload contains unknown fields');
  }
}

export interface SearchIndexPayload {
  artifactId: string;
  versionId?: string;
  sourceMap: DocumentSourceMap;
  claimIdsByBlockId?: Readonly<Record<string, readonly string[]>>;
}

function parseClaimIdsByBlockId(
  value: unknown,
  sourceMap: DocumentSourceMap,
): Readonly<Record<string, readonly string[]>> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value) || Object.keys(value).length > MAX_CLAIMS_PER_DOCUMENT) {
    throw new Error('search index claim mapping is invalid');
  }
  const sourceBlockIds = new Set(sourceMap.pages.flatMap(({ blocks }) => blocks.map(({ id }) => id)));
  const normalized: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  let totalClaims = 0;
  let totalCharacters = 0;
  for (const [blockId, rawClaimIds] of Object.entries(value)) {
    if (!sourceBlockIds.has(blockId) || !Array.isArray(rawClaimIds) || rawClaimIds.length > MAX_CLAIMS_PER_BLOCK) {
      throw new Error('search index claim mapping is invalid');
    }
    const claimIds = [...new Set(rawClaimIds)];
    if (claimIds.some((claimId) => typeof claimId !== 'string' || !UUID_PATTERN.test(claimId))) {
      throw new Error('search index claim mapping is invalid');
    }
    totalClaims += claimIds.length;
    totalCharacters += claimIds.reduce((total, claimId) => total + claimId.length, 0);
    if (totalClaims > MAX_CLAIMS_PER_DOCUMENT || totalCharacters > MAX_CLAIM_CHARACTERS) {
      throw new Error('search index claim mapping is invalid');
    }
    normalized[blockId] = claimIds.sort();
  }
  return normalized;
}

export function parseSearchIndexPayload(value: unknown): SearchIndexPayload {
  if (!isPlainRecord(value)) throw new Error('search index payload is invalid');
  strictKeys(value, ['artifactId', 'versionId', 'sourceMap', 'claimIdsByBlockId']);
  const sourceMap = parseDocumentSourceMap(value.sourceMap);
  const claimIdsByBlockId = parseClaimIdsByBlockId(value.claimIdsByBlockId, sourceMap);
  const { artifactId, versionId } = value;
  if (typeof artifactId !== 'string' || !UUID_PATTERN.test(artifactId)
    || (versionId !== undefined && (typeof versionId !== 'string' || !UUID_PATTERN.test(versionId)))) {
    throw new Error('search index payload identity is invalid');
  }
  return {
    artifactId,
    ...(versionId === undefined ? {} : { versionId }),
    sourceMap,
    ...(claimIdsByBlockId === undefined
      ? {}
      : { claimIdsByBlockId }),
  };
}

export async function authorizeSearchIndexJob(
  deps: Pick<AgentDeps, 'prisma'>,
  task: { id: string; executionAttempt: number },
): Promise<SearchIndexJob> {
  const ownerTask = await deps.prisma.agentTask.findUnique({
    where: { id: task.id },
    include: { session: { include: { researchObject: true } } },
  });
  if (!ownerTask || ownerTask.kind !== 'search.index' || ownerTask.status !== 'running'
    || ownerTask.executionAttempt !== task.executionAttempt) {
    throw new Error('[blocked] search index task authority mismatch');
  }
  const payload = parseSearchIndexPayload(ownerTask.payload);
  const researchObject = ownerTask?.session.researchObject;
  const artifact = await deps.prisma.artifact.findUnique({ where: { id: payload.artifactId } });
  if (!researchObject || !artifact
    || artifact.workspaceId !== researchObject.workspaceId
    || payload.sourceMap.artifactId !== artifact.id
    || !sameHash(payload.sourceMap.contentHash, artifact.blobSha256)) {
    throw new Error('[blocked] search index authority mismatch');
  }
  const membership = await deps.prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: researchObject.workspaceId, userId: ownerTask.session.userId } },
  });
  if (!membership) throw new Error('[blocked] workspace membership revoked');

  const claimIds = [...new Set(Object.values(payload.claimIdsByBlockId ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : []))];
  if (claimIds.length > 0 && payload.versionId === undefined) {
    throw new Error('[blocked] claim mappings require a version');
  }
  const version = await deps.prisma.version.findFirst({
    where: {
      ...(payload.versionId === undefined ? {} : { id: payload.versionId }),
      researchObjectId: researchObject.id,
      manifest: { entries: { some: { artifactId: artifact.id, blobSha256: artifact.blobSha256 } } },
    },
    select: { id: true, versionNo: true },
    orderBy: { versionNo: 'desc' },
  });
  if (!version) throw new Error('[blocked] version artifact scope mismatch');
  if (claimIds.length > 0) {
    const claims = await deps.prisma.claimNode.findMany({
      where: { id: { in: claimIds }, researchObjectId: researchObject.id, versionId: version.id },
      select: { id: true },
    });
    if (claims.length !== claimIds.length) throw new Error('[blocked] claim scope mismatch');
  }
  return {
    taskId: ownerTask.id,
    tenantId: researchObject.workspaceId,
    researchObjectId: researchObject.id,
    artifactId: artifact.id,
    sourceVersionId: version.id,
    sourceVersionNo: version.versionNo,
    contentHash: artifact.blobSha256,
    sourceCreatedAt: ownerTask.createdAt,
    sourceExecutionAttempt: ownerTask.executionAttempt,
    sourceMap: payload.sourceMap,
    ...(payload.claimIdsByBlockId === undefined ? {} : { claimIdsByBlockId: payload.claimIdsByBlockId }),
  };
}

function sameHash(left: string, right: string): boolean {
  return HASH_PATTERN.test(left) && HASH_PATTERN.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function matchesIdentity(result: EmbeddingResult, identity: DenseModelIdentity): boolean {
  return result.modelRevision === identity.modelRevision
    && sameHash(result.sourceSha256, identity.sourceSha256)
    && sameHash(result.packageFreezeSha256, identity.packageFreezeSha256)
    && sameHash(result.modelManifestSha256, identity.modelManifestSha256);
}

function encodeVector(chunkId: string, values: readonly number[]): DenseEmbeddingDraft {
  if (!HASH_PATTERN.test(chunkId) || values.length !== EMBEDDING_DIMENSION) {
    throw new Error('embedding_response_invalid');
  }
  const vector = Buffer.alloc(EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT);
  let squaredNorm = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined || !Number.isFinite(value)) throw new Error('embedding_response_invalid');
    vector.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
    squaredNorm += value * value;
  }
  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-4) throw new Error('embedding_response_invalid');
  return {
    chunkId,
    vector,
    vectorSha256: createHash('sha256').update(vector).digest('hex'),
    norm,
  };
}

function validateJob(job: SearchIndexJob): void {
  if (!UUID_PATTERN.test(job.taskId) || !UUID_PATTERN.test(job.tenantId) || !UUID_PATTERN.test(job.researchObjectId)
    || !UUID_PATTERN.test(job.artifactId) || !UUID_PATTERN.test(job.sourceVersionId)
    || !Number.isInteger(job.sourceVersionNo) || job.sourceVersionNo < 1
    || !Number.isInteger(job.sourceExecutionAttempt) || job.sourceExecutionAttempt < 1
    || !HASH_PATTERN.test(job.contentHash)) {
    throw new Error('search index job identity is invalid');
  }
  if (!Number.isFinite(job.sourceCreatedAt.getTime())) throw new Error('search index source time is invalid');
  if (job.sourceMap.artifactId !== job.artifactId) throw new Error('source map artifact does not match job');
  if (job.sourceMap.contentHash !== job.contentHash) throw new Error('source map content hash does not match job');
}

function scopeChunkId(
  chunkId: string,
  job: SearchIndexJob,
  modelVersionId: string,
  generationSha256: string,
): string {
  return createHash('sha256').update(JSON.stringify({
    chunkId,
    tenantId: job.tenantId,
    researchObjectId: job.researchObjectId,
    sourceVersionId: job.sourceVersionId,
    modelVersionId,
    generationSha256,
  })).digest('hex');
}

function sourceGenerationSha256(job: SearchIndexJob): string {
  const claimIdsByBlockId = Object.fromEntries(Object.entries(job.claimIdsByBlockId ?? {})
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([blockId, claimIds]) => [blockId, [...new Set(claimIds)].sort()]));
  return createHash('sha256').update(JSON.stringify({
    chunkSchemaVersion: SEARCH_CHUNK_SCHEMA_VERSION,
    sourceMap: job.sourceMap,
    claimIdsByBlockId,
  })).digest('hex');
}

export function createSearchIndexer(dependencies: {
  storage: SearchIndexStorage;
  embedder: Pick<EmbeddingClient, 'embed'>;
  modelIdentity: DenseModelIdentity;
}): SearchIndexer {
  const modelIdentity = { ...dependencies.modelIdentity };
  return {
    async index(job: SearchIndexJob): Promise<SearchIndexResult> {
      validateJob(job);
      const generationSha256 = sourceGenerationSha256(job);
      const chunks = chunkDocument({ sourceMap: job.sourceMap, claimIdsByBlockId: job.claimIdsByBlockId })
        .map((chunk) => ({
          ...chunk,
          id: scopeChunkId(chunk.id, job, modelIdentity.modelVersionId, generationSha256),
        }));
      const leaseToken = randomBytes(32).toString('hex');
      const begin = await dependencies.storage.beginIndexTask({
        taskId: job.taskId,
        tenantId: job.tenantId,
        researchObjectId: job.researchObjectId,
        artifactId: job.artifactId,
        sourceVersionId: job.sourceVersionId,
        sourceVersionNo: job.sourceVersionNo,
        contentHash: job.contentHash,
        sourceGenerationSha256: generationSha256,
        sourceCreatedAt: job.sourceCreatedAt,
        leaseToken,
        executionAttempt: job.sourceExecutionAttempt,
        modelIdentity,
      });
      if (begin.action === 'skip') {
        if (begin.status === 'running') throw new Error('index_generation_running');
        if (begin.status === 'failed') throw new Error('index_task_attempts_exhausted');
        return begin.status === 'needs_review'
          ? { status: 'needs_review', chunkCount: 0, errorCode: begin.errorCode }
          : { status: 'succeeded', chunkCount: 0, denseChunkCount: 0, activated: false };
      }
      try {
        await dependencies.storage.stageIndexGeneration({
          taskId: begin.taskId, leaseToken: begin.leaseToken, chunks,
        });
      } catch {
        await failIndexTaskBestEffort(dependencies.storage, begin);
        throw new Error('index_storage_unavailable');
      }
      if (chunks.length === 0) {
        await finalizeWithCompensation(dependencies.storage, begin, {
          taskId: begin.taskId,
          leaseToken: begin.leaseToken,
          status: 'needs_review',
          errorCode: 'no_searchable_content',
          embeddings: [],
        });
        return { status: 'needs_review', chunkCount: 0, errorCode: 'no_searchable_content' };
      }

      const embeddings: DenseEmbeddingDraft[] = [];
      for (let offset = 0; offset < chunks.length; offset += MAX_EMBEDDING_BATCH) {
        try {
          await dependencies.storage.renewIndexTaskLease(begin);
        } catch {
          await failIndexTaskBestEffort(dependencies.storage, begin);
          throw new Error('index_storage_unavailable');
        }
        const batch = chunks.slice(offset, offset + MAX_EMBEDDING_BATCH);
        try {
          const result = await dependencies.embedder.embed({ purpose: 'chunk', texts: batch.map(({ text }) => text) });
          if (result.dimension !== EMBEDDING_DIMENSION || result.vectors.length !== batch.length
            || !matchesIdentity(result, modelIdentity)) throw new Error('embedding_response_invalid');
          for (let index = 0; index < batch.length; index += 1) {
            embeddings.push(encodeVector(batch[index]!.id, result.vectors[index] ?? []));
          }
        } catch {
          await finalizeWithCompensation(dependencies.storage, begin, {
            taskId: begin.taskId,
            leaseToken: begin.leaseToken,
            status: 'needs_review',
            errorCode: 'embedding_unavailable',
            embeddings: [],
          });
          return { status: 'needs_review', chunkCount: chunks.length, errorCode: 'embedding_unavailable' };
        }
      }
      const finalization = await finalizeWithCompensation(dependencies.storage, begin, {
        taskId: begin.taskId,
        leaseToken: begin.leaseToken,
        status: 'succeeded',
        embeddings,
      });
      return {
        status: 'succeeded',
        chunkCount: chunks.length,
        denseChunkCount: embeddings.length,
        activated: finalization.activated,
      };
    },
  };
}

async function failIndexTaskBestEffort(
  storage: SearchIndexStorage,
  lease: { taskId: string; leaseToken: string },
): Promise<void> {
  await storage.failIndexTask(lease).catch(() => undefined);
}

async function finalizeWithCompensation(
  storage: SearchIndexStorage,
  lease: { taskId: string; leaseToken: string },
  input: Parameters<SearchIndexStorage['finalizeIndexGeneration']>[0],
): Promise<{ activated: boolean }> {
  try {
    return await finalizeWithRetry(storage, input);
  } catch {
    await failIndexTaskBestEffort(storage, lease);
    throw new Error('index_storage_unavailable');
  }
}

async function finalizeWithRetry(
  storage: SearchIndexStorage,
  input: Parameters<SearchIndexStorage['finalizeIndexGeneration']>[0],
): Promise<{ activated: boolean }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await storage.finalizeIndexGeneration(input);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('index_storage_unavailable');
}

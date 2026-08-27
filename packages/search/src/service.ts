import { createHmac, timingSafeEqual } from 'node:crypto';

import type { EmbeddingClient, EmbeddingResult } from './embedder';
import {
  denseSearch,
  type DenseCandidateStorage,
  type DenseModelIdentity,
  type DenseSearchResult,
} from './dense';
import { fuseRankedLists, type FusedCandidate } from './fusion';
import {
  type LexicalCandidatePayload,
  type LexicalCandidateStorage,
  rankLexicalCandidates,
} from './lexical';
import { tokenizeSearchText } from './tokenizer';

const MAX_RESULT_LIMIT = 100;
const MAX_QUERY_CHARACTERS = 4_096;
const MAX_QUERY_TOKENS = 512;
const METRIC_DEADLINE_MILLISECONDS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

export interface QueryMetricInput {
  tenantId: string;
  queryHash: string;
  lexicalAvailable: boolean;
  denseAvailable: boolean;
  resultCount: number;
  lexicalLatencyMs?: number;
  denseLatencyMs?: number;
  totalLatencyMs: number;
  errorCode?: string;
}

export interface HybridSearchStorage extends LexicalCandidateStorage, DenseCandidateStorage {
  recordQueryMetric(input: QueryMetricInput): Promise<void>;
}

export interface HybridCandidate extends LexicalCandidatePayload {
  score: number;
  rank: number;
  lexicalRank?: number;
  denseRank?: number;
}

export type HybridSearchResponse =
  | {
    status: 'ok';
    mode: 'hybrid' | 'lexical_only' | 'dense_only';
    degradationCode?: 'embedding_unavailable' | 'dense_capacity_exceeded' | 'model_identity_unavailable'
      | 'search_storage_unavailable' | 'lexical_unavailable';
    candidates: HybridCandidate[];
    needsReviewCount: number;
  }
  | { status: 'unavailable'; code: 'payload_capacity_exceeded' | 'search_unavailable' | 'search_storage_unavailable' };

type DenseChannelResult = DenseSearchResult | {
  status: 'unavailable';
  code: 'embedding_unavailable';
};

function embeddingErrorCode(): 'embedding_unavailable' {
  return 'embedding_unavailable';
}

function elapsed(started: number, now: () => number): number {
  return Math.max(0, Math.round(now() - started));
}

function validateHybridInput(input: { tenantId: string; query: string; limit: number }): void {
  if (!UUID_PATTERN.test(input.tenantId)) throw new Error('search_tenant_invalid');
  if (input.query !== input.query.trim() || input.query.length < 1 || input.query.length > MAX_QUERY_CHARACTERS) {
    throw new Error('search_query_invalid');
  }
  const tokens = tokenizeSearchText(input.query);
  if (tokens.length < 1 || tokens.length > MAX_QUERY_TOKENS || tokens.some((token) => token.length > 256)) {
    throw new Error('search_query_invalid');
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULT_LIMIT) {
    throw new Error('search_limit_invalid');
  }
}

function copyModelIdentity(identity: DenseModelIdentity): DenseModelIdentity {
  if (!UUID_PATTERN.test(identity.modelVersionId)
    || !REVISION_PATTERN.test(identity.modelRevision)
    || !HASH_PATTERN.test(identity.sourceSha256)
    || !HASH_PATTERN.test(identity.packageFreezeSha256)
    || !HASH_PATTERN.test(identity.modelManifestSha256)) {
    throw new Error('search_model_identity_invalid');
  }
  return { ...identity };
}

function sameHash(left: string, right: string): boolean {
  return HASH_PATTERN.test(left)
    && HASH_PATTERN.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function embeddingMatchesModel(embedding: EmbeddingResult, identity: DenseModelIdentity): boolean {
  return embedding.modelRevision === identity.modelRevision
    && sameHash(embedding.sourceSha256, identity.sourceSha256)
    && sameHash(embedding.packageFreezeSha256, identity.packageFreezeSha256)
    && sameHash(embedding.modelManifestSha256, identity.modelManifestSha256);
}

export function createHybridSearchService(dependencies: {
  storage: HybridSearchStorage;
  embedder: Pick<EmbeddingClient, 'embed'>;
  modelIdentity: DenseModelIdentity;
  telemetryKey: Uint8Array;
  now?: () => number;
}) {
  if (dependencies.telemetryKey.byteLength < 32) throw new Error('search_telemetry_key_invalid');
  const telemetryKey = Uint8Array.from(dependencies.telemetryKey);
  const modelIdentity = copyModelIdentity(dependencies.modelIdentity);
  const now = dependencies.now ?? (() => performance.now());
  return {
    async search(input: { tenantId: string; query: string; limit: number }): Promise<HybridSearchResponse> {
      validateHybridInput(input);
      const totalStarted = now();
      const lexicalStarted = now();
      const lexicalPromise = rankLexicalCandidates({
        storage: dependencies.storage,
        tenantId: input.tenantId,
        query: input.query,
        limit: input.limit,
      }).then((result) => ({ result, latencyMs: elapsed(lexicalStarted, now) }));
      const denseStarted = now();
      const densePromise: Promise<{ result: DenseChannelResult; latencyMs: number }> = (async () => {
        let embedding: EmbeddingResult;
        try {
          embedding = await dependencies.embedder.embed({ purpose: 'query', texts: [input.query] });
          if (embedding.dimension !== 1_024 || embedding.vectors.length !== 1
            || embedding.vectors[0]?.length !== 1_024
            || !embeddingMatchesModel(embedding, modelIdentity)) {
            throw new Error('embedding_response_invalid');
          }
        } catch {
          return {
            result: { status: 'unavailable', code: embeddingErrorCode() },
            latencyMs: elapsed(denseStarted, now),
          };
        }
        try {
          const queryVector = new Float32Array(embedding.vectors[0] ?? []);
          const result = await denseSearch({
            storage: dependencies.storage,
            tenantId: input.tenantId,
            modelIdentity,
            queryVector,
            limit: input.limit,
          });
          return { result, latencyMs: elapsed(denseStarted, now) };
        } catch {
          return {
            result: { status: 'unavailable', code: 'search_storage_unavailable' },
            latencyMs: elapsed(denseStarted, now),
          };
        }
      })();

      const [lexicalOutcome, denseOutcome] = await Promise.all([lexicalPromise, densePromise]);
      const lexical = lexicalOutcome.result;
      const dense = denseOutcome.result;
      const lexicalAvailable = lexical.status === 'ok';
      const denseAvailable = dense.status === 'ok';
      if (!lexicalAvailable && !denseAvailable) {
        await recordMetric(dependencies.storage, {
          tenantId: input.tenantId,
          queryHash: queryFingerprint(telemetryKey, input.tenantId, input.query),
          lexicalAvailable: false,
          denseAvailable: false,
          resultCount: 0,
          lexicalLatencyMs: lexicalOutcome.latencyMs,
          denseLatencyMs: denseOutcome.latencyMs,
          totalLatencyMs: elapsed(totalStarted, now),
          errorCode: 'search_unavailable',
        });
        return { status: 'unavailable', code: 'search_unavailable' };
      }

      let mode: 'hybrid' | 'lexical_only' | 'dense_only';
      let degradationCode: 'embedding_unavailable' | 'dense_capacity_exceeded'
        | 'model_identity_unavailable' | 'search_storage_unavailable' | 'lexical_unavailable' | undefined;
      if (lexicalAvailable && denseAvailable) mode = 'hybrid';
      else if (lexicalAvailable) {
        mode = 'lexical_only';
        if (dense.status !== 'unavailable') throw new Error('search_state_invalid');
        degradationCode = dense.code;
      } else {
        mode = 'dense_only';
        degradationCode = 'lexical_unavailable';
      }

      const fused = fuseRankedLists({
        lexical: lexicalAvailable ? lexical.candidates.map((candidate) => candidate.id) : [],
        dense: denseAvailable ? dense.candidates.map((candidate) => candidate.id) : [],
        limit: input.limit,
        k: 60,
      });
      const hydrated = await dependencies.storage.hydrateCandidates({
        tenantId: input.tenantId,
        ids: fused.map((candidate) => candidate.id),
      });
      if (hydrated.status === 'unavailable') {
        const hydrationCode = hydrated.code === 'lexical_capacity_exceeded'
          ? 'payload_capacity_exceeded'
          : 'search_storage_unavailable';
        await recordMetric(dependencies.storage, {
          tenantId: input.tenantId,
          queryHash: queryFingerprint(telemetryKey, input.tenantId, input.query),
          lexicalAvailable,
          denseAvailable,
          resultCount: 0,
          lexicalLatencyMs: lexicalOutcome.latencyMs,
          denseLatencyMs: denseOutcome.latencyMs,
          totalLatencyMs: elapsed(totalStarted, now),
          errorCode: hydrationCode,
        });
        return { status: 'unavailable', code: hydrationCode };
      }
      const ranks = new Map<string, FusedCandidate>(fused.map((candidate) => [candidate.id, candidate]));
      const payloads = new Map(hydrated.candidates.map((candidate) => [candidate.id, candidate]));
      const candidates: HybridCandidate[] = [];
      for (const candidate of fused) {
        const payload = payloads.get(candidate.id);
        const rank = ranks.get(candidate.id);
        if (payload !== undefined && rank !== undefined) {
          candidates.push({ ...payload, ...rank, rank: candidates.length + 1 });
        }
      }
      const needsReviewCount = (lexicalAvailable ? lexical.needsReviewCount : 0)
        + (denseAvailable ? dense.needsReviewCount : 0)
        + hydrated.needsReviewCount;
      await recordMetric(dependencies.storage, {
        tenantId: input.tenantId,
        queryHash: queryFingerprint(telemetryKey, input.tenantId, input.query),
        lexicalAvailable,
        denseAvailable,
        resultCount: candidates.length,
        lexicalLatencyMs: lexicalOutcome.latencyMs,
        denseLatencyMs: denseOutcome.latencyMs,
        totalLatencyMs: elapsed(totalStarted, now),
        ...(degradationCode === undefined ? {} : { errorCode: degradationCode }),
      });
      return {
        status: 'ok',
        mode,
        ...(degradationCode === undefined ? {} : { degradationCode }),
        candidates,
        needsReviewCount,
      };
    },
  };
}

function queryFingerprint(key: Uint8Array, tenantId: string, query: string): string {
  return createHmac('sha256', key)
    .update('openscience-search-query-v1\0', 'utf8')
    .update(tenantId, 'utf8')
    .update('\0', 'utf8')
    .update(query, 'utf8')
    .digest('hex');
}

async function recordMetric(storage: HybridSearchStorage, metric: QueryMetricInput): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      storage.recordQueryMetric(metric),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, METRIC_DEADLINE_MILLISECONDS);
      }),
    ]);
  } catch {
    // Retrieval remains available when bounded, content-free telemetry fails.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

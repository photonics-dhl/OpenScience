import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  createHybridSearchService,
  EmbeddingClient,
  loadSearchIndexRuntimeConfig,
  SearchStorage,
  type SearchPrismaClient,
} from '@openscience/search';

export function buildHybridSearchFromEnv(core: PrismaClient, search: SearchPrismaClient | undefined) {
  const config = loadSearchIndexRuntimeConfig();
  if (!config.enabled) return undefined;
  if (!search) throw new Error('SEARCH_DATABASE_URL is required when BGE_M3_ENABLED=true');
  return createHybridSearchService({
    storage: new SearchStorage(search, core),
    embedder: new EmbeddingClient({ baseUrl: config.endpoint, requestTimeoutMs: 3_000, maxAttempts: 1 }),
    modelIdentity: config.modelIdentity,
    // Query telemetry already uses keyed fingerprints. Keep the ephemeral key in memory;
    // a process restart deliberately starts a new, unlinkable telemetry window.
    telemetryKey: randomBytes(32),
  });
}

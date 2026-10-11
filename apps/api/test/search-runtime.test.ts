import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingClient } from '../../../packages/search/src/embedder';
import { createHybridSearchService } from '../../../packages/search/src/service';
import { loadSearchIndexRuntimeConfig } from '../../../packages/search/src/runtime-config';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const CHUNK = 'a'.repeat(64);
const MODEL = {
  modelVersionId: '22222222-2222-4222-8222-222222222222',
  modelRevision: '5617a9f61b028005a4858fdac845db406aefb181',
  sourceSha256: '1'.repeat(64), packageFreezeSha256: '2'.repeat(64), modelManifestSha256: '3'.repeat(64),
};
const ENV = {
  NODE_ENV: 'production', BGE_M3_ENABLED: 'true', BGE_M3_MODEL_VERSION_ID: MODEL.modelVersionId,
  BGE_M3_MODEL_REVISION: MODEL.modelRevision, BGE_M3_SOURCE_SHA256: MODEL.sourceSha256,
  BGE_M3_PACKAGE_FREEZE_SHA256: MODEL.packageFreezeSha256,
  BGE_M3_MODEL_MANIFEST_SHA256: MODEL.modelManifestSha256,
};

function response(overrides: Record<string, unknown> = {}): Response {
  const vector = Buffer.alloc(1024 * 4);
  vector.writeFloatLE(1, 0);
  return new Response(JSON.stringify({ schemaVersion: 1, modelRevision: MODEL.modelRevision,
    sourceSha256: MODEL.sourceSha256, packageFreezeSha256: MODEL.packageFreezeSha256,
    modelManifestSha256: MODEL.modelManifestSha256, dimension: 1024, encoding: 'base64-f32le',
    vectors: [vector.toString('base64')], ...overrides }),
  { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Actual API factory, client, response validation and hybrid logic; isolate only persistence and HTTP. */
function factory(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  const vector = new Float32Array(1024); vector[0] = 1;
  const storage = {
    lexicalCandidates: vi.fn(async () => ({ status: 'ok' as const,
      corpus: { documentCount: 1, averageLength: 1 }, documentFrequencies: { pulse: 1 },
      candidates: [{ id: CHUNK, tenantId: WORKSPACE, tokenCount: 1, termFrequencies: { pulse: 1 } }],
      needsReviewCount: 0 })),
    denseCandidates: vi.fn(async () => ({ status: 'ok' as const,
      candidates: [{ id: CHUNK, tenantId: WORKSPACE, vector }], needsReviewCount: 0 })),
    hydrateCandidates: vi.fn(async ({ ids }: { ids: string[] }) => ({ status: 'ok' as const,
      candidates: ids.map(id => ({ id, tenantId: WORKSPACE, text: 'A bounded fixture passage',
        locators: [{ artifactId: '33333333-3333-4333-8333-333333333333', contentHash: 'd'.repeat(64),
          blockId: 'block-fixture', page: 1 }], claimIds: [] })), needsReviewCount: 0 })),
    recordQueryMetric: vi.fn(async () => undefined),
  };
  const source = readFileSync(new URL('../src/search-runtime.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {} as { buildHybridSearchFromEnv: (core: unknown, search: unknown) => ReturnType<typeof createHybridSearchService> };
  runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === 'node:crypto') return { randomBytes };
    if (name === '@openscience/search') return { EmbeddingClient, createHybridSearchService,
      loadSearchIndexRuntimeConfig: () => loadSearchIndexRuntimeConfig(ENV),
      SearchStorage: class { constructor() { return storage; } } };
    throw new Error('Unexpected runtime dependency');
  } });
  return { service: exports.buildHybridSearchFromEnv({}, {}), storage };
}

const query = { tenantId: WORKSPACE, query: 'pulse', limit: 10 };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('actual API query embedding deadline', () => {
  it('retains a valid single response arriving after3s within the existing client window', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response()), 4_000);
      init!.signal!.addEventListener('abort', () => {
        clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));
    const { service, storage } = factory(fetchImpl);
    const pending = service.search(query);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(pending).resolves.toMatchObject({ status: 'ok', mode: 'hybrid' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.denseCandidates).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)))
      .toEqual({ schemaVersion: 1, purpose: 'query', texts: ['pulse'] });
  });

  it('falls back at the existing30s bound without resending an acceptance-unknown query', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const { service, storage } = factory(fetchImpl);
    let completed = false;
    const pending = service.search(query).then(result => { completed = true; return result; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ status: 'ok', mode: 'lexical_only',
      degradationCode: 'embedding_unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.denseCandidates).not.toHaveBeenCalled();
  });

  it.each(['busy', 'unknown-transport'] as const)('keeps %s failure single-attempt and lexical', async kind => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      if (kind === 'unknown-transport') throw new TypeError('Fixture connection lost');
      return new Response(JSON.stringify({ schemaVersion: 1, error: 'worker_busy' }),
        { status: 503, headers: { 'content-type': 'application/json' } });
    });
    const { service, storage } = factory(fetchImpl);
    await expect(service.search(query)).resolves.toMatchObject({ status: 'ok', mode: 'lexical_only',
      degradationCode: 'embedding_unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.denseCandidates).not.toHaveBeenCalled();
  });

  it.each(['identity', 'bad-vector'] as const)('rejects %s responses before dense retrieval', async kind => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response(kind === 'identity'
      ? { sourceSha256: '4'.repeat(64) } : { vectors: ['AAAA'] }));
    const { service, storage } = factory(fetchImpl);
    await expect(service.search(query)).resolves.toMatchObject({ status: 'ok', mode: 'lexical_only',
      degradationCode: 'embedding_unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(storage.denseCandidates).not.toHaveBeenCalled();
  });
});

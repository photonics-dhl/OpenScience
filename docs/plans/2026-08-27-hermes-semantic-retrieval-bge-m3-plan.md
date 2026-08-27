# Hermes Semantic Retrieval and BGE-M3 Implementation Plan

> **Status: COMPLETED / DEPLOYED（2026-08-28）.** Taskmaster Task 6 is done. Production release `8163f8b4218e529ee4be41bb9fc732ff6497931a`; rollback `f9659668b237b70b4c018b866e20498689d327c2`.
> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver tenant-safe lexical+dense hybrid retrieval through `packages/search`, backed by an independently migrated search database and a source-locked CPU BGE-M3 service that is deployed and accepted on the ECS.

**Architecture:** `packages/search` owns chunking, lexical retrieval, exact dense search, reciprocal-rank fusion, storage and the only public retrieval API. A Python embedding service owns the FlagEmbedding SDK and model weights; API and Agent Worker communicate with it only through a bounded internal protocol. Search data uses `SEARCH_DATABASE_URL`; core product rows remain in `DATABASE_URL`, and an adapter boundary permits a later move to a dedicated database without changing API or Domain code.

**Tech Stack:** TypeScript, Vitest, Prisma 5.22, PostgreSQL 16, Python 3.12, FlagEmbedding 1.4.2, BAAI/bge-m3, CPU-only PyTorch, Docker Compose, ECS systemd-backed candidate evaluation.

## Global Constraints

- Final completion requires ECS build, search migration and rollback evidence, model/image digest, CPU/RSS/PID evidence, internal/public health and a representative retrieval journey. Local success is never deployment evidence.
- No local Docker and no local model installation. Candidate and production images are built and run only on the ECS.
- BGE-M3 is pinned to Hugging Face revision `5617a9f61b028005a4858fdac845db406aefb181`; FlagEmbedding is pinned to wheel `1.4.2`, SHA-256 `35e33a08e8ed5e299eabbe3bc23518eb66a424dd29ee08fb3802bf9aef9e9bf2`.
- BGE-M3 is MIT, emits 1024-dimensional dense vectors and supports up to 8192 tokens. This release caps chunks at 1024 tokens and queries at 512 tokens.
- Dense only: sparse, multi-vector and reranker paths remain absent from the production contract.
- CPU only: build and preflight must reject CUDA, NVIDIA, ROCm and Triton packages; the service receives no GPU device.
- Runtime worker has no external network, no production Secret, no writable root, runs non-root, and has explicit CPU, memory and PID limits.
- `packages/search` is the only business retrieval entry point. API, Domain, Web and Agent Worker must not import FlagEmbedding, Transformers, Torch or another model SDK.
- `DATABASE_URL` remains authoritative for users, workspaces, RO, Claim and Evidence. `SEARCH_DATABASE_URL` alone owns chunks, embeddings, index tasks, model versions and query telemetry.
- Database rows store text and metadata only. Model weights, PDFs and generated binary assets stay out of PostgreSQL.
- Search migration is expand-only, has `rollback.sql`, and must be exercised on an ECS disposable search database before production deploy.
- Raw queries, chunk text, embeddings, credentials, local paths and model payloads never enter logs or evaluation reports. Telemetry stores query SHA-256 only.
- Locator recovery is 100%. Any result whose locator cannot round-trip is excluded and recorded as `needs_review`.
- ECS release gate: hybrid P95 at or below 2500 ms on the baseline corpus, peak embedding-worker RSS at or below 6 GiB, zero GPU packages, hybrid nDCG@10 at least 0.85, and no more than 0.02 nDCG regression from the better component.
- When the embedding service or search database is unavailable, lexical retrieval remains usable when its own storage is available; original-file reading and manual editing remain unaffected.
- Production release/rollback tuple must come from Git and ECS runtime metadata immediately before deployment; this plan does not hard-code a future release SHA.

---

### Task 1: Establish the retrieval evaluation corpus and BGE-M3 ECS candidate

**Files:**
- Create: `test/research-intelligence/search-evaluation.json`
- Create: `apps/agent-worker/test/search-evaluation-corpus.test.ts`
- Create: `infra/embedding-candidates/bge-m3/Dockerfile`
- Create: `infra/embedding-candidates/bge-m3/runner.py`
- Create: `infra/embedding-candidates/bge-m3/runner_test.py`
- Create: `infra/scripts/evaluate-embedding-models.sh`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: self-authored Research Intelligence corpus and strict `SourceLocator` JSON.
- Produces: content-addressed query judgments plus a content-free candidate report containing exact model/package hashes, nDCG@10, Recall@10, P50/P95 and peak RSS.

- [x] **Step 1: Write the failing corpus and runner contract tests**

```ts
expect(corpus.schemaVersion).toBe(1);
expect(corpus.queries.length).toBeGreaterThanOrEqual(24);
expect(new Set(corpus.queries.map((query) => query.id)).size).toBe(corpus.queries.length);
expect(corpus.queries.some((query) => query.language === 'zh')).toBe(true);
expect(corpus.queries.some((query) => query.language === 'en')).toBe(true);
expect(corpus.queries.every((query) => query.relevantChunkIds.length > 0)).toBe(true);
```

The Python tests require `--print-lock` to return only `schemaVersion`, `candidate`, `modelRevision`, `modelManifestSha256`, `packageFreezeSha256`, `dimension`, `computePlatform` and `gpuPackageCount`. They require `--embed` to accept bounded stdin JSON with explicit `kind=query|corpus`, call the corresponding official encoder path and return base64-encoded little-endian float32 vectors without echoing input text.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- search-evaluation-corpus.test.ts
python -m unittest infra/embedding-candidates/bge-m3/runner_test.py
```

Expected: failures because the corpus, candidate runner and source-lock manifest do not exist.

- [x] **Step 3: Implement the source-locked CPU candidate**

The image downloads the exact FlagEmbedding wheel by checksum, installs CPU-only Torch from the official CPU index, downloads model revision `5617a9f61b028005a4858fdac845db406aefb181` during build, writes a sorted per-file SHA-256 manifest and disables Hugging Face/Transformers network access at runtime. `runner.py` loads `FlagAutoModel.from_finetuned(model_path, devices='cpu')`, uses `encode_queries` and `encode_corpus` explicitly, sets dense-only output, `use_fp16=False`, batch size 1–8 and a hard maximum length of 1024 for corpus chunks.

The evaluation script mirrors the parser candidate controls: exact Git SHA root, non-root user, read-only root, `--network none`, 2 CPU, 6 GiB, 128 PID, 120-second per-query timeout, 64 KiB stdout limit and no Docker log persistence. It runs only on the ECS and publishes reports atomically after all cases finish.

- [x] **Step 4: Run local non-container gates**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- search-evaluation-corpus.test.ts
python -m unittest infra/embedding-candidates/bge-m3/runner_test.py
& 'C:\Program Files\Git\bin\bash.exe' -n infra/scripts/evaluate-embedding-models.sh
```

Expected: all pass without downloading the model or invoking Docker.

- [x] **Step 5: Commit the candidate harness**

```bash
git add test/research-intelligence/search-evaluation.json apps/agent-worker/test/search-evaluation-corpus.test.ts infra/embedding-candidates/bge-m3 infra/scripts/evaluate-embedding-models.sh .gitignore
git commit -m "test(search): add source-locked BGE-M3 ECS gate"
```

- [x] **Step 6: Run the candidate gate on ECS under a detached systemd unit**

Materialize the exact commit under `/opt/openscience-evals/embedding/<git-sha>/source`, run frozen pnpm install, then start the evaluator with `systemd-run`. Record the image digest, model revision, package/model aggregate hashes, file count, query metrics, peak RSS and residue count. Do not promote the candidate when any hard gate fails.

### Task 2: Expand the independent search schema

**Files:**
- Modify: `infra/search/schema.prisma`
- Create: `infra/search/migrations/20260827010000_search_retrieval/migration.sql`
- Create: `infra/search/migrations/20260827010000_search_retrieval/rollback.sql`
- Create: `packages/search/test/migration.test.ts`

**Interfaces:**
- Consumes: independent `SEARCH_DATABASE_URL` and baseline search migration `20260826011000_search_baseline`.
- Produces: `SearchChunk`, `SearchEmbedding`, `SearchModelVersion`, `SearchIndexTask` and `SearchQueryMetric` tables plus lexical indexes.

- [x] **Step 1: Write migration shape and rollback tests**

```ts
expect(migration).toContain('CREATE TABLE "search_chunks"');
expect(migration).toContain('CREATE TABLE "search_embeddings"');
expect(migration).toContain('CREATE INDEX "search_chunks_search_vector_idx"');
expect(migration).toContain('USING GIN');
expect(migration).not.toContain('DROP TABLE');
expect(rollback).toContain('DROP TABLE IF EXISTS "search_query_metrics"');
expect(rollback).toContain("DELETE FROM \"_prisma_migrations\"");
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/search test -- migration.test.ts`

Expected: fail because migration 2 and retrieval models are absent.

- [x] **Step 3: Add portable search records**

`SearchChunk` stores tenant scope, RO/artifact/content hashes, ordinal, bounded text, token count, JSON locators, claim IDs, lexical terms and term frequencies. `SearchEmbedding` stores model-version ID, 1024 dimension, normalized float32 bytes, vector SHA-256 and norm. `SearchQueryMetric` stores only query hash, component availability, result count, bounded error code and component/total latency. Add a generated `tsvector` column and GIN indexes with manual SQL while keeping Prisma's representation `Unsupported("tsvector")`.

- [x] **Step 4: Exercise forward and rollback migrations on an ECS disposable search database**

Create a uniquely named disposable database inside the existing production PostgreSQL container, point only the migration command at it, deploy migrations 1–2, verify tables/indexes, execute migration 2 rollback, verify migration 1 remains, then redeploy migration 2. Never run the rollback against production data.

Exact-SHA ECS evidence: `openscience-search-migration-drill-c8fc590-a4.service`
used source `c8fc590751c605ea583cdfa7b81d972dc2b9a5cf`. Forward, rollback
and redeploy counts were respectively `2/5/1/3`, `1/0/0/0` and `2/5/1/3`
for active migrations/retrieval tables/GIN indexes/revised contract columns.
The disposable database was dropped afterward. Production search remains at
migration `1/1`.

- [x] **Step 5: Commit the schema expansion**

```bash
git add infra/search packages/search/test/migration.test.ts
git commit -m "feat(search): add portable retrieval storage"
```

### Task 3: Implement deterministic semantic chunking with locator preservation

**Files:**
- Create: `packages/search/src/types.ts`
- Create: `packages/search/src/tokenizer.ts`
- Create: `packages/search/src/chunker.ts`
- Create: `packages/search/test/chunker.test.ts`
- Modify: `packages/search/src/index.ts`
- Modify: `packages/search/package.json`

**Interfaces:**
- Consumes: `DocumentSourceMap`, optional Claim IDs and validated `SourceLocator` values.
- Produces: `chunkDocument(input: ChunkDocumentInput): SearchChunkDraft[]` with 512–1024 deterministic search tokens, ordered locator segments and stable IDs.

- [x] **Step 1: Write failing chunk boundary and locator tests**

```ts
const chunks = chunkDocument({ sourceMap, claimIdsByBlockId });
expect(chunks.every((chunk) => chunk.tokenCount <= 1024)).toBe(true);
expect(chunks.slice(0, -1).every((chunk) => chunk.tokenCount >= 512)).toBe(true);
expect(chunks.flatMap((chunk) => chunk.locators).every((locator) =>
  resolveSourceLocator(sourceMap, locator)
)).toBeTruthy();
expect(chunkDocument({ sourceMap, claimIdsByBlockId })).toEqual(chunks);
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/search test -- chunker.test.ts`

- [x] **Step 3: Implement bounded multilingual tokenization and chunking**

Use Unicode word segmentation plus CJK bigrams for deterministic lexical terms. Do not split tables, equations or reference entries across chunks. Preserve one locator segment per contributing block, including artifact ID, content hash, page, bounding box and char range where present. Stable chunk IDs are SHA-256 over schema version, artifact/content hash, ordered block IDs and ordinal; raw text is never part of logs.

- [x] **Step 4: Run package tests and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/search test
npx pnpm@9.15.0 --filter @openscience/search typecheck
git add packages/search
git commit -m "feat(search): add locator-safe semantic chunking"
```

### Task 4: Implement PostgreSQL lexical candidates and BM25 scoring

**Files:**
- Create: `packages/search/src/lexical.ts`
- Create: `packages/search/src/storage.ts`
- Create: `packages/search/test/lexical.test.ts`
- Create: `packages/search/test/storage.integration.test.ts`
- Modify: `packages/search/src/index.ts`

**Interfaces:**
- Consumes: query text, tenant scope, `SearchChunkDraft` and `SearchPrismaClient`.
- Produces: `lexicalSearch(input: LexicalSearchInput): Promise<RankedCandidate[]>` and `SearchStorage` upsert/query methods.

- [x] **Step 1: Write deterministic BM25 and tenant-isolation tests**

```ts
expect(scoreBm25({ tf: 3, df: 2, documentLength: 100, documentCount: 10, averageLength: 120 }))
  .toBeCloseTo(2.414, 3);
expect(await storage.lexicalCandidates({ tenantId: 'workspace-a', query: 'pulse', limit: 20 }))
  .not.toContainEqual(expect.objectContaining({ tenantId: 'workspace-b' }));
```

- [x] **Step 2: Run unit tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/search test -- lexical.test.ts`

- [x] **Step 3: Implement candidate retrieval and scoring**

Select candidates with the union of PostgreSQL `websearch_to_tsquery('simple', ...)` and GIN-indexed lexical term overlap, always filtered by tenant scope before ranking. Calculate BM25 in TypeScript with fixed `k1=1.2` and `b=0.75`, using bounded term-frequency JSON and current corpus statistics. Stable tie-break is chunk ID. Empty or oversized queries fail validation; database errors return a typed `search_storage_unavailable` result rather than leaking connection details.

- [x] **Step 4: Run integration tests only on ECS**

Run a full repository build first, then execute the search integration suite against a uniquely named disposable search database. Verify tenant isolation, deterministic ranking and an explain plan using the GIN index.

- [x] **Step 5: Commit lexical retrieval**

```bash
git add packages/search
git commit -m "feat(search): add tenant-safe BM25 retrieval"
```

**Acceptance (2026-08-27):** tenant-safe upsert/query, bounded exact BM25,
two-stage hydration, malformed-TF fail-soft behavior and typed capacity/storage
failures are implemented through candidate commits `8c484b5`–`7d489c5`.
`openscience-search-lexical-drill-7d489c5-a1.service` fetched exact source
`7d489c51e0005206b2714283ae722df1354b1eed` through `with-proxy`, generated
both Prisma clients, completed the full ECS workspace build, exercised migration
forward `2/5/1/3`, rollback `1/0/0/0` and redeploy `2/5/1/3`, then passed all
five real PostgreSQL integration tests with zero disposable database/container
residue. The GIN assertion proves the exact production candidate SQL remains
GIN/BitmapOr-eligible with tenant indexes present; representative-scale planner
performance remains a later Task 9 gate. Production release stayed
`f9659668b237b70b4c018b866e20498689d327c2`, production search stayed `1/1`,
and neither migration 2 nor the retrieval route was deployed.

### Task 5: Add the bounded embedding protocol and production CPU worker

**Files:**
- Create: `packages/search/src/embedder.ts`
- Create: `packages/search/test/embedder.test.ts`
- Create: `apps/embedding-worker/app.py`
- Create: `apps/embedding-worker/app_test.py`
- Create: `apps/embedding-worker/Dockerfile`
- Create: `apps/embedding-worker/requirements.lock`
- Create: `apps/embedding-worker/model-init.py`
- Modify: `pnpm-workspace.yaml`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: bounded query/chunk text batches through internal HTTP.
- Produces: `EmbeddingClient.embed(input): Promise<DenseEmbeddingBatch>` and `/health`, `/v1/tokenize`, `/v1/embeddings` worker endpoints.

- [x] **Step 1: Write protocol rejection tests**

```ts
await expect(client.embed({ purpose: 'query', texts: ['x'.repeat(20_001)] }))
  .rejects.toThrow(/limit_exceeded/);
await expect(client.embed({ purpose: 'query', texts: Array(17).fill('bounded') }))
  .rejects.toThrow(/batch/);
expect(loggerOutput).not.toContain('bounded');
```

Python tests require schema version 1, batch size 1–16, query max 512 tokens, chunk max 1024 tokens, exactly 1024 finite float values, normalized vectors and no input reflection in errors or logs.

- [x] **Step 2: Run TypeScript/Python tests and verify RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/search test -- embedder.test.ts
python -m unittest apps/embedding-worker/app_test.py
```

- [x] **Step 3: Implement the protocol adapter and offline worker**

`EmbeddingClient` uses injected `fetch`, an internal base URL, 30-second request timeout, one retry only before response bytes, 256 KiB response cap and strict unknown-field rejection. The Python worker loads only `/models/bge-m3`, validates the model manifest before readiness, disables telemetry/network, uses CPU and dense-only inference, and emits base64 little-endian float32 vectors plus model revision/dimension.

The image runs as UID/GID 10001. `model-init.py` copies the exact built-in seed into an empty versioned named volume only when the manifest matches; an existing mismatched volume fails closed and is never deleted automatically.

- [x] **Step 4: Run non-container gates and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/search test
npx pnpm@9.15.0 --filter @openscience/search typecheck
python -m unittest apps/embedding-worker/app_test.py
git add packages/search apps/embedding-worker pnpm-workspace.yaml .dockerignore
git commit -m "feat(search): add bounded CPU embedding service"
```

### Task 6: Implement exact dense retrieval, RRF and graceful degradation

**Files:**
- Create: `packages/search/src/dense.ts`
- Create: `packages/search/src/fusion.ts`
- Create: `packages/search/src/service.ts`
- Create: `packages/search/test/dense.test.ts`
- Create: `packages/search/test/fusion.test.ts`
- Create: `packages/search/test/service.test.ts`
- Modify: `packages/search/src/index.ts`

**Interfaces:**
- Consumes: `SearchStorage`, `EmbeddingClient`, tenant scope and query.
- Produces: `createHybridSearchService(dependencies).search(input): Promise<HybridSearchResponse>`.

- [x] **Step 1: Write failing cosine, RRF and degradation tests**

```ts
expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
expect(fuseRankedLists({ lexical: ['a', 'b'], dense: ['b', 'c'], k: 60 })[0]?.id).toBe('b');
await expect(service.search(query)).resolves.toMatchObject({
  mode: 'lexical_only',
  degradationCode: 'embedding_unavailable',
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/search test -- dense.test.ts fusion.test.ts service.test.ts`

- [x] **Step 3: Implement bounded exact dense search and RRF**

The initial storage adapter scans at most 10,000 tenant-scoped normalized embeddings and computes cosine similarity in process; above that bound dense returns `dense_capacity_exceeded` and lexical continues. This deliberately portable implementation avoids changing the production PostgreSQL image. `SearchStorage.denseCandidates` remains replaceable by a future pgvector or managed-database adapter.

RRF uses `1 / (60 + rank)` with one-based ranks, stable chunk-ID ties and configurable lexical/dense result limits capped at 100. Locator validation runs after fusion; invalid results are omitted and counted as `needs_review`. Telemetry stores hashes and timings only.

- [x] **Step 4: Run package gates and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/search test
npx pnpm@9.15.0 --filter @openscience/search build
npx pnpm@9.15.0 --filter @openscience/search typecheck
git add packages/search
git commit -m "feat(search): add dense RRF retrieval with fallback"
```

### Task 7: Wire asynchronous indexing without crossing model boundaries

**Files:**
- Create: `apps/agent-worker/src/search-indexer.ts`
- Create: `apps/agent-worker/test/search-indexer.test.ts`
- Modify: `apps/agent-worker/src/index.ts`
- Modify: `apps/agent-worker/package.json`

**Interfaces:**
- Consumes: ready `DocumentSourceMap`, Claim IDs, `SearchStorage` and `EmbeddingClient` through `@openscience/search`.
- Produces: idempotent `search.index` AgentTask processing with queued/running/succeeded/needs_review/failed states.

- [x] **Step 1: Write idempotency, stale-input and fallback tests**

```ts
await indexDocument(job);
await indexDocument(job);
expect(await storage.chunkCount(job.artifactId, job.contentHash)).toBe(expectedChunkCount);
await expect(indexDocument({ ...job, contentHash: 'f'.repeat(64) }))
  .rejects.toThrow(/content hash/);
expect(await indexDocument(job, { embeddingUnavailable: true })).toMatchObject({ status: 'needs_review' });
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- search-indexer.test.ts`

- [x] **Step 3: Implement indexing and atomic replacement**

Validate the source map and locators before chunking. Upsert chunk metadata first, request embeddings in batches of at most 8, then atomically activate the new content-hash/model-version generation. An embedding failure leaves lexical chunks active and marks the index task `needs_review`; it never deletes the last successful dense generation. No raw text enters AgentTask result or logs.

- [x] **Step 4: Run worker/search gates and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/search... --filter @openscience/agent-worker... test
npx pnpm@9.15.0 --filter @openscience/search... --filter @openscience/agent-worker... build
git add apps/agent-worker
git commit -m "feat(worker): add idempotent hybrid search indexing"
```

### Task 8: Add production topology, independent backup and mechanical runbook

**Files:**
- Modify: `infra/compose/docker-compose.prod.yml`
- Modify: `infra/compose/docker-compose.dev.yml`
- Modify: `infra/scripts/deploy.sh`
- Modify: `infra/scripts/deploy.test.mjs`
- Modify: `infra/scripts/backup.sh`
- Modify: `.env.example`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/runbooks/hermes-capability-registry.md`

**Interfaces:**
- Consumes: accepted BGE-M3 image/model locks and search migration 2.
- Produces: internal-only `embedding-worker`, versioned model volume, independent search backup/restore and documented rollback.

- [x] **Step 1: Write failing topology and deployment assertions**

```js
assert.match(compose, /embedding-worker:/);
assert.match(compose, /read_only: true/);
assert.match(compose, /pids_limit: 128/);
assert.match(compose, /embedding_net:/);
assert.match(compose, /internal: true/);
assert.match(deploy, /migrate:deploy/);
assert.match(backup, /SEARCH_DATABASE_URL/);
```

- [x] **Step 2: Run tests and verify RED**

Run: `node --test infra/scripts/deploy.test.mjs scripts/verify-database-isolation.test.mjs`

- [x] **Step 3: Add isolated runtime and model volume**

Attach only Agent Worker and embedding worker to `embedding_net`; set it `internal: true`. Put model services behind the explicit `embedding` Compose profile and `BGE_M3_DEPLOY` gate so disabled releases neither build nor start the model. Embedding worker receives no `env_file`, no `data_net`, no ports, no capabilities and no external network. Mount `openscience-bge-m3-5617a9f61b028005a4858fdac845db406aefb181` read-only after a one-shot manifest-verified init. Set 2 CPU, 6 GiB and 128 PID limits. Keep `BGE_M3_ENABLED=false` until migration, volume init, strict identity health and a real-vector canary are green.

- [x] **Step 4: Extend independent search backup and restore**

`backup.sh --db` must create separate core and search dumps with independent checksums and retention metadata without printing either URL. The runbook includes four complete sections: preflight, numbered deployment, rollback, and verification. The restore drill targets a disposable search database and verifies search migrations 2/2 and row/hash parity.

- [x] **Step 5: Run local static gates and commit**

```bash
node --test infra/scripts/deploy.test.mjs scripts/verify-database-isolation.test.mjs
docker compose -f infra/compose/docker-compose.prod.yml config --quiet
git add infra .env.example docs/runbooks
git commit -m "feat(infra): add isolated BGE-M3 search runtime"
```

The Compose config command runs on ECS only; local validation is limited to YAML/static tests because local Docker is prohibited.

### Task 9: Deploy and accept Taskmaster Task 6 on ECS

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`

**Interfaces:**
- Consumes: all prior tasks and accepted candidate evidence.
- Produces: immutable production release evidence, rollback tuple, Taskmaster Task 6 `done`, and the next dependency-correct task.

- [x] **Step 1: Run pre-deploy review and repository gates**

Run focused security/architecture review, then:

```powershell
npx pnpm@9.15.0 build
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 test
npx pnpm@9.15.0 audit:knip
npx pnpm@9.15.0 audit:dep
npx pnpm@9.15.0 audit:deps
npx pnpm@9.15.0 audit:docs-sync
npx pnpm@9.15.0 docs:lint
git diff --check
```

- [x] **Step 2: Perform ECS backup and disposable migration/restore drill**

Fetch the exact branch, run `checkup.sh`, verify current release/rollback and create core+search backups. Exercise search migration 2 forward/rollback/redeploy against a disposable database, then restore the independent search dump to another disposable database and verify hashes. Preserve all logs outside the repository and report only bounded evidence.

- [x] **Step 3: Deploy the immutable release**

Use `infra/scripts/deploy.sh` from explicit Git Bash. The server must perform full pnpm build, core migration status, search migration 2/2, model-volume manifest verification, embedding image digest verification and Compose rollout. Do not enable the dense route until the worker is healthy and a bounded internal canary passes.

- [x] **Step 4: Run production acceptance**

Verify:

1. all production containers healthy and no candidate/canary residue;
2. embedding worker non-root, read-only, no external network, no Secret and exact model/package lock;
3. lexical-only behavior while the embedding worker is intentionally stopped, followed by successful recovery;
4. 24+ self-authored queries with nDCG@10, Recall@10, P50/P95, peak RSS and 100% locator round-trip;
5. search backup and restore checksum parity;
6. loopback/public HTTPS and `/__release` exact immutable SHA;
7. production release marker updated and failure marker absent;
8. previous immutable release remains the rollback target.

- [x] **Step 5: Close Taskmaster and project memory**

Set Task 6 to `done` only after all ECS gates pass. Update the CURRENT spec, capability registry, progress, handoff and index with the exact model revision, image/model/package hashes, migration status, metrics, release and rollback. Run docs sync and Markdown lint again, commit, push, and verify worktree clean.

## Self-Review

- Spec coverage: §8.1 hybrid retrieval, §8.2 storage separation, §13 worker isolation, §14.3 performance/locator thresholds, §15 provider boundary and §16 ECS acceptance are each mapped to an implementation and server gate.
- No production path enables sparse, multi-vector, reranking, GPU packages or a model SDK outside the embedding worker.
- Type flow is consistent: `SearchChunkDraft` → `SearchStorage` → lexical/dense `RankedCandidate` → `fuseRankedLists` → `HybridSearchResponse`; Agent Worker depends only on `@openscience/search`.
- Database changes are expand-only, binary assets remain outside PostgreSQL, rollback is explicit, and production backup/restore is required before real search writes.
- The current exact-scan dense adapter has an explicit 10,000-chunk cap and a replacement boundary; it does not pretend to be a high-concurrency vector database.

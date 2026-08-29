# Hermes Research Intelligence Core Model Implementation Plan

> **Status:** COMPLETED / TASKMASTER TASK 2 DONE / ECS RELEASE `e0828a6` DEPLOYED. Steps use checkbox syntax as retained execution evidence.

**Goal:** Complete Taskmaster `hermes-research-intelligence` Task 2 with strict Claim/Evidence domain contracts, an expand-only core migration, and a separately configurable and migratable search database boundary.

**Architecture:** Existing RO, Version, Artifact, User, Audit and Approval tables remain authoritative and unchanged in meaning. New Research Intelligence metadata is added to the core Prisma schema through migration 28, while search-derived data receives its own Prisma schema, generated client, migration ledger and `SEARCH_DATABASE_URL`; neither core domain code nor API code imports that search client. Runtime rules live in `packages/domain`, and database rows keep only metadata, hashes, locators and object keys.

**Tech Stack:** TypeScript 5.5, Vitest 2, Prisma 5.22, PostgreSQL, pnpm 9.15.0.

## Global Constraints

- The production host is CPU-only; this task adds no model, parser, GPU runtime or third-party dependency.
- `DATABASE_URL` remains the source for core transactions; `SEARCH_DATABASE_URL` is independently configured and migrated.
- Core migration 28 is expand-only and has a tested `rollback.sql`; all database/container validation and the final deployment run on the ECS through the canonical Git Bash scripts, never through local Docker.
- PDF, image, video, model weights and generated asset bytes stay in object storage; PostgreSQL stores metadata, hashes and object keys only.
- Every published Version must have 3–7 core Claims; child relations must remain within one RO/version and must be acyclic.
- Source locators must retain `artifactId` and a 64-character SHA-256 `contentHash`; exact quotes without a valid locator cannot become Evidence.
- Hermes visual/runtime files, Landing and existing RO/SDF behavior are frozen.

---

### Task 1: Establish Research Intelligence domain vocabulary

**Files:**
- Create: `packages/domain/src/research-intelligence/types.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/research-intelligence/types.test.ts`

**Interfaces:**
- Consumes: approved types from `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` §§4–6 and §13.
- Produces: `ResearchIdentity`, `ResearchIdentityProfile`, `ClaimKind`, `ClaimAssessment`, `EvidenceKind`, `ClaimRelation`, `ExtractionStatus`, `PresentationAssetKind`, `PresentationAsset`, `ExtractionProvenance`, and their canonical readonly value arrays.

- [x] **Step 1: Write the failing vocabulary test**

```ts
expect(RESEARCH_IDENTITIES).toEqual([
  'reader', 'author', 'reviewer', 'editor', 'data_steward', 'developer', 'student',
]);
expect(PRESENTATION_ASSET_LABEL).toBe('presentation_not_evidence');
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence/types.test.ts`

Expected: FAIL because `src/research-intelligence/types.ts` does not exist.

- [x] **Step 3: Add the exact readonly constants and structural types**

```ts
export const CLAIM_KINDS = ['core', 'supporting', 'method', 'boundary', 'counter'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export interface ExtractionProvenance {
  source: 'deterministic' | 'ocr' | 'llm_ocr' | 'human';
  provider: string;
  providerVersion: string;
  inputHash: string;
}
```

`PresentationAsset` includes `objectKey`, `contentHash`, source Claim IDs, generator/version, optional prompt hash, status and the literal label. It never contains binary bytes.

- [x] **Step 4: Export the domain vocabulary and verify GREEN**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence/types.test.ts`

Expected: PASS.

### Task 2: Validate identity profiles and deterministic source locators

**Files:**
- Create: `packages/domain/src/research-intelligence/validation.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/research-intelligence/validation.test.ts`

**Interfaces:**
- Consumes: `ResearchIdentityProfile`, `SourceLocator` and constants from Task 1.
- Produces: `validateResearchIdentityProfile(profile): ResearchIdentityProfile`, `validateSourceLocator(locator): SourceLocator`, and `ResearchIntelligenceValidationError`.

- [x] **Step 1: Write failing identity and locator behavior tests**

```ts
expect(() => validateResearchIdentityProfile({
  identities: ['reader'], primaryIdentity: 'author', disciplines: [], methods: [], topics: [], languages: ['zh'],
})).toThrow(/primaryIdentity/);

expect(() => validateSourceLocator({
  artifactId: 'artifact-1', contentHash: 'a'.repeat(64), page: 2,
  boundingBox: { x: 10, y: 20, width: 0, height: 40 },
})).toThrow(/boundingBox/);
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence/validation.test.ts`

Expected: FAIL because the validators do not exist.

- [x] **Step 3: Implement strict validation without provider-specific fields**

`validateSourceLocator` requires a non-empty artifact ID, lowercase or uppercase SHA-256 hex, and at least one of page, char range, table cell or code range. Bounding boxes require a page, non-negative origin and positive dimensions; character ranges are half-open and increasing; table rows/columns are non-negative; code lines are one-based and increasing. Unknown top-level and nested keys are rejected.

- [x] **Step 4: Verify valid page/bbox, char, table and code variants round-trip**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence/validation.test.ts`

Expected: PASS.

### Task 3: Enforce the Claim graph and ExtractionResult boundary

**Files:**
- Create: `packages/domain/src/research-intelligence/claim-graph.ts`
- Create: `packages/domain/src/research-intelligence/extraction-result.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/research-intelligence/claim-graph.test.ts`
- Test: `packages/domain/test/research-intelligence/extraction-result.test.ts`

**Interfaces:**
- Consumes: `ClaimNode`, `ExtractionStatus` and source-map decoder callbacks.
- Produces: `validateClaimGraph(claims): readonly ClaimNode[]`, generic `ExtractionResult<TSourceMap>`, `serializeExtractionResult(result): string`, and `parseExtractionResult(json, parseSourceMap): ExtractionResult<TSourceMap>`.

- [x] **Step 1: Write failing graph tests for all publish constraints**

```ts
expect(() => validateClaimGraph(twoCoreClaims)).toThrow(/3.*7/);
expect(() => validateClaimGraph(childWithMissingParent)).toThrow(/parent/);
expect(() => validateClaimGraph(cyclicClaims)).toThrow(/cycle/);
```

Tests also reject duplicate IDs, a parent from another RO/version, and a core Claim with a parent.

- [x] **Step 2: Verify Claim graph RED**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence/claim-graph.test.ts`

Expected: FAIL because `validateClaimGraph` does not exist.

- [x] **Step 3: Implement graph validation with iterative parent traversal**

Use an ID map and a three-state visitation map. Return the original readonly graph only after the core count, uniqueness, same-scope parent, root/child and cycle checks all pass.

- [x] **Step 4: Write and verify failing ExtractionResult round-trip tests**

```ts
const encoded = serializeExtractionResult({ status: 'needs_review', sourceMap, reasons: ['bbox_low_confidence'] });
expect(parseExtractionResult(encoded, parseFixtureSourceMap)).toEqual({
  status: 'needs_review', sourceMap, reasons: ['bbox_low_confidence'],
});
```

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence/extraction-result.test.ts`

Expected: FAIL because serialization/parsing does not exist.

- [x] **Step 5: Implement strict discriminated-union parsing and verify GREEN**

Succeeded and needs-review results call the supplied strict source-map decoder. Blocked accepts only `rights_unknown | malware | limit_exceeded`; failed requires a boolean `retryable`, non-empty provider and message. Unknown fields or statuses fail closed.

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- test/research-intelligence`

Expected: all Research Intelligence domain tests PASS.

### Task 4: Add expand-only core Prisma migration 28

**Files:**
- Modify: `infra/schema.prisma`
- Create: `infra/migrations/20260826010000_research_intelligence_core/migration.sql`
- Create: `infra/migrations/20260826010000_research_intelligence_core/rollback.sql`

**Interfaces:**
- Consumes: existing `User`, `ResearchObject`, `Version` and `Artifact` primary keys.
- Produces: `ResearchIdentityProfile`, `ClaimNode`, `EvidenceRecord`, `PresentationAsset` Prisma models and corresponding relations/enums.

- [x] **Step 1: Add schema models, run validation and observe migration drift**

Run: `npx pnpm@9.15.0 exec prisma validate --schema infra/schema.prisma`

Expected before DDL is added: schema validates, but migration history does not yet describe the new models.

- [x] **Step 2: Write explicit additive DDL**

Create enums and four tables with UUID keys, timestamps, metadata-only columns and foreign keys. `EvidenceRecord` stores the locator as validated JSON plus separately indexed `artifact_id` and 64-character `content_hash`; `PresentationAsset` stores `object_key` and hashes, never asset bytes. Add RO/version/claim lookup indexes and no destructive `ALTER`.

- [x] **Step 3: Write reverse-order rollback**

Drop `presentation_assets`, `evidence_records`, `claim_nodes`, `research_identity_profiles`, then the new enum types. The rollback touches no pre-existing table or enum.

- [x] **Step 4: Format and validate the schema**

Run: `npx pnpm@9.15.0 exec prisma format --schema infra/schema.prisma`

Run: `npx pnpm@9.15.0 exec prisma validate --schema infra/schema.prisma`

Expected: both PASS.

### Task 5: Create the independently migratable search database boundary

**Files:**
- Create: `packages/config/src/search-env.ts`
- Create: `packages/config/test/search-env.test.ts`
- Modify: `packages/config/src/dev-defaults.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `.env.example`
- Create: `infra/search/schema.prisma`
- Create: `infra/search/migrations/20260826011000_search_baseline/migration.sql`
- Create: `infra/search/migrations/20260826011000_search_baseline/rollback.sql`
- Create: `packages/search/src/client.ts`
- Create: `packages/search/src/index.ts`
- Create: `packages/search/test/client.test.ts`
- Modify: `packages/search/package.json`
- Modify: `packages/search/tsconfig.json`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `SEARCH_DATABASE_URL` and the generated client from `infra/search/schema.prisma`.
- Produces: `loadSearchEnv`, `createSearchPrismaClient`, `search:generate`, `search:migrate:deploy`, and `search:migrate:status` without importing the core Prisma client.

- [x] **Step 1: Write failing config and client tests**

```ts
expect(() => loadSearchEnv({ NODE_ENV: 'production' })).toThrow(/SEARCH_DATABASE_URL/);
expect(loadSearchEnv({ SEARCH_DATABASE_URL: 'postgresql://search-host/search' }).databaseUrl)
  .toBe('postgresql://search-host/search');
```

The client test creates a lazy client with an explicit URL and disconnects it without opening a database connection.

- [x] **Step 2: Verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/config test -- test/search-env.test.ts`

Expected: FAIL because `loadSearchEnv` does not exist.

- [x] **Step 3: Implement config and a separate Prisma generator**

The development default is `postgresql://openscience:openscience_dev@127.0.0.1:5432/openscience_search`; production has no fallback. The search schema owns only `SearchSchemaMeta` in this task, proving a separate migration ledger without prematurely adding chunk/embedding tables.

- [x] **Step 4: Add package scripts and regenerate the lockfile mechanically**

Run: `npx pnpm@9.15.0 install --lockfile-only`

Run: `npx pnpm@9.15.0 --filter @openscience/search generate`

The generated client directory is ignored and recreated by build/typecheck/test.

- [x] **Step 5: Validate both schemas and verify GREEN**

Run: `npx pnpm@9.15.0 --filter @openscience/config test -- test/search-env.test.ts`

Run: `npx pnpm@9.15.0 --filter @openscience/search test`

Run: `npx pnpm@9.15.0 exec prisma validate --schema infra/search/schema.prisma`

Expected: all PASS without connecting to the core database.

### Task 6: Prove migrations, synchronize truth and close Taskmaster Task 2

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: `AGENTS.md` only if the verified migration count changes in this branch.

**Interfaces:**
- Consumes: both migration ledgers and all Task 2 tests.
- Produces: fresh migration/rollback evidence, Taskmaster Task 2 `done`, and Task 3 as the next unique ready task.

- [x] **Step 1: Run core and search migrations against disposable ECS databases**

Use uniquely named temporary databases inside the server's existing dev PostgreSQL container. Apply migration 28 and the search baseline, assert all expected tables and constraints, execute each `rollback.sql`, assert the new tables are absent, then re-apply. Drop only the two databases created by this test after their results are recorded; do not start local Docker or touch the production database during this disposable test.

- [x] **Step 2: Run focused and whole-package gates**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test`

Run: `npx pnpm@9.15.0 --filter @openscience/database typecheck`

Run: `npx pnpm@9.15.0 --filter @openscience/search test`

Run: `npx pnpm@9.15.0 typecheck`

Run: `npx pnpm@9.15.0 lint`

Run: `npx pnpm@9.15.0 build`

- [x] **Step 3: Mark Task 2 done only after every acceptance item is green**

Update the current Taskmaster tag, verify Task 3 `DocumentSourceMap Contract and Parser Interfaces` is the only dependency-ready next item, and keep Tasks 4–12 blocked by their declared dependencies.

- [x] **Step 4: Synchronize CURRENT documentation and final gates**

Run: `npx pnpm@9.15.0 audit:docs-sync`

Run: `npx pnpm@9.15.0 docs:lint`

Run: `git diff --check`

Expected: `DOCS_SYNC_OK`, Markdown has zero issues, and the diff check is clean.

- [x] **Step 5: Review the complete diff before commit**

Verify expand-only compatibility, rollback safety, cross-database isolation, no binary storage, no `.env` values, no provider SDK imports and no unrelated UI/Hermes changes. Commit only the Task 2 implementation and its documentation.

- [x] **Step 6: Deploy the exact accepted commit on ECS**

Push the feature ref, wait for CI, run canonical pre-checkup and database backup, create the production `openscience_search` database and inject `SEARCH_DATABASE_URL` without printing any value, then run `infra/scripts/deploy.sh` without `--skip-migrate`. Verify server full build, current-repository core migrations 28/28, the independent search baseline migration 1/1, target container health, Parser isolation, loopback/public health, exact `/__release`, absent failure marker and the previous immutable release as rollback. Preserve the one historical core ledger row `20260809010000_ro_create_idempotency`; it is not a current repository migration and must not be deleted. The existing idempotent quota seed remains part of the canonical deploy chain; no research-data seed or unrelated data write is allowed.

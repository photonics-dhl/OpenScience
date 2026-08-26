# Hermes DocumentSourceMap Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Taskmaster `hermes-research-intelligence` Task 3 with a strict, provider-neutral `DocumentSourceMap`, deterministic `SourceLocator` construction and resolution, and a runtime-validated parser interface that future CPU/OCR parsers must implement.

**Architecture:** `packages/domain` owns the serializable source-map and locator contracts; it has no parser, provider or Node process dependency. `apps/agent-worker/src/parsers` owns byte inputs, SHA-256 verification, parser execution and operational self-test. Existing text/PDF/DOCX ingestion remains the compatibility path until Task 4, but it must no longer report control-only or page-marker-only scanned PDF output as ready.

**Tech Stack:** TypeScript 5.5, Vitest 2, Node.js 22, pnpm 9.15.0.

## Global Constraints

- The approved source-map block kinds are exactly `heading`, `paragraph`, `figure`, `table`, `equation`, `caption` and `reference`.
- Page numbers are positive and unique; page dimensions are finite and positive; every bounding box is finite, positive and contained by its page.
- Confidence is optional but, when present, must be finite and within `[0, 1]`.
- Map, page, block, parser and transformation objects reject unknown fields; provider-private payloads never cross into Domain.
- Every map and locator retains `artifactId` and a 64-character SHA-256 `contentHash`; generated block locators also retain `blockId` for unambiguous resolution.
- A successful parser result must contain at least one validated block. Empty/boilerplate-only extraction is `needs_review`, never success.
- Task 3 installs no Docling, LiteParse, GROBID, OCR, model, provider SDK or other dependency; cascade/provider implementation remains Task 4/5.
- No database schema change or migration belongs to Task 3.
- All Docker, container, image-build and final runtime acceptance steps run on ECS through explicit Git for Windows Bash and canonical project scripts; local Docker is forbidden.
- Landing, Hermes visual/runtime behavior and public RO UI remain frozen.

---

### Task 1: Add the strict DocumentSourceMap domain contract

**Files:**

- Create: `packages/domain/src/research-intelligence/document-source-map.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/research-intelligence/document-source-map.test.ts`

**Interfaces:**

- Produces: `DocumentParserMetadata`, `DocumentTransformation`, `DocumentBlock`, `DocumentPage`, `DocumentSourceMap`, `parseDocumentSourceMap`, `serializeDocumentSourceMap`, `deserializeDocumentSourceMap`.
- Consumes: the existing SHA-256 and strict-object conventions in `research-intelligence/validation.ts` and the generic `ExtractionResult<TSourceMap>` parser.

- [ ] **Step 1: Write the failing source-map round-trip test**

Create a literal one-page map with decimal page dimensions, two blocks, per-block parser metadata, confidence and transformation history. Assert `deserializeDocumentSourceMap(serializeDocumentSourceMap(map))` equals the literal exactly, including decimal bounding-box values.

```ts
const map = {
  artifactId: 'artifact-1',
  contentHash: 'a'.repeat(64),
  parser: { name: 'deterministic-pdf', version: '1.0.0' },
  pages: [{
    page: 1,
    width: 612.25,
    height: 792.5,
    blocks: [{
      id: 'block-1',
      kind: 'paragraph',
      text: 'Measured pulse width is 42 fs.',
      boundingBox: { x: 72.125, y: 600.25, width: 310.5, height: 18.75 },
      confidence: 0.975,
      parser: { name: 'deterministic-pdf', version: '1.0.0' },
      transformations: [{ stage: 'extract_text', processor: { name: 'deterministic-pdf', version: '1.0.0' } }],
    }],
  }],
};
expect(deserializeDocumentSourceMap(serializeDocumentSourceMap(map))).toEqual(map);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- document-source-map.test.ts`

Expected: FAIL because `document-source-map.ts` and its exports do not exist.

- [ ] **Step 3: Add strict vocabulary and parsing**

Implement readonly constants for block kinds and transformation stages `extract_text`, `detect_layout`, `classify`, `ocr`, `normalize`, `merge`. Parse every nested object with an allowlist, validate IDs/non-empty bounded strings, enforce unique page numbers and globally unique block IDs, require text for text-bearing block kinds, and bound boxes within their page.

- [ ] **Step 4: Add malformed-contract tests**

Add table-driven cases for: unknown provider fields, duplicate page number, duplicate block ID, non-finite dimensions, out-of-page bounding boxes, confidence below zero/above one, invalid content hash, missing paragraph text and unsupported block/transformation kinds.

- [ ] **Step 5: Verify GREEN and commit the domain contract**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- document-source-map.test.ts`

Expected: all focused tests pass.

Commit: `feat: add document source map contract`

---

### Task 2: Add deterministic SourceLocator construction and resolution

**Files:**

- Modify: `packages/domain/src/research-intelligence/types.ts`
- Modify: `packages/domain/src/research-intelligence/validation.ts`
- Create: `packages/domain/src/research-intelligence/source-locator.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/research-intelligence/source-locator.test.ts`
- Test: `packages/domain/test/research-intelligence/validation.test.ts`

**Interfaces:**

- Produces: optional `SourceLocator.blockId`, `createBlockSourceLocator`, `createTableCellSourceLocator`, `createCodeSourceLocator`, `resolveSourceLocator`, `serializeSourceLocator`, `deserializeSourceLocator`.
- Consumes: validated `DocumentSourceMap`, `DocumentBlock`, existing `SourceLocator`, `validateSourceLocator`.

- [ ] **Step 1: Write failing literal locator tests**

Use a hand-written source map and assert exact results for:

```ts
expect(createBlockSourceLocator(map, 'paragraph-1', { charRange: { start: 0, end: 8 } })).toEqual({
  artifactId: 'artifact-1',
  contentHash: 'a'.repeat(64),
  blockId: 'paragraph-1',
  page: 1,
  boundingBox: { x: 10, y: 20, width: 200, height: 30 },
  charRange: { start: 0, end: 8 },
});
```

Add equivalent exact literals for a figure block, table block plus `{ sheet: 'Evidence', row: 2, column: 2 }`, and code `{ commit, path, startLine, endLine }`.

- [ ] **Step 2: Verify locator tests RED**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- source-locator.test.ts`

Expected: FAIL because the builders and `blockId` contract do not exist.

- [ ] **Step 3: Implement builders and unambiguous resolution**

Generated page locators copy artifact/hash/page/bbox/blockId from the validated map. Text `charRange` is block-relative and must not exceed block text. Figure/table builders reject the wrong block kind. `resolveSourceLocator` requires artifact/hash equality, finds the exact page and block ID, and verifies the locator bbox still matches the versioned map.

- [ ] **Step 4: Implement strict locator serialization and negative cases**

Round-trip all four literal locators through JSON and `validateSourceLocator`. Reject unknown fields, missing block ID on generated-map resolution, mismatched hash/artifact, missing block, out-of-range text offsets, wrong table/figure kind, changed bbox and invalid code lines.

- [ ] **Step 5: Verify GREEN and commit locator behavior**

Run: `npx pnpm@9.15.0 --filter @openscience/domain test -- source-locator.test.ts validation.test.ts`

Expected: all locator and existing validation tests pass.

Commit: `feat: add source locator round trips`

---

### Task 3: Add the agent-worker parser execution boundary

**Files:**

- Create: `apps/agent-worker/src/parsers/types.ts`
- Create: `apps/agent-worker/src/parsers/base-parser.ts`
- Create: `apps/agent-worker/src/parsers/contract-self-test.ts`
- Modify: `apps/agent-worker/package.json`
- Test: `apps/agent-worker/test/parser-contract.test.ts`

**Interfaces:**

- Produces: `ParserInput`, `DocumentParser`, `ParserContractError`, `runDocumentParser`, `runDocumentParserContractSelfTest`.
- Consumes: `ExtractionResult<DocumentSourceMap>`, `DocumentParserMetadata`, `parseDocumentSourceMap`, `parseExtractionResult`, locator builders and Node SHA-256.

- [ ] **Step 1: Write failing runner tests**

Use a small in-memory parser implementation and a literal Buffer whose hash is computed independently in test setup. Assert the runner returns a strict succeeded result, preserves decimal coordinates, and calls the parser only after validating the input hash and `supports()` result.

- [ ] **Step 2: Add contract-violation tests**

Assert `ParserContractError` for input hash mismatch, unsupported input, source-map artifact/hash mismatch, map-level parser metadata mismatch, unknown nested field, succeeded result with zero blocks, and malformed confidence/bbox. Assert a valid `needs_review` result with a page and no blocks remains allowed.

- [ ] **Step 3: Verify runner tests RED**

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-contract.test.ts`

Expected: FAIL because `parsers/types.ts` and `parsers/base-parser.ts` do not exist.

- [ ] **Step 4: Implement the minimal runtime boundary**

`runDocumentParser` computes SHA-256 from `input.content`, checks `supports`, executes the parser, serializes/parses `ExtractionResult` with `parseDocumentSourceMap`, enforces input/map/parser identity, and rejects empty succeeded maps. It does not catch contract errors and relabel them as provider failures.

- [ ] **Step 5: Add the operational self-test**

The self-test uses only fixed synthetic metadata/text, runs source-map and all locator round-trips, and prints only `DOCUMENT_PARSER_CONTRACT_OK` on success or `DOCUMENT_PARSER_CONTRACT_FAILED` on failure. Add package script `selftest:document-contract` invoking compiled `dist/parsers/contract-self-test.js`.

- [ ] **Step 6: Verify GREEN and commit the worker boundary**

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-contract.test.ts`

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker build && npx pnpm@9.15.0 --filter @openscience/agent-worker selftest:document-contract`

Expected: focused tests pass and the CLI prints `DOCUMENT_PARSER_CONTRACT_OK` without paths, content or secrets.

Commit: `feat: add document parser interface`

---

### Task 4: Close the current image-only PDF false-ready compatibility gap

**Files:**

- Modify: `apps/agent-worker/src/ingestion-parser.ts`
- Modify: `apps/agent-worker/test/ingestion-parser.test.ts`
- Modify: `apps/agent-worker/test/research-intelligence-corpus.test.ts`
- Modify: `apps/agent-worker/test/support/research-intelligence-corpus.ts`
- Modify: `test/research-intelligence/manifest.json`

**Interfaces:**

- Produces: existing `parseIngestionWithAdapters` now returns `needs_review / empty-parsed-text` for Unicode control/space and parser page-marker boilerplate with no letter or number evidence.
- Consumes: the existing self-authored `scan-pdf-image-only` fixture; no new parser or OCR dependency.

- [ ] **Step 1: Change only the corpus expectation and verify RED**

Set `scan-pdf-image-only.expectedCurrentStatus` and its tracked manifest row to `needs_review`; update the baseline assertion from `ready` to `needs_review`. Add a direct adapter case returning `\f\n-- 1 of 1 --\n` and expect `empty-parsed-text`.

- [ ] **Step 2: Run focused corpus tests and confirm the real defect**

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- ingestion-parser.test.ts research-intelligence-corpus.test.ts`

Expected: FAIL because the current parser labels page-marker/control-only output ready.

- [ ] **Step 3: Add the minimal meaningful-text gate**

Before returning ready, remove parser page markers matching `-- <page> of <count> --`, Unicode control and separator characters; require at least one remaining Unicode letter or number. Preserve the original extracted text when it is meaningful.

- [ ] **Step 4: Verify GREEN and mutation coverage**

Run the focused command again. Confirm the tests fail if the page-marker removal or Unicode letter/number requirement is removed, then restore the implementation and rerun GREEN.

- [ ] **Step 5: Commit the compatibility fix**

Commit: `fix: reject empty scanned document output`

---

### Task 5: Review, server acceptance, deployment and CURRENT closeout

**Files:**

- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `project_index.md`
- Modify: this plan (mark all steps complete)

**Interfaces:**

- Produces: Task 3 completion evidence, exact branch/HEAD/release/rollback tuple and Taskmaster Task 4/5 readiness.

- [ ] **Step 1: Run focused and whole-repository gates**

Run:

```text
npx pnpm@9.15.0 --filter @openscience/domain test
npx pnpm@9.15.0 --filter @openscience/agent-worker test
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 test
npx pnpm@9.15.0 build
git diff --check
```

Expected: zero failures. No local integration command may start Docker.

- [ ] **Step 2: Review architecture, security and contract boundaries**

Verify no provider SDK/import/key appears outside AI Gateway; binary bytes remain worker-local; source maps reject unknown fields; locators cannot resolve across artifact/hash/versioned maps; no DB/migration/UI/Hermes file changed; parser output and self-test are bounded and secret-free.

- [ ] **Step 3: Push the accepted implementation and wait for exact-SHA CI**

Push through explicit Git for Windows Bash. Require build, typecheck, lint, unit, product visual and Hermes release gates green for the exact candidate SHA before server mutation.

- [ ] **Step 4: Run ECS preflight and candidate runtime acceptance**

Through `infra/scripts/checkup.sh` and `infra/scripts/ssh-run.sh`, verify disk/memory/ingress/egress, materialize the immutable candidate, install/generate/build on ECS, run focused domain/worker tests, and execute compiled `selftest:document-contract`. Do not use local Docker and do not read `.env` values.

- [ ] **Step 5: Deploy the exact accepted commit on ECS**

Run a fresh backup, deploy the exact SHA with canonical `infra/scripts/deploy.sh` and `--skip-migrate` because Task 3 has no schema change, and preserve the previous immutable release as rollback. Verify current core `28/28`, search `1/1`, full server build, target container health, Parser isolation/image tag, compiled contract self-test inside the production agent-worker, loopback/public health, exact release marker and absent failure marker. Run no research-data seed or real research write.

- [ ] **Step 6: Close Taskmaster and synchronize CURRENT memory**

Mark Task 3 done only after server acceptance. Confirm Task 4 and Task 5 are the dependency-ready next tasks and Task 6 remains blocked on Task 5. Update CURRENT spec/progress/handoff/index/runbook and this plan without duplicating full logs.

- [ ] **Step 7: Run final documentation and credential gates**

Run:

```text
npx pnpm@9.15.0 audit:docs-sync
npx pnpm@9.15.0 docs:lint
git diff --check
```

Scan added lines for key/token/credential URL patterns without printing matches. Commit the closeout, push, wait for exact docs HEAD CI, and require a clean worktree.

## Plan self-review

- Spec §7.1 strict source map: Tasks 1 and 3.
- Spec §7.2 provenance/confidence and provider-neutral boundary: Tasks 1 and 3; actual cascade remains correctly deferred to Task 4.
- Taskmaster locator generation and round-trip: Task 2 plus ECS self-test in Tasks 3/5.
- Golden corpus and image-only false-ready: Task 4.
- Spec §14.2 parser contract and §14.3 100% locator round-trip: Tasks 1–5.
- No placeholder, provider installation, database migration, UI work or duplicated CURRENT design is included.

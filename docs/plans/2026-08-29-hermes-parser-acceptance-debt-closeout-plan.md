# Hermes Parser Acceptance Debt Closeout Implementation Plan

**Status: COMPLETED / ECS DEPLOYED（2026-08-29）.** Tasks 1–6 are complete.
Final production application/release is `6cabe422a8459dfa358786c9f5aae84558949f6b`;
rollback is `28a3d5ca681b7744fae521dfa9154100a24e8845`; no migration ran.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four actionable parser gaps and prove the exact production
profile `14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready`
without weakening corrupt/empty-document safety.

**Architecture:** Keep the provider-neutral `DocumentSourceMap` and existing
block kinds. Add one shared Worker MIME normalizer, bounded deterministic
Notebook/Python paths, strict table blocks with formal SourceLocator geometry,
and a schema-v3 acceptance report carrying stable review reason codes. No
database, API, UI, provider, external network or GPU change is included.

**Tech Stack:** TypeScript, Node.js 22, Vitest, pnpm 9.15.0, existing isolated
document-parser sidecar, Docker Compose on ECS only.

## Global Constraints

- Docker, image builds, candidate evaluation, deployment and final runtime
  acceptance run only on ECS; local execution is limited to code, unit,
  contract, build, typecheck and lint gates.
- Do not read, print or commit `.env` values; no provider call or paid OCR is
  permitted by this plan.
- Keep parser runtime `network=none`, no Secret, non-root, read-only, 512 MiB,
  64 PID and CPU-only.
- Preserve the execution-time production release. The completed final
  transaction promoted `6cabe422a8459dfa358786c9f5aae84558949f6b` and retained
  `28a3d5ca681b7744fae521dfa9154100a24e8845` as rollback; any failed gate had to
  leave production unchanged or transactionally restored.
- Do not add `DocumentBlockKind`; Python/Notebook use `paragraph`, structured
  cells use `table`.
- Do not silently accept unsupported Notebook output/attachment/cell types or
  XLSX formula/merge/unsupported cell structures.
- Every implementation change follows RED → observed expected failure → GREEN.

---

### Task 1: Shared parser media identity and bounded code formats

**Files:**

- Create: `apps/agent-worker/src/parser-media-type.ts`
- Modify: `apps/agent-worker/src/index.ts`
- Modify: `apps/agent-worker/src/parser-acceptance-runner.ts`
- Modify: `apps/agent-worker/src/parsers/text-extractor.ts`
- Test: `apps/agent-worker/test/parser-media-type.test.ts`
- Test: `apps/agent-worker/test/text-extractor.test.ts`

**Interfaces:**

- Produces:
  `canonicalParserMediaType(logicalPath: string, storedMimeType?: string | null): string`.
- Produces deterministic `DocumentParser` support for canonical
  `text/x-python` and `application/x-ipynb+json`.
- Consumes the existing `ParserInput`, virtual-page builder and source-map
  budgets; no package or provider dependency is added.

- [x] **Step 1: Write failing MIME contract tests**

```ts
expect(canonicalParserMediaType('analysis.py', 'text/plain')).toBe('text/x-python');
expect(canonicalParserMediaType('analysis.ipynb', 'application/json'))
  .toBe('application/x-ipynb+json');
expect(canonicalParserMediaType('analysis.py', 'image/png'))
  .toBe('application/octet-stream');
```

- [x] **Step 2: Run the focused test and observe RED**

Run:
`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-media-type.test.ts`

Expected: FAIL because the shared canonicalizer does not exist.

- [x] **Step 3: Add failing Python and Notebook parser tests**

```ts
expect(await run('text/x-python', '# note\npulse_width_fs = 42\n'))
  .toMatchObject({ status: 'succeeded' });
expect(await run('application/x-ipynb+json', validNotebook))
  .toMatchObject({ status: 'succeeded' });
expect(await run('application/x-ipynb+json', notebookWithOutput))
  .toMatchObject({ status: 'needs_review' });
expect(await run('application/x-ipynb+json', oversizedNotebook))
  .toMatchObject({ status: 'blocked', code: 'limit_exceeded' });
```

Also cover invalid UTF-8 Python, malformed/deep/over-cell/over-source Notebook,
unknown cell type, non-empty attachment and an output payload that must never
appear in source-map text.

- [x] **Step 4: Run focused parser tests and observe the intended RED**

Run:
`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- text-extractor.test.ts`

Expected: valid `.py`/`.ipynb` are unsupported and the negative contracts do
not yet have the required stable status.

- [x] **Step 5: Implement the minimal shared canonicalizer and bounded parsers**

The canonicalizer must compare the lower-cased basename extension with an
explicit allowed stored-MIME set. Conflicts return `application/octet-stream`.
Notebook parsing checks a format-specific byte cap before `JSON.parse`, accepts
only a plain object with bounded `cells`, accepts only
`markdown | code | raw`, accepts string or string-array `source`, rejects
non-empty outputs/attachments, and applies existing per-block/total budgets.
Python uses fatal UTF-8 decode and preserves one-based source line geometry.

- [x] **Step 6: Run the focused GREEN tests**

Run:
`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-media-type.test.ts text-extractor.test.ts`

Expected: PASS with zero external parser/provider invocation for both formats.

- [x] **Step 7: Commit Task 1**

```bash
git add apps/agent-worker/src/parser-media-type.ts \
  apps/agent-worker/src/index.ts \
  apps/agent-worker/src/parser-acceptance-runner.ts \
  apps/agent-worker/src/parsers/text-extractor.ts \
  apps/agent-worker/test/parser-media-type.test.ts \
  apps/agent-worker/test/text-extractor.test.ts
git commit -m "feat(agent-worker): parse bounded notebooks and python"
```

### Task 2: Strict structured-table and formal locator contract

**Files:**

- Modify: `apps/agent-worker/src/ingestion-parser.ts`
- Modify: `apps/agent-worker/src/parsers/text-extractor.ts`
- Modify: `packages/domain/src/research-intelligence/source-locator.ts`
- Test: `apps/agent-worker/test/ingestion-parser.test.ts`
- Test: `apps/agent-worker/test/text-extractor.test.ts`
- Test: `packages/domain/test/research-intelligence/source-locator.test.ts`

**Interfaces:**

- Structured CSV/XLSX cell blocks use existing kind `table`.
- `createTableCellSourceLocator` and `resolveSourceLocator` validate virtual
  row/column and optional XLSX sheet heading against block geometry.
- Physical table blocks retain the existing block/bbox behavior.

- [x] **Step 1: Write failing table-kind and locator geometry tests**

```ts
expect(csv.pages[0]!.blocks.find((block) => block.text === '42')?.kind)
  .toBe('table');
const locator = createTableCellSourceLocator(xlsx, valueBlock.id, {
  sheet: 'Evidence', row: 2, column: 2,
});
expect(resolveSourceLocator(xlsx, locator).id).toBe(valueBlock.id);
expect(() => resolveSourceLocator(xlsx, {
  ...locator, tableCell: { sheet: 'Evidence', row: 2, column: 1 },
})).toThrow(/tableCell/);
```

- [x] **Step 2: Observe RED in Domain and Worker tests**

Run:
`npx pnpm@9.15.0 --filter @openscience/domain test -- source-locator.test.ts`

Run:
`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- ingestion-parser.test.ts text-extractor.test.ts`

Expected: cells are `paragraph` and forged row/column locators still resolve.

- [x] **Step 3: Add failing unsupported-XLSX subset tests**

Add self-authored in-memory fixtures containing a formula, merged cell,
unsupported/error cell type, invalid relationship, malformed reference and
ZIP/XML limit case. Each must remain `needs_review` or `blocked`; no fixture may
return `succeeded` from a cached formula value.

- [x] **Step 4: Implement strict table blocks and virtual locator validation**

Mark data cells `table`, keep worksheet name as `heading`, reject formula and
merge constructs before cell materialization, reject unsupported cell types and
warnings, and derive virtual one-based row/column from bbox. For a locator with
`sheet`, require the same page's row-zero heading text and subtract that virtual
header line before comparing the data row.

- [x] **Step 5: Run the focused GREEN tests**

Run the two commands from Step 2. Expected: valid CSV/XLSX succeed; every
unsupported subset remains fail-closed; forged table coordinates fail.

- [x] **Step 6: Commit Task 2**

```bash
git add apps/agent-worker/src/ingestion-parser.ts \
  apps/agent-worker/src/parsers/text-extractor.ts \
  packages/domain/src/research-intelligence/source-locator.ts \
  apps/agent-worker/test/ingestion-parser.test.ts \
  apps/agent-worker/test/text-extractor.test.ts \
  packages/domain/test/research-intelligence/source-locator.test.ts
git commit -m "feat(parser): validate structured table locators"
```

### Task 3: Schema-v3 acceptance evidence and canonical 14/2 profile

**Files:**

- Modify: `apps/agent-worker/src/parser-acceptance-contract.ts`
- Modify: `apps/agent-worker/src/parser-acceptance-runner.ts`
- Modify: `apps/agent-worker/test/support/research-intelligence-corpus.ts`
- Modify: `test/research-intelligence/manifest.json`
- Modify: `infra/scripts/accept-document-parser-release.sh`
- Modify: `infra/scripts/verify-document-parser-acceptance.mjs`
- Test: `apps/agent-worker/test/parser-acceptance-contract.test.ts`
- Test: `apps/agent-worker/test/parser-acceptance-runner.test.ts`
- Test: `apps/agent-worker/test/parser-compiled-composition.test.mjs`
- Test: `infra/scripts/accept-document-parser-release.test.mjs`
- Test: `infra/scripts/verify-document-parser-acceptance.test.mjs`

**Interfaces:**

- Acceptance report schema becomes `3` with profile
  `hermes-parser-14-2-v1`.
- Every case contains bounded `reviewReasons: string[]`; succeeded cases require
  `[]`, and the two intentional reviews require exactly
  `unreadable-or-corrupt-document` / `no-meaningful-content`.
- Summary is exactly `14/2/0/0`; fake structured calls are exactly `14`;
  external/forbidden provider calls remain zero.

- [x] **Step 1: Change contract tests first and observe RED**

Update the four actionable cases to succeeded with full locator matches. Require
schema 3, profile identity, reason arrays, 14 structured fake calls and rejection
of every old schema-v2 report.

Run:
`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-acceptance-contract.test.ts parser-acceptance-runner.test.ts`

Expected: FAIL on old 10/6 expectations and missing v3 evidence.

- [x] **Step 2: Update corpus status and regenerate only its manifest identity**

Set Notebook, Python, CSV and XLSX `expectedCurrentStatus` to `ready`; leave
corpus bytes and content hashes unchanged. Recompute the tracked manifest
SHA-256 and bind it in the contract. Do not hand-edit fixture content hashes.

- [x] **Step 3: Implement v3 report production and verification**

Capture canonical cascade reason codes without raw exception/provider text,
perform formal table SourceLocator construction/resolution for structured
locators, and update shell/Node deploy verifiers to require the exact new
profile. Atomic report publication, ownership, cgroup/resource evidence and
cleanup semantics remain unchanged.

- [x] **Step 4: Run all focused contract gates GREEN**

Run:

```bash
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- \
  parser-acceptance-contract.test.ts parser-acceptance-runner.test.ts
node --test infra/scripts/accept-document-parser-release.test.mjs \
  infra/scripts/verify-document-parser-acceptance.test.mjs
```

Expected: PASS; deliberate mutations of status, reason, profile, locator,
gateway count, image identity, resources and old schema are all rejected.

- [x] **Step 5: Commit Task 3**

```bash
git add apps/agent-worker/src/parser-acceptance-contract.ts \
  apps/agent-worker/src/parser-acceptance-runner.ts \
  apps/agent-worker/test/parser-acceptance-contract.test.ts \
  apps/agent-worker/test/parser-acceptance-runner.test.ts \
  apps/agent-worker/test/parser-compiled-composition.test.mjs \
  apps/agent-worker/test/support/research-intelligence-corpus.ts \
  test/research-intelligence/manifest.json \
  infra/scripts/accept-document-parser-release.sh \
  infra/scripts/verify-document-parser-acceptance.mjs \
  infra/scripts/accept-document-parser-release.test.mjs \
  infra/scripts/verify-document-parser-acceptance.test.mjs
git commit -m "test(parser): require production 14-2 acceptance"
```

### Task 4: Local gates and independent review

**Files:**

- Modify only files required by concrete review findings.

**Interfaces:**

- Produces a clean exact candidate SHA; does not build Docker locally.

- [x] **Step 1: Run quiet focused and package suites**

```bash
npx pnpm@9.15.0 --filter @openscience/domain test
npx pnpm@9.15.0 --filter @openscience/agent-worker test
npx pnpm@9.15.0 --filter @openscience/agent-worker build
```

- [x] **Step 2: Run workspace and release gates**

```bash
npx pnpm@9.15.0 build
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 test:release-contract
npx pnpm@9.15.0 audit:knip
npx pnpm@9.15.0 audit:dep
git diff --check
```

- [x] **Step 3: Obtain independent architecture and security review**

Require zero Critical/Important findings for MIME trust, parser budgets,
Notebook execution/output, XLSX ZIP/XML/formula handling, SourceLocator
integrity, acceptance-v3 fail-closed behavior and release rollback.

- [x] **Step 4: Fix findings with new RED/GREEN cycles and commit**

Every behavior fix begins with a reproducing failing test. Re-run Steps 1–2 and
record only fresh evidence.

### Task 5: Exact-SHA ECS acceptance and immutable deployment

**Files:**

- Modify only deployment/docs files required by verified server facts.

**Interfaces:**

- Consumes the clean reviewed candidate SHA.
- Produces one immutable active release whose rollback is the execution-time
  pre-deploy active release. Final result: active `6cabe422…`, rollback
  `28a3d5c…`, no migration.

- [x] **Step 1: Push the exact candidate and require exact-SHA CI success**

- [x] **Step 2: Refresh ECS facts using explicit Git for Windows Bash**

Run canonical `infra/scripts/checkup.sh`, verify `.release-id`, public and
loopback `/__release`, absence of failure/journal markers, exact current
rollback, free disk/RAM and seven valid backups. Never use bare Bash/WSL.

- [x] **Step 3: Build and accept only on ECS**

Materialize the exact SHA, run full workspace build, build exact Worker/Parser
images and execute the canonical parser acceptance. Require:

```text
schemaVersion=3
acceptanceProfile=hermes-parser-14-2-v1
succeeded=14
needsReview=2
failed=0
falseReadyCount=0
structuredFake=14
externalProvider=0
```

Require 100% locator reproduction, formal table locator round-trip, stable
intentional reason codes, bounded CPU/RSS/PID/output and exact image IDs.

- [x] **Step 4: Deploy through the canonical immutable transaction**

Run the existing confirmed transaction with parser-acceptance required and the
execution-time current active SHA as rollback. Do not run a migration; this plan
has no schema change.

- [x] **Step 5: Verify production runtime**

Require core/search migration `29/29` and `2/2`, healthy API/Web/Worker/Parser/
Embedding/PostgreSQL/Redis/SeaweedFS/ClamAV, parser startup self-test, BGE
runtime, exact running image IDs, public/local 200, auth/admin 401, exact release
markers and absent failure/journal state.

Final evidence: exact CI `33240457443` / job `99068791412` succeeded in 11m10s;
Worker `sha256:11f36807…951a02`, Parser `sha256:4e4819ec…c70d8`; schema 3
`hermes-parser-14-2-v1` 14/2/0/0, gateway 14/0/0, 26 locators including three
`table-cell`, runtime/core/search/BGE/backups/markers all green. Final source
review: `READY`, 0 Critical / 0 Important / 0 Minor.

### Task 6: Taskmaster, capability registry, hygiene evidence and CURRENT closeout

**Files:**

- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/runbooks/hermes-capability-registry.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `project_index.md`
- Modify: this plan

**Interfaces:**

- Produces one CURRENT version tuple, one capability-table truth and one exact
  disk inventory; does not delete any server object without explicit approval.

- [x] **Step 1: Record production evidence and close Taskmaster Task 4**

Set Task 4 and its closeout subtask done only after production 14/2 acceptance;
restore completed count to 6/12. Keep Tasks 7 and 10 next-ready.

- [x] **Step 2: Record the read-only disk audit and exact cleanup candidates**

Document physical, non-duplicated sizes and classification for evals, releases,
pnpm store, Docker cache/images, dev stack, production volumes and monitoring.
Do not add logical hardlink/shared-layer sizes together.

- [x] **Step 3: Run documentation and final integrity gates**

```bash
npx pnpm@9.15.0 audit:docs-sync
npx pnpm@9.15.0 docs:lint
git diff --check
```

- [x] **Step 4: Commit, push and require exact docs-HEAD CI**

## Plan self-review

- Spec coverage: §7.2.1 maps to Tasks 1–5; reason evidence and report semantics
  map to Task 3; ECS-only deployment and rollback map to Task 5; capability and
  memory discipline map to Task 6.
- Scope: no database/API/UI/provider installation, external network, MiniMax
  paid call, GPU or broad filesystem cleanup is included.
- Type consistency: MIME canonicalization, existing block kinds, formal
  SourceLocator and report schema/profile names are identical across tasks.
- No placeholder implementation step remains; unsupported real-world Notebook/
  XLSX features are explicit fail-closed boundaries rather than silent debt.

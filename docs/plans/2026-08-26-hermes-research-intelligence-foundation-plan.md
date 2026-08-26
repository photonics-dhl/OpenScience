# Hermes Research Intelligence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution status (2026-08-26): COMPLETED.** Taskmaster Task 1 is `done`; the initial six-case seed was expanded to the explicit 13-case native/scanned/dual-column/table/formula/references/DOCX/TeX/Markdown/CSV/XLSX/notebook/code matrix with expected locators. Full acceptance evidence is recorded in the capability registry and progress window; Task 2 is the next ready task.

**Goal:** Establish the measurable, non-polluting foundation that every later Hermes parser, OCR, retrieval and presentation capability must beat before it can be retained or deployed.

**Architecture:** Preserve the existing monorepo, parser sidecar, AI Gateway and production release. Add a deterministic self-authored corpus contract, a current-parser baseline runner and a machine gate over the human-readable capability registry; generated evidence remains ignored, while fixture recipes, hashes and acceptance rules are tracked.

**Tech Stack:** Node.js 22, TypeScript, Vitest 2, Node test runner, pnpm 9.15.0, existing `@openscience/agent-worker` parser adapters, Markdown capability registry.

## Global Constraints

- Work only in `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance` on `codex/hermes-wanko-live2d`.
- Preserve production application/release `29344767b350e0a44ef74c04b9b5a55b342ef011` and rollback `58614c07951374537ed146f164f8568e9957a9b5`.
- Do not install Docling, LiteParse, GROBID, PaddleOCR, BGE-M3, ScanSci or any new runtime in this plan.
- Do not read or print `.env`; check only declared variable names and boolean injection state.
- Do not use user-provided documents as committed fixtures. Fixtures are self-authored, deterministic and free of personal data.
- Keep generated corpus artifacts and benchmark output outside tracked source; never place models or caches in the repository, user HOME or `/usr/local`.
- The server is pure CPU. No local GPU generation stack is permitted.
- No product code deployment or server write occurs in this plan.

---

## File map

| File | Responsibility |
|---|---|
| `scripts/research-intelligence/verify-capability-registry.mjs` | Parse and validate the CURRENT Markdown capability table without duplicating it into another source of truth |
| `scripts/research-intelligence/verify-capability-registry.test.mjs` | Lock required columns, statuses, capability rows and secret-prefix rejection |
| `apps/agent-worker/src/parser-self-test.ts` | Expose copies of the existing deterministic PDF/DOCX fixtures without changing production self-test behavior |
| `apps/agent-worker/test/support/research-intelligence-corpus.ts` | Define self-authored corpus cases, expected current behavior and content hashes |
| `apps/agent-worker/test/research-intelligence-corpus.test.ts` | Verify manifest determinism, parser outcomes and baseline evidence schema |
| `test/research-intelligence/manifest.json` | Tracked content hashes, rights, language, feature and expected current-status contract |
| `test/research-intelligence/out/` | Ignored generated baseline reports; never committed |
| `.gitignore` | Exclude generated research-intelligence output and project Python/model caches |
| `package.json` | Add quiet `audit:hermes-capabilities` and `test:research-intelligence` commands |
| `docs/runbooks/hermes-capability-registry.md` | Record the measured baseline and later capability decisions |

### Task 1: Machine-gate the capability registry

**Files:**

- Create: `scripts/research-intelligence/verify-capability-registry.mjs`
- Create: `scripts/research-intelligence/verify-capability-registry.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `docs/runbooks/hermes-capability-registry.md` Markdown table.
- Produces: `verifyCapabilityRegistry(markdown): { rows: number; capabilities: string[] }` and CLI marker `HERMES_CAPABILITY_REGISTRY_OK rows=<n>`.

- [x] **Step 1: Write the failing registry test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifyCapabilityRegistry } from './verify-capability-registry.mjs';

test('CURRENT registry has complete rows and no credential-shaped values', async () => {
  const markdown = await readFile('docs/runbooks/hermes-capability-registry.md', 'utf8');
  const result = verifyCapabilityRegistry(markdown);
  assert.ok(result.rows >= 20);
  assert.ok(result.capabilities.includes('BGE-M3'));
  assert.ok(result.capabilities.includes('ScanSci PDF'));
  assert.ok(result.capabilities.includes('Semantic Scholar MCP/API'));
});
```

- [x] **Step 2: Run the test and observe the missing module failure**

Run:

```powershell
node --test scripts/research-intelligence/verify-capability-registry.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `verify-capability-registry.mjs`.

- [x] **Step 3: Implement the registry verifier**

```js
const allowedStatuses = new Set([
  'PRODUCTION',
  'AVAILABLE_LOCAL',
  'APPROVED_PILOT',
  'BLOCKED',
  'PATTERN_ONLY',
  'REJECTED',
]);

export function verifyCapabilityRegistry(markdown) {
  if (/s2k-|sk-cp-/i.test(markdown)) throw new Error('CREDENTIAL_SHAPED_VALUE');
  const rows = markdown.split(/\r?\n/)
    .filter((line) => /^\|[^-]/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length === 6 && cells[0] !== 'Capability');
  for (const cells of rows) {
    if (cells.some((cell) => cell.length === 0)) throw new Error(`INCOMPLETE_ROW:${cells[0]}`);
    const statuses = [...cells[2].matchAll(/`([A-Z_]+)(?:\s*\/\s*)?/g)].map((match) => match[1]);
    if (statuses.length === 0 || statuses.some((status) => !allowedStatuses.has(status))) {
      throw new Error(`BAD_STATUS:${cells[0]}`);
    }
  }
  return { rows: rows.length, capabilities: rows.map((cells) => cells[0].replaceAll('`', '')) };
}
```

The CLI branch reads only the tracked registry, calls the function, prints the success marker and exits non-zero on the first validation error.

- [x] **Step 4: Add and run the root audit command**

Add to `package.json`:

```json
"audit:hermes-capabilities": "node --test scripts/research-intelligence/verify-capability-registry.test.mjs && node scripts/research-intelligence/verify-capability-registry.mjs"
```

Run:

```powershell
npx pnpm@9.15.0 audit:hermes-capabilities
```

Expected: Node test PASS followed by `HERMES_CAPABILITY_REGISTRY_OK`.

- [x] **Step 5: Commit the registry gate**

```powershell
git add package.json scripts/research-intelligence/verify-capability-registry.mjs scripts/research-intelligence/verify-capability-registry.test.mjs
git commit -m "test: gate Hermes capability registry"
```

### Task 2: Define deterministic corpus fixtures and hashes

**Files:**

- Modify: `apps/agent-worker/src/parser-self-test.ts`
- Create: `apps/agent-worker/test/support/research-intelligence-corpus.ts`
- Create: `apps/agent-worker/test/research-intelligence-corpus.test.ts`
- Create: `test/research-intelligence/manifest.json`

**Interfaces:**

- Consumes: existing deterministic PDF/DOCX buffers and `parseIngestionWithAdapters`.
- Produces: `createParserSelfTestFixtures()` and `RESEARCH_INTELLIGENCE_CORPUS: ResearchCorpusCase[]`.

- [x] **Step 1: Write the failing fixture-export test**

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createParserSelfTestFixtures } from '../src/parser-self-test';

describe('research-intelligence fixture contract', () => {
  it('returns fresh deterministic copies', () => {
    const first = createParserSelfTestFixtures();
    const second = createParserSelfTestFixtures();
    expect(first.pdf).not.toBe(second.pdf);
    expect(createHash('sha256').update(first.pdf).digest('hex'))
      .toBe(createHash('sha256').update(second.pdf).digest('hex'));
  });
});
```

- [x] **Step 2: Run the focused test and observe the missing export**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- research-intelligence-corpus.test.ts
```

Expected: FAIL because `createParserSelfTestFixtures` is not exported.

- [x] **Step 3: Export defensive fixture copies without changing the self-test**

Add to `parser-self-test.ts`:

```ts
export function createParserSelfTestFixtures(): { pdf: Buffer; docx: Buffer } {
  return { pdf: Buffer.from(PDF_FIXTURE), docx: Buffer.from(DOCX_FIXTURE) };
}
```

Change `runParserSelfTest()` to consume the returned copies. Its public result and `PARSER_SELF_TEST_OK` marker remain byte-for-byte compatible.

- [x] **Step 4: Define the corpus contract**

```ts
export interface ResearchCorpusCase {
  id: string;
  filename: string;
  content: Buffer;
  language: 'en' | 'zh' | 'mixed';
  features: Array<'native_text' | 'scan' | 'docx' | 'markdown' | 'tex' | 'table' | 'formula'>;
  rights: 'self-authored';
  expectedCurrentStatus: 'ready' | 'needs_review';
  expectedText?: string;
}
```

The tracked matrix contains 13 self-authored cases: existing native PDF and DOCX, Markdown/table, TeX/formula, references, deterministic dual-column PDF, image-only scanned PDF, minimal scan-shaped PNG, CSV, valid minimal XLSX, notebook, code and a corrupt PDF. Every case receives a SHA-256 content hash and one or more expected locators in `manifest.json`; the manifest contains no external URL or user file. The current parser's image-only PDF page-marker false-ready remains explicit baseline evidence rather than being hidden by the harness.

- [x] **Step 5: Generate and review the tracked manifest**

The corpus test supports `WRITE_RESEARCH_INTELLIGENCE_MANIFEST=1` only for explicit regeneration and writes stable JSON sorted by `id`.

Run:

```powershell
$env:WRITE_RESEARCH_INTELLIGENCE_MANIFEST='1'
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- research-intelligence-corpus.test.ts
Remove-Item Env:WRITE_RESEARCH_INTELLIGENCE_MANIFEST
git diff -- test/research-intelligence/manifest.json
```

Expected: 13 self-authored cases, unique 64-character lowercase hashes, declared language/features/rights/locators and current expected status.

- [x] **Step 6: Commit the corpus contract**

```powershell
git add apps/agent-worker/src/parser-self-test.ts apps/agent-worker/test/support/research-intelligence-corpus.ts apps/agent-worker/test/research-intelligence-corpus.test.ts test/research-intelligence/manifest.json
git commit -m "test: establish Hermes research corpus"
```

### Task 3: Measure the current parser baseline without pretending it is the target

**Files:**

- Modify: `apps/agent-worker/test/research-intelligence-corpus.test.ts`
- Modify: `apps/agent-worker/package.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `RESEARCH_INTELLIGENCE_CORPUS` and current ingestion adapters.
- Produces: ignored `test/research-intelligence/out/current-parser.json` with status, reason, text match, elapsed time and RSS delta per case.

- [x] **Step 1: Write the failing baseline schema test**

```ts
expect(report).toMatchObject({
  schemaVersion: 1,
  runtime: 'current-agent-worker',
  cases: expect.arrayContaining([
    expect.objectContaining({ id: 'native-pdf-en', status: 'ready', contentHash: expect.any(String) }),
    expect.objectContaining({ id: 'scan-zh', status: 'needs_review' }),
  ]),
});
```

- [x] **Step 2: Run the focused test and observe the missing report failure**

Run the focused worker command from Task 2. Expected: FAIL because the report builder does not exist.

- [x] **Step 3: Implement a bounded baseline report**

For each case, capture `performance.now()` before/after parsing and `process.memoryUsage().rss` before/after. Store only:

```ts
{
  id,
  contentHash,
  status: result.status,
  reason: result.status === 'needs_review' ? result.reason : undefined,
  textMatched: expectedText ? result.status === 'ready' && result.text.includes(expectedText) : undefined,
  elapsedMs: Math.round(elapsedMs * 100) / 100,
  rssDeltaBytes,
}
```

Do not store source text, binary content, environment variables or absolute paths.

- [x] **Step 4: Add output isolation and scripts**

Add to `.gitignore`:

```gitignore
# Generated Hermes research-intelligence benchmarks and local model environments
test/research-intelligence/out/
.venv/
.cache/huggingface/
models/
```

Add `test:research-intelligence` to `apps/agent-worker/package.json`, and add this root command:

```json
"test:research-intelligence": "pnpm --filter @openscience/agent-worker test -- research-intelligence-corpus.test.ts"
```

- [x] **Step 5: Run twice and prove deterministic facts are stable**

```powershell
npx pnpm@9.15.0 test:research-intelligence
Copy-Item test/research-intelligence/out/current-parser.json test/research-intelligence/out/first.json
npx pnpm@9.15.0 test:research-intelligence
```

Expected: IDs, hashes, statuses, reasons and text matches are identical. Timing and RSS may differ and are compared as measurements, not snapshot assertions.

- [x] **Step 6: Commit the baseline runner**

```powershell
git add .gitignore package.json apps/agent-worker/package.json apps/agent-worker/test/research-intelligence-corpus.test.ts
git commit -m "test: measure current Hermes parser baseline"
```

### Task 4: Record the baseline and prevent premature capability retention

**Files:**

- Modify: `docs/runbooks/hermes-capability-registry.md`
- Modify: `project_index.md`
- Modify: `docs/progress.md`

**Interfaces:**

- Consumes: current-parser report and registry gate.
- Produces: one dated registry change record and explicit `BASELINE_ONLY` language for candidates not yet evaluated.

- [x] **Step 1: Run the complete foundation gate**

```powershell
npx pnpm@9.15.0 audit:hermes-capabilities
npx pnpm@9.15.0 test:research-intelligence
npx pnpm@9.15.0 --filter @openscience/agent-worker test
npx pnpm@9.15.0 typecheck
```

Expected: all commands exit 0. The current baseline may contain `needs_review`; that is an honest baseline, not a test failure.

- [x] **Step 2: Update the capability record from measurements**

Add a dated change-record row that includes current parser case counts, successful deterministic text cases, explicit review cases, P50/P95 timing and peak RSS from the ignored report. Do not copy raw source text or absolute paths.

- [x] **Step 3: Lock candidate status**

Docling, LiteParse, GROBID, PaddleOCR and BGE-M3 remain `APPROVED_PILOT`; none becomes `PRODUCTION` or `retained` during this plan. MiniMax OCR remains blocked until exposed credentials are rotated and a minimal-page contract test exists.

- [x] **Step 4: Synchronize CURRENT docs**

Update `docs/progress.md` with Taskmaster Task 1 evidence and update the existing `.taskmaster/` and capability-registry rows in `project_index.md`. Keep progress ≤120 lines and ≤16 KiB.

- [x] **Step 5: Commit the measured foundation**

```powershell
git add docs/runbooks/hermes-capability-registry.md docs/progress.md project_index.md
git commit -m "docs: record Hermes capability baseline"
```

### Task 5: Run the full repository gate and close Taskmaster Task 1

**Files:**

- Modify: `.taskmaster/tasks/tasks.json` through Taskmaster MCP only
- Modify: `docs/progress.md`
- Modify: `project_index.md`

**Interfaces:**

- Consumes: all Task 1–4 commits and fresh verification output.
- Produces: Taskmaster `hermes-research-intelligence` Task 1 `done`; Task 2 becomes the only next ready task.

- [x] **Step 1: Run the complete local acceptance gate**

```powershell
npx pnpm@9.15.0 test
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 build
npx pnpm@9.15.0 audit:hermes-capabilities
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Expected: every command exits 0; `DOCS_SYNC_OK`; Markdown reports 0 issues.

- [x] **Step 2: Review the diff against the design boundaries**

Confirm: no runtime dependency installed, no server files changed, no model/cache committed, no `.env` value read or printed, no product behavior changed, and application/release/rollback remain unchanged.

- [x] **Step 3: Set Taskmaster status only after evidence exists**

Use Taskmaster tag `hermes-research-intelligence` and set Task 1 to `done`. Query `next_task`; expected next task is Task 2, `Prisma Schema and Core Domain Models`.

- [x] **Step 4: Commit the final task-status synchronization**

```powershell
git add .taskmaster/tasks/tasks.json docs/progress.md project_index.md
git commit -m "docs: complete Hermes intelligence foundation"
```

## Self-review

- Spec coverage: this plan covers CURRENT design §§10, 12, 14 and the Foundation acceptance phase; it intentionally does not implement schema, parser candidates, OCR providers, search, UI or production deployment.
- Placeholder scan: every code step, command, expected result and error boundary is explicit.
- Type consistency: `ResearchCorpusCase`, `createParserSelfTestFixtures`, report schema version `1` and registry verifier names are identical across producing and consuming tasks.
- Safety: generated output is ignored; fixtures are self-authored; credentials, user documents, model weights and server writes are excluded.

## Following plans after this gate

The remaining Taskmaster work is implemented through three later plans, each written only after its predecessor has measured evidence:

1. `hermes-document-intelligence-search`: Tasks 2–6, covering expand-contract schema, `DocumentSourceMap`, AI Gateway OCR, Docling/LiteParse bake-off, GROBID/PaddleOCR and CPU BGE-M3 hybrid search.
2. `hermes-interest-retrieval`: Tasks 7, 8 and 10, covering registration identity, silent interest routing, Claim/Evidence APIs, ScanSci/Semantic Scholar/Tavily, rights decisions, 72-hour cache and 10-minute signed links.
3. `hermes-ro-presentation-release`: Tasks 9, 11 and 12, covering Claim-first public RO, default-expanded Evidence, deterministic HTML/charts, admin MiniMax media and full ECS acceptance.

No later plan may promote a candidate solely because it installed successfully; it must beat the Task 1 baseline on the registry evaluation matrix and retain a tested kill switch and rollback.

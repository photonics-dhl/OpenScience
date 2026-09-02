# ScanSci Upstream MCP Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the private ScanSci integration with upstream `v1.13.1`'s official 17-tool MCP, prove real ECS downloads, preserve the product lifecycle, and delete the obsolete implementation.

**Architecture:** A release-scoped `scansci-mcp` container owns the upstream package, browser runtime, persistent data, and transient paper output. Agent Worker calls its streamable-HTTP MCP endpoint and has write access only to the shared paper volume so it can read, ingest, and immediately delete the acknowledged staging PDF. The existing public asynchronous product API remains unchanged.

**Tech Stack:** ScanSci PDF `v1.13.1`, Python 3.12, MCP streamable HTTP, Patchright/Chromium/Xvfb, Node 22, `@modelcontextprotocol/sdk`, TypeScript, PostgreSQL 16, Docker Compose, SeaweedFS, immutable ECS release scripts.

## Global Constraints

- Production acceptance runs on the Alibaba Cloud CPU ECS; local Docker is forbidden.
- Upstream source archive SHA-256 is `c5bdec13d5803992968eba9cce72d9e77e6f40e1a77a8277f7986f2f63b2507e`.
- Do not import or patch private `scansci_pdf` Python symbols.
- Do not force `legal_only` or disable upstream Sci-Hub, LibGen, or Tor tools.
- No user-visible source mode switch; default acquisition omits source-strategy overrides.
- Never print `.env`, credentials, cookies, MCP raw payloads, or production document contents.
- PDF bytes remain in object storage after ingestion, not PostgreSQL; ScanSci outputs are transient and individually acknowledged.
- Preserve production `405b85a…` and rollback `09093e7…` until the new merged release is accepted.
- Do not delete rejected artifacts until the replacement production journey passes; then delete exact files/resources under the user's explicit authorization.
- Use focused positive journeys. Negative tests are limited to missing MCP, unsafe result files, secret/log leakage, and migration rollback safety.

---

### Task 1: Prove the official MCP on ECS

**Files:**

- Create: `infra/scripts/evaluate-scansci-upstream-mcp.sh`
- Create: `infra/scripts/evaluate-scansci-upstream-mcp.test.mjs`
- Modify: `docs/runbooks/deployment.md`

**Interfaces:**

- Consumes: ECS Squid at `127.0.0.1:7891`, upstream wheel `scansci-pdf==1.13.1`.
- Produces: one bounded evaluation command that reports only version, tool names, source label, PDF magic/size/hash, and exact cleanup status.

- [x] **Step 1: Write the failing script contract test**

The test executes the script with stubbed `docker`, `curl`, and cleanup commands and asserts that it:

- verifies the exact wheel/archive hash before launch;
- starts only an exact-name, host-network evaluation container bound to loopback;
- initializes MCP, calls `list_tools`, and requires all 17 public tool names;
- calls `scansci_pdf_download` for `arXiv:2009.06045v1` without strategy overrides;
- verifies `%PDF-`, `1..104857600` bytes, and SHA-256;
- removes only the exact evaluation container/volume on success or failure.

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
node --test infra/scripts/evaluate-scansci-upstream-mcp.test.mjs
```

Expected: FAIL because the evaluator does not exist.

- [x] **Step 3: Implement the minimal evaluator**

The ECS command starts `python:3.12-slim` with `--network host`, installs the exact PyPI wheel using hash checking, configures `SCANSCI_PDF_DATA_DIR` beneath an exact evaluation volume, and runs:

```text
scansci-pdf run --mode streamable_http --host 127.0.0.1 --port 18081
```

An in-container Python MCP client uses `mcp.client.streamable_http.streamablehttp_client` and `ClientSession` to initialize, list tools, and call the download tool. It prints only the bounded acceptance fields. A trap cleans the exact container and volume.

- [x] **Step 4: Verify GREEN locally, then run once on ECS**

Run locally:

```bash
node --test infra/scripts/evaluate-scansci-upstream-mcp.test.mjs
```

Run on ECS through the required shell:

```text
C:\Program Files\Git\bin\bash.exe infra/scripts/ssh-run.sh -- bash /opt/openscience/infra/scripts/evaluate-scansci-upstream-mcp.sh --confirm
```

Expected: 17 expected tools present; OA PDF has valid magic/size/hash; exact evaluation resources absent afterward.

- [x] **Step 5: Commit**

```bash
git add infra/scripts/evaluate-scansci-upstream-mcp.* docs/runbooks/deployment.md
git commit -m "test(scansci): prove upstream MCP on ECS"
```

Actual ECS evidence: `v1.13.1`, all 17 expected tools, source `arXiv`, `%PDF-`,
24,671,920 bytes, SHA-256
`d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a`;
evaluation containers/volumes `0/0`; active/public remained `405b85a…`.

### Task 2: Add source-retrieval provenance without blocking storage

**Files:**

- Create: `infra/migrations/20260902010000_scansci_source_retrieval/migration.sql`
- Create: `infra/migrations/20260902010000_scansci_source_retrieval/rollback.sql`
- Modify: `infra/schema.prisma`
- Modify: `packages/domain/src/retrieval/types.ts`
- Modify: `packages/domain/src/retrieval/rights.ts`
- Modify: `packages/domain/test/retrieval/rights.test.ts`
- Modify: `packages/domain/test/helpers/retrieval-payload-parity.ts`

**Interfaces:**

- Produces: `SourceAccessEvidence { kind: 'source_retrieval'; source: string }` and a decision `{ basis: 'source_retrieval', cacheAllowed: true, downloadPolicy: 'downloadable', reasonCode: 'source_retrieval_succeeded', checkerVersion: 'openscience-rights-v2' }`.

- [x] **Step 1: Write the failing domain test**

Use a literal ScanSci source such as `sci-hub.vg` and assert the exact decision above. The test must fail because `source_retrieval` is not in the type/decision switch.

- [x] **Step 2: Run and verify RED**

```bash
npx pnpm@9.15.0 --filter @openscience/domain test -- rights.test.ts
```

- [x] **Step 3: Implement the minimal type and migration**

Forward migration:

```sql
ALTER TYPE "SourceRightsBasis" ADD VALUE IF NOT EXISTS 'source_retrieval';
```

Rollback first refuses while any row uses `source_retrieval`, then recreates the prior enum and casts the column through text. Update Prisma/types/decision logic and parity fixtures; do not change public endpoints.

- [x] **Step 4: Verify domain and real PostgreSQL forward/rollback/redeploy**

```bash
npx pnpm@9.15.0 --filter @openscience/domain test -- rights.test.ts
npx pnpm@9.15.0 --filter @openscience/domain typecheck
```

ECS acceptance must apply migration 34, run the literal decision contract, roll back with zero rows, and deploy forward again before product switch.

- [x] **Step 5: Commit**

```bash
git add infra/migrations/20260902010000_scansci_source_retrieval infra/schema.prisma packages/domain
git commit -m "feat(retrieval): preserve ScanSci source provenance"
```

Actual evidence: Domain `6/6`, Database migration contract `2/2`, Prisma/Database
build green. An isolated ECS PostgreSQL database completed
`FORWARD=source_retrieval`, `ROLLBACK_COUNT=0`, and
`REDEPLOY=source_retrieval`; the temporary database was dropped.

### Task 3: Replace the Worker HTTP adapter with the official MCP client

**Files:**

- Create: `apps/agent-worker/src/retrieval/scansci-mcp.ts`
- Modify: `apps/agent-worker/src/retrieval/scansci.ts`
- Modify: `apps/agent-worker/test/retrieval/scansci.test.ts`
- Modify: `apps/agent-worker/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/scansci-mcp/Dockerfile`
- Create: `apps/scansci-mcp/entrypoint.sh`
- Create: `apps/scansci-mcp/requirements.lock`
- Create: `apps/scansci-mcp/package.json`
- Create: `apps/scansci-mcp/test/runtime-contract.test.mjs`
- Modify: `pnpm-workspace.yaml`
- Modify: `infra/compose/docker-compose.prod.yml`
- Modify: `infra/compose/docker-compose.dev.yml`

**Interfaces:**

- Consumes: MCP endpoint `SCANSCI_MCP_URL`, output root `SCANSCI_PAPERS_DIR`.
- Produces: existing `ScanSciAcquireResult`, extended with route `source_retrieval` and exact `source` provenance.

- [x] **Step 1: Write failing Worker behavior tests**

Use a protocol-level fake streamable-HTTP MCP server, not a mocked adapter. Cover only:

1. initialize/list-tools/call-tool success returns a real temporary PDF beneath the allowed root;
2. an upstream non-OA source maps to `source_retrieval` without policy blocking;
3. a path outside the root or symlink returns `invalid_response`;
4. `login_required`, timeout, and unavailable map to existing stable codes;
5. no default call argument contains strategy/source overrides.

- [x] **Step 2: Verify RED**

```bash
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- scansci.test.ts
```

Expected: FAIL because the Worker still calls `/v1/legal-download`.

- [x] **Step 3: Implement the minimal client and runtime image**

Add direct dependency `@modelcontextprotocol/sdk@1.30.0`. `scansci-mcp.ts` owns one reusable client connection, tool discovery, bounded JSON parsing, stable error mapping, and descriptor-based file reading. `scansci.ts` normalizes upstream results and preserves the existing 100 MiB/hash/object-storage contract.

The image installs exact `scansci-pdf==1.13.1`, Patchright/Chromium/Xvfb and runs only the official server. Compose adds `scansci-data` and `scansci-papers`; Agent Worker shares GID 11000 with the MCP and receives write access only to `scansci-papers` so successful staging files can be removed after malware scan, object upload and durable document activation. Remove no old service yet.

- [x] **Step 4: Verify GREEN**

```bash
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- scansci.test.ts
npx pnpm@9.15.0 --filter @openscience/agent-worker typecheck
npx pnpm@9.15.0 --filter @openscience/scansci-mcp test
```

- [x] **Step 5: Commit**

```bash
git add apps/agent-worker apps/scansci-mcp infra/compose pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(scansci): route Hermes through upstream MCP"
```

Actual evidence: Worker retrieval `20/20`, focused ScanSci `5/5`, Worker
typecheck/build and MCP runtime contract green. On the ECS candidate, the real
Worker called the official MCP for `arXiv:2009.06045v1`, obtained source
`arXiv`, `%PDF-`, 24,671,920 bytes and SHA-256
`d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a`;
the shared staging volume contained zero PDFs after acknowledgement.

### Task 4: Integrate official login and immutable deployment

**Files:**

- Modify: `infra/compose/docker-compose.prod.yml`
- Modify: `infra/scripts/production-deploy-transaction.mjs`
- Modify: `infra/scripts/production-deploy-transaction.test.mjs`
- Modify: `infra/scripts/production-release-retention.mjs`
- Modify: `infra/scripts/production-release-retention.test.mjs`
- Create: `infra/scripts/verify-scansci-mcp-runtime.mjs`
- Create: `infra/scripts/verify-scansci-mcp-runtime.test.mjs`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/runbooks/hermes-capability-registry.md`

**Interfaces:**

- Produces: one official `scansci-mcp` service with persistent `scansci-data`, exact runtime verifier, active+rollback retention, and official `cookie_import` institutional bootstrap without a second browser/auth service.

- [x] **Step 1: Write the failing runtime/deploy contract tests**

Assert exact image labels/version, MCP tool discovery, data/paper mounts, no database/application secrets, no browser/auth sidecar, active+rollback retention, and rollback preservation of `scansci-data`.

- [x] **Step 2: Verify RED**

```bash
node --test infra/scripts/verify-scansci-mcp-runtime.test.mjs infra/scripts/production-deploy-transaction.test.mjs infra/scripts/production-release-retention.test.mjs
```

- [x] **Step 3: Implement the minimal deployment integration**

The sole MCP image exposes upstream login and `cookie_import` tools. Administrator cookies are imported through the official tool into `scansci-data`; no custom login code, X11/noVNC transport, or second image is deployed.

- [x] **Step 4: Run focused local gates**

```bash
node --test infra/scripts/verify-scansci-mcp-runtime.test.mjs infra/scripts/production-deploy-transaction.test.mjs infra/scripts/production-release-retention.test.mjs
npx pnpm@9.15.0 build
npx pnpm@9.15.0 typecheck
```

- [x] **Step 5: Commit**

```bash
git add apps/scansci-mcp infra/compose infra/scripts docs/runbooks
git commit -m "feat(infra): deploy official ScanSci MCP"
```

Historical schema-5 runtime/auth work was rejected. The replacement candidate
uses only the official MCP image, schema-6 MCP identity, MCP-first positive
canary, active/rollback retention, and persistent data/paper volumes. Focused
runtime, retention, deploy and Bash syntax gates are green. Production
merge/deploy and the institutional cookie-import journey remain Task 5.

The retained implementation uses the pinned MCP 2.1.1
`streamable_http_client` in the real health probe and keeps identity-safe
terminal `discard` for policy-blocked staging while `acknowledge` occurs only
after durable activation.

### Task 5: Deploy, accept, and remove the rejected implementation

**Files:**

- Delete after acceptance: `apps/scansci-legal/`
- Delete after acceptance: rejected ScanSci browser/auth/network-only scripts and systemd units identified by `git grep -l 'scansci-legal\|scansci-browser' -- infra`
- Modify: release scripts/tests that still name rejected images or volumes
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Delete after acceptance: `docs/specs/2026-08-30-scansci-default-capability-design.md`
- Delete after acceptance: `docs/plans/2026-08-30-scansci-default-capability-plan.md`

**Interfaces:**

- Produces: merged immutable release, persistent official ScanSci session, four-entry product evidence, clean repository/server, and Taskmaster Task 10 complete.

- [x] **Step 1: Run focused release review and CI**

Use `security-review`, `requesting-code-review`, `test-gate`, and `verification-before-completion`. Required local gates are build, typecheck, lint, focused Domain/Worker/MCP/release tests, docs sync, Markdown lint, and `git diff --check`.

PR #41 exact GitHub CI `33594996489` passed and merged as
`ab290579ed81f4a30d011dea2a52e8b9b20c50f3`. The auth bridge/parser build
follow-up passed PR #43 exact CI `33606675500` and merged as `7daff3f…`.

- [x] **Step 2: Merge and execute the canonical ECS deployment**

Deploy only the merged SHA through `deploy.sh --confirm --require-parser-acceptance` with production `405b85a…` as rollback. Verify migration 34, exact images, MCP tools, containers, Parser/BGE, API/Web/Worker, Nginx, public release, journal, and retention.

Actual: canonical deployment accepted `7daff3f…` with rollback `ab290579…`;
core/search are `34/34` and `2/2`. Exact 16-case Parser acceptance, official
image/tools/storage/OA/Worker, Parser/BGE, application, public CAS, journal and
retention gates passed; transient eval output was removed after report publish.

- [ ] **Step 3: Complete the positive production journey**

Run OA download, one official ZJU institutional login, one subscription-only download, MCP container recreation and repeat download, then one request from each of the four existing product entries. Verify one-use link and 72-hour metadata without waiting 72 hours by checking the exact stored timestamps and existing GC contract once.

Current state: the official MCP, persistent volumes, Worker lifecycle, and OA
proof already exist in production. The rejected visible-browser bridge is being
removed. Institutional bootstrap will use the official `cookie_import` tool
with an administrator-exported Netscape file; subscription-only and post-recreate
proof remain pending. The fixed DOI's Semantic Scholar PDF is only an OA proof,
not the required subscription-only evidence.

- [ ] **Step 4: Delete rejected repository artifacts**

Resolve the exact file list from tracked dependencies, remove it in one cleanup commit, and run `rg`/Knip/dependency-cruiser to prove no active imports or config remain. Git history is the only retained copy.

- [ ] **Step 5: Clean exact ECS artifacts**

After the new release is healthy, stop/remove only rejected ScanSci containers, images, empty job volumes, obsolete networks/systemd units, exact evaluation directories, and inactive Docker builder cache. Keep active/rollback application images, `scansci-data`, accepted object-storage data, models, monitoring data, and backups. Record before/after `docker system df -v` and `df -h`; do not run `docker system prune` or volume prune.

- [ ] **Step 6: Close documentation and commit**

Update Taskmaster to 10/12 only after all production gates pass. Sync CURRENT docs/index/registry/runbook, run docs gates, commit, push, and remove obsolete remote branches only after ancestry checks.

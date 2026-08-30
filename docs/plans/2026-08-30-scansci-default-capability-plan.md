# ScanSci Default Literature Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a persistent Zhejiang University CARSI-backed `scansci-legal` service as Hermes's default PDF acquisition capability and connect Dashboard/Personal Space, Hermes, RO Hermes, and RO Files/Evidence to one safe asynchronous product contract.

**Architecture:** A source-locked, non-root Python service exposes only `/healthz`, `/v1/session/status`, and `/v1/legal-download` to Agent Worker. The API owns a strict `/literature/acquisitions` endpoint that creates/reuses a personal literature RO or targets an existing RO, then submits the existing internal `source.retrieve` task with server-owned providers. A stopped-by-default loopback auth helper persists one operator-owned CARSI browser session in a named volume; the existing temporary-document, one-use link, rights, object-storage, and Worker GC pipeline remains the only byte-delivery path.

**Tech Stack:** Python 3.12 standard-library HTTP service, pinned `scansci-pdf` 1.11.0 source archive, Chromium/Xvfb/noVNC auth helper, TypeScript/Fastify/Prisma Domain services, Next.js/React/next-intl, Docker Compose, SeaweedFS, ClamAV, Vitest/unittest/Playwright, immutable ECS release transaction.

## Global Constraints

- Fixed upstream commit: `7017814758f826ea21470a609890a7d3ca374b8e`; archive SHA-256: `db537914b9c149f2ef6ba148f47e316fddcfe350e4afe8f9fa88a2a1af9208b9`.
- Both service images start from `python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17`; the auth image records exact installed Chromium/noVNC package versions in its release manifest.
- The upstream Docker Compose and MCP/Web surfaces are forbidden; they include Tor or excessive capabilities.
- Runtime policy is exactly `legal_only`, `scihub_enabled=false`, `use_tor=false`; Sci-Hub, LibGen, SciBban, Tor, arbitrary URL, callback, and user-selected provider paths are hard failures.
- Production code and containers are release-scoped on the CPU ECS. Local Docker is forbidden; server deployment is the final acceptance environment.
- CARSI account/password/Cookies/profile/service token never enter Git, database rows, logs, task payload/result, Hermes prompt, browser DTO, or shell command text.
- Stable Secret root is `/opt/openscience-secrets/scansci` (`0700 root:root`, files `0600`); browser state lives in one dedicated named volume.
- Maximum request JSON is 4 KiB; maximum PDF is 100 MiB; DOI/arXiv is the only acquisition identifier.
- PDF storage remains Workspace-scoped, exactly 72 hours, ClamAV scanned and SHA-256 verified; downloads remain maximum 600 seconds, HttpOnly, one-use and membership/rights guarded.
- All browser entry points use `/literature/acquisitions`; direct public `source.retrieve` submission is rejected.
- No broad Docker/filesystem prune. Retain only active/rollback application and ScanSci images, required model/session volumes, accepted evidence and seven backup sets.

---

### Task 1: Source-lock the ScanSci legal runtime and policy boundary

**Files:**
- Create: `apps/scansci-legal/package.json`
- Create: `apps/scansci-legal/requirements.in`
- Create: `apps/scansci-legal/requirements.lock`
- Create: `apps/scansci-legal/upstream.lock.json`
- Create: `apps/scansci-legal/src/scansci_legal/__init__.py`
- Create: `apps/scansci-legal/src/scansci_legal/policy.py`
- Create: `apps/scansci-legal/test/test_policy.py`
- Modify: `scripts/verify-workspace.mjs`

**Interfaces:**
- Produces: `LegalDownloadRequest`, `validate_request(payload: object)`, `validate_source_result(result: dict)`, and immutable source-lock metadata consumed by Tasks 2–4.

- [ ] **Step 1: Add the failing policy tests**

```python
class LegalPolicyTest(unittest.TestCase):
    def test_accepts_only_fixed_legal_contract(self):
        request = validate_request({
            "identifier": "10.1038/nature12373",
            "strategy": "legal_only",
            "scihub": False,
            "tor": False,
            "institutional": True,
            "subject_id": "a" * 64,
        })
        self.assertEqual(request.identifier, "10.1038/nature12373")

    def test_rejects_grey_routes_and_arbitrary_urls(self):
        for change in ({"scihub": True}, {"tor": True}, {"strategy": "fastest"},
                       {"identifier": "https://127.0.0.1/secret"}):
            with self.subTest(change=change), self.assertRaises(PolicyError):
                validate_request({**VALID_REQUEST, **change})

    def test_rejects_grey_source_labels_even_after_upstream_success(self):
        for source in ("Sci-Hub", "LibGen", "SciBban", "Tor"):
            with self.subTest(source=source), self.assertRaises(PolicyError):
                validate_source_result({"success": True, "source": source})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/scansci-legal test`

Expected: FAIL because `scansci_legal.policy` and the workspace package do not exist.

- [ ] **Step 3: Implement the minimum strict policy module**

Implement frozen request/result dataclasses, exact-key validation, the existing DOI/arXiv regex, 4 KiB canonical JSON bound, 64-hex subject validation, a positive route allowlist (`open_access`, `publisher_api`, `institutional`), and a positive source-label allowlist. Do not infer legality from a URL string.

Use this exact lock document:

```json
{
  "name": "scansci-pdf",
  "version": "1.11.0",
  "commit": "7017814758f826ea21470a609890a7d3ca374b8e",
  "archiveUrl": "https://github.com/Rimagination/scansci-pdf/archive/7017814758f826ea21470a609890a7d3ca374b8e.tar.gz",
  "archiveSha256": "db537914b9c149f2ef6ba148f47e316fddcfe350e4afe8f9fa88a2a1af9208b9",
  "strategy": "legal_only",
  "scihub": false,
  "tor": false
}
```

Generate a fully hashed dependency lock from `requirements.in` with a project-local one-shot tool, then commit the generated bytes:

```bash
uvx --from pip-tools==7.5.0 pip-compile --generate-hashes --resolver=backtracking \
  apps/scansci-legal/requirements.in -o apps/scansci-legal/requirements.lock
```

- [ ] **Step 4: Verify GREEN and workspace registration**

Run:

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test
npx pnpm@9.15.0 verify:workspace
```

Expected: policy tests pass; workspace structure includes the new package.

- [ ] **Step 5: Commit**

```bash
git add apps/scansci-legal scripts/verify-workspace.mjs pnpm-lock.yaml
git commit -m "feat(scansci): lock legal-only source policy"
```

### Task 2: Implement the internal legal-download HTTP service

**Files:**
- Create: `apps/scansci-legal/src/scansci_legal/http_service.py`
- Create: `apps/scansci-legal/src/scansci_legal/upstream.py`
- Create: `apps/scansci-legal/src/scansci_legal/main.py`
- Create: `apps/scansci-legal/test/test_http_service.py`
- Create: `apps/scansci-legal/test/test_upstream.py`

**Interfaces:**
- Consumes: Task 1 policy and source lock.
- Produces: `create_server(config, acquisition_client)`, `/healthz`, `/v1/session/status`, `/v1/legal-download`, and `ScanSciAcquisitionClient.acquire(request)`.

- [ ] **Step 1: Write failing service-token and contract tests**

Tests must prove: missing/wrong bearer token returns 401; duplicate/unknown JSON keys and body >4 KiB return 400/413; only DOI/arXiv reaches the acquisition client; a successful PDF emits the exact `x-scansci-*` headers; invalid magic, size overflow, unsafe source URL/label, raw exceptions and non-allowlisted routes fail closed without response-body leakage.

```python
response = request_json(server, "/v1/legal-download", VALID_REQUEST,
                        token="service-test-token")
self.assertEqual(response.status, 200)
self.assertEqual(response.headers["x-scansci-route"], "institutional")
self.assertEqual(response.body[:5], b"%PDF-")
self.assertNotIn(b"cookie", response.body.lower())
```

- [ ] **Step 2: Verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/scansci-legal test`

Expected: FAIL because the HTTP service and acquisition client do not exist.

- [ ] **Step 3: Implement the standard-library server and injectable upstream client**

Use `ThreadingHTTPServer`, bounded `Content-Length`, strict UTF-8/JSON decoding,
constant-time `hmac.compare_digest`, a semaphore of two acquisitions, per-host
timeouts, an isolated temporary directory, and bounded file reads. The upstream
client writes a fixed config with `legal_only`, `scihub_enabled=false`, empty
Tor/proxy variables, batch workers 1, and no upstream server/MCP startup. It
calls only the pinned library's DOI/arXiv download function and validates the
returned source label/file before reading bytes.

Map internal failures only to:

```python
ERROR_STATUS = {
    "auth_required": 409,
    "not_entitled": 403,
    "not_found": 404,
    "rate_limited": 429,
    "invalid_pdf": 422,
    "policy_blocked": 422,
    "upstream_timeout": 504,
    "upstream_unavailable": 502,
}
```

- [ ] **Step 4: Verify GREEN and warning-free output**

Run: `npx pnpm@9.15.0 --filter @openscience/scansci-legal test`

Expected: all Python unit tests pass with no raw exception, path, URL credential, Cookie or PDF text in output.

- [ ] **Step 5: Commit**

```bash
git add apps/scansci-legal/src apps/scansci-legal/test
git commit -m "feat(scansci): add internal legal download service"
```

### Task 3: Add persistent CARSI session and loopback auth helper

**Files:**
- Create: `apps/scansci-legal/src/scansci_legal/session.py`
- Create: `apps/scansci-legal/src/scansci_legal/auth_login.py`
- Create: `apps/scansci-legal/auth-entrypoint.sh`
- Create: `apps/scansci-legal/test/test_session.py`
- Create: `apps/scansci-legal/Dockerfile`
- Create: `apps/scansci-legal/Dockerfile.auth`
- Create: `infra/scripts/scansci-auth-tunnel.sh`
- Test: `infra/scripts/scansci-auth-tunnel.test.mjs`

**Interfaces:**
- Produces: persistent `SessionManager` states (`ready`, `refreshing`, `auth_required`, `disabled`), single-flight refresh/backoff, CARSI login helper on loopback port 6080, and canonical tunnel start/stop/status commands.

- [ ] **Step 1: Write failing session and tunnel tests**

Tests must prove: persisted profile is reused after manager recreation; health probes do not refresh each request; one auth redirect starts one refresh; repeated failure backs off; password/MFA text is redacted; only an explicit admin action starts the auth helper; tunnel command uses the project SSH key through explicit Git Bash and never prints `.env` values.

```python
manager = SessionManager(store, refresher, clock)
self.assertEqual(manager.status(), "ready")
self.assertEqual(SessionManager(store, refresher, clock).status(), "ready")
await_all([manager.on_auth_redirect() for _ in range(5)])
self.assertEqual(refresher.calls, 1)
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test
node --test infra/scripts/scansci-auth-tunnel.test.mjs
```

Expected: FAIL for missing session manager/auth helper/tunnel script.

- [ ] **Step 3: Implement session persistence and optional credential fallback**

The manager reads profile/Cookie state only from `/session`, checks file owner/mode,
uses a 15-minute probe interval, a five-minute refresh lease and exponential
backoff capped at six hours. Optional credentials are read from fixed
`/run/secrets/scansci_username` and `/run/secrets/scansci_password` paths and
never copied into state or error objects. MFA/CAPTCHA sets `auth_required`.

The auth image starts Xvfb, Chromium, x11vnc and noVNC/websockify, then invokes
the pinned ScanSci CARSI login for institution `浙江大学`. Bind port 6080 only to
`127.0.0.1`; share `/session`; stop after successful login. No public ingress or
upstream remote-assist HTTP server is enabled.

- [ ] **Step 4: Build-test the Dockerfiles without local Docker**

Local verification is source/static only:

```bash
node --test infra/scripts/scansci-auth-tunnel.test.mjs
npx pnpm@9.15.0 --filter @openscience/scansci-legal test
rg -n "latest|TOR_PROXY|scihub_enabled.*true|0\.0\.0\.0:6080" apps/scansci-legal
```

Expected: tests pass; forbidden scan has no matches. Actual image build is ECS-only in Task 10.

- [ ] **Step 5: Commit**

```bash
git add apps/scansci-legal infra/scripts/scansci-auth-tunnel.*
git commit -m "feat(scansci): persist CARSI session securely"
```

### Task 4: Integrate ScanSci into production Compose and immutable release recovery

**Files:**
- Modify: `.env.example`
- Modify: `infra/compose/docker-compose.prod.yml`
- Modify: `infra/compose/docker-compose.dev.yml`
- Modify: `infra/scripts/production-deploy-transaction.sh`
- Modify: `infra/scripts/production-deploy-transaction-state.sh`
- Modify: `infra/scripts/production-release-retention.mjs`
- Modify: `infra/scripts/deploy.test.mjs`
- Modify: `infra/scripts/production-release-retention.test.mjs`
- Create: `infra/scripts/verify-scansci-runtime.mjs`
- Create: `infra/scripts/verify-scansci-runtime.test.mjs`
- Create: `infra/scripts/provision-scansci-secrets.mjs`
- Create: `infra/scripts/provision-scansci-secrets.test.mjs`
- Create: `docs/decisions/ADR-012-scansci-default-literature-acquisition.md`

**Interfaces:**
- Consumes: Tasks 1–3 images/session paths.
- Produces: SHA-tagged `openscience-scansci-legal:$RELEASE_SHA`, stopped auth profile, stable Secret/session resources, deploy/rollback/retention support and runtime verifier.

- [ ] **Step 1: Write failing topology, Secret and rollback tests**

Assert: service has no host port/data network/database/storage env; non-root,
read-only, cap-drop, PID/CPU/RAM/tmpfs bounds; auth helper is profile-only and
loopback; session volume is named; credential files use fixed paths; deploy builds
and starts ScanSci before Agent Worker; catchable failure restores the exact
previous ScanSci image or stops it when previous release lacks the service;
retention keeps active+rollback ScanSci tags; no broad prune appears.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test infra/scripts/deploy.test.mjs \
  infra/scripts/production-release-retention.test.mjs \
  infra/scripts/verify-scansci-runtime.test.mjs \
  infra/scripts/provision-scansci-secrets.test.mjs
```

Expected: FAIL for missing service/topology/recovery contracts.

- [ ] **Step 3: Implement the minimum Compose and transaction changes**

Create a normal `scansci-legal` service on a dedicated `retrieval_net` shared
with Agent Worker, plus an `auth` profile helper with `127.0.0.1:6080`. Add
`scansci-session` named volume and fixed host-file Secrets. Build ScanSci alongside
Worker/Parser; verify its source label/image ID/health/policy before Worker switch;
restore/stop it in rollback; bind active/rollback ScanSci images in retention.

`verify-scansci-runtime.mjs` must verify source/archive/dependency hashes, UID,
mounts, networks, ports, limits, fixed strategy/flags, service-token presence,
session state and absence of grey/Tor environment without printing values.

`provision-scansci-secrets.mjs` reads values only from stdin, atomically creates
the fixed root-owned directory/files, preserves existing credentials unless
explicitly replaced, and prints key names/status only.

- [ ] **Step 4: Verify GREEN**

Run the four Node test files plus `npx pnpm@9.15.0 lint`.

Expected: all transaction/topology/Secret contracts pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example infra/compose infra/scripts docs/decisions/ADR-012-scansci-default-literature-acquisition.md
git commit -m "feat(infra): deploy ScanSci as a release capability"
```

### Task 5: Add the unified Domain and API acquisition contract

**Files:**
- Create: `packages/domain/src/retrieval/literature-acquisition.ts`
- Create: `packages/domain/test/retrieval/literature-acquisition.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/agent/agent.ts`
- Create: `apps/api/src/routes/literature.ts`
- Create: `apps/api/test/literature-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/security/rate-limit.ts`
- Modify: `apps/api/test/agent-payload.test.ts`

**Interfaces:**
- Produces: `submitLiteratureAcquisition(deps, input, auditCtx)`, strict `POST /literature/acquisitions`, and public rejection of generic `source.retrieve`.

- [ ] **Step 1: Write failing Domain/API tests**

Cover exact request keys, personal library RO create/reuse, research-object
membership, idempotent session/task reuse, server-owned provider payload,
query-only versus identifier behavior, quota/audit/rate limit, CSRF/auth,
cross-Workspace denial, and generic `/agent/tasks` rejection.

```ts
expect(await submitLiteratureAcquisition(deps, {
  userId: 'user-1', idempotencyKey: 'request-1',
  query: 'attosecond dynamics', identifier: '10.1038/nature12373',
  target: { kind: 'personal' },
})).toMatchObject({ task: { kind: 'source.retrieve' } });
expect(db.agentTasks[0]?.payload).toEqual({
  query: 'attosecond dynamics', providers: ['scansci'], limit: 1,
  includeFullText: true, identifier: '10.1038/nature12373',
});
```

- [ ] **Step 2: Verify RED**

Run the two new test files plus `apps/api/test/agent-payload.test.ts`.

Expected: FAIL for missing acquisition service/route and because direct public `source.retrieve` is still accepted.

- [ ] **Step 3: Implement personal and RO target orchestration**

Use the existing personal Workspace, `createResearchObject` with global key
`system:personal-literature:${userId}`, `createAgentSession`, and
`submitAgentTask`. Prefix caller idempotency with the user/target so replay is
safe and cross-user collisions are impossible. Query-only payload is server-owned
`semantic_scholar,tavily`; identifier payload is server-owned `scansci` full text.
The route returns 202 with session/task/researchObject identities. Remove
`source.retrieve` from `PUBLIC_AGENT_TASK_KINDS` while retaining it internally.

- [ ] **Step 4: Verify GREEN and contracts**

Run Domain/API targeted tests, typecheck and lint.

- [ ] **Step 5: Commit**

```bash
git add packages/domain apps/api
git commit -m "feat(api): unify literature acquisition entry points"
```

### Task 6: Complete Agent Worker ScanSci routing and stable failures

**Files:**
- Modify: `apps/agent-worker/src/retrieval/scansci.ts`
- Modify: `apps/agent-worker/src/retrieval/contracts.ts`
- Modify: `apps/agent-worker/src/retrieval/orchestrator.ts`
- Modify: `apps/agent-worker/src/index.ts`
- Modify: `apps/agent-worker/test/retrieval/scansci.test.ts`
- Modify: `apps/agent-worker/test/retrieval/orchestrator.test.ts`
- Modify: `apps/agent-worker/test/gateway-config.test.ts`

**Interfaces:**
- Consumes: internal service contract and server-owned task payload.
- Produces: file-based service-token loading, stable provider error mapping, default ScanSci full-text route and administrator auth-required audit/notification.

- [ ] **Step 1: Write failing adapter/orchestration tests**

Add cases for each stable service code, token file presence/permissions, strict
subject/entitlement binding, streamed overflow cancellation, invalid final URL,
grey label/route rejection, `auth_required` notification, and query-only tasks
remaining functional when ScanSci is unhealthy.

- [ ] **Step 2: Verify RED**

Run the three targeted Worker test files.

Expected: FAIL because non-200 responses currently collapse to `upstream_error` and token `_FILE` loading/notification do not exist.

- [ ] **Step 3: Implement minimal mapping and runtime wiring**

Read `SCANSCI_SERVICE_TOKEN_FILE` once after validating a regular non-symlink
file with private mode. Preserve the 100 MiB bounded stream. Map service JSON
codes to provider-neutral states; never copy response text into errors. Record
`external_retrieval.auth_required` and create an administrator notification on
the first state transition only. Keep metadata search available on every failure.

- [ ] **Step 4: Verify GREEN**

Run Worker targeted tests, Worker full tests, typecheck and lint.

- [ ] **Step 5: Commit**

```bash
git add apps/agent-worker
git commit -m "feat(hermes): enable persistent ScanSci acquisition"
```

### Task 7: Add Personal Space literature acquisition UI

**Files:**
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/components/dashboard/LiteratureAcquisition.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Create: `apps/web/test/literature-acquisition.test.tsx`
- Modify: `apps/web/test/api-client-contract.test.ts`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Produces: `submitLiteratureAcquisition`, personal search/download card, metadata result selection, task polling and temporary download action.

- [ ] **Step 1: Write failing API/UI tests**

Test strict request serialization with no provider/mode fields, query-only result
rendering, selecting DOI to request full text, pending/running/auth-required/
failed/succeeded states, expiry display, keyboard labels, and no account/CARSI/
ScanSci controls in markup.

- [ ] **Step 2: Verify RED**

Run the new Web test and API client contract test.

- [ ] **Step 3: Implement the minimum Dashboard component**

Use one title/DOI/arXiv field. Query text submits personal metadata search;
recognized DOI/arXiv submits full-text acquisition. Metadata results expose a
single “Get full text” action. Poll existing AgentTask API and use the existing
temporary-document download-link flow. Keep all copy in `dashboard.literature`.

- [ ] **Step 4: Verify GREEN and accessibility**

Run targeted Web tests and `@openscience/web` full tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add personal literature acquisition"
```

### Task 8: Connect Hermes, RO Hermes and RO Files/Evidence entry points

**Files:**
- Modify: `apps/web/components/hermes/HermesAssistantDrawer.tsx`
- Create: `apps/web/lib/hermes/literature-intent.ts`
- Create: `apps/web/test/hermes-literature-intent.test.tsx`
- Modify: `apps/web/app/research-objects/[id]/hermes/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/files/page.tsx`
- Modify: `apps/web/components/intake/EvidenceIntake.tsx`
- Modify: `apps/web/test/surface-shells.test.tsx`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: Task 7 API/client component.
- Produces: deterministic literature intent routing and all remaining approved product entrances.

- [ ] **Step 1: Write failing entry-point tests**

Assert that DOI/arXiv or explicit Chinese/English find/download-paper intent uses
the literature endpoint; unrelated research goals remain `workspace.guide`;
active RO targets that RO; Dashboard falls back to personal; RO Hermes and
Files/Evidence render a full-text action; none render provider/auth mode controls.

- [ ] **Step 2: Verify RED**

Run the new intent test and surface-shell tests.

- [ ] **Step 3: Implement deterministic intent and shared acquisition control**

Use DOI/arXiv regex plus a bounded bilingual verb/noun set. Do not send free text
to a model merely to classify intent. Title-only intent submits query-only and
shows selectable results. Reuse the Task 7 component with a target prop; do not
fork polling or download logic.

- [ ] **Step 4: Verify GREEN and browser contract**

Run Web full tests, product visual gate and Hermes Workspace Companion gate.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(hermes): expose literature acquisition everywhere"
```

### Task 9: Run security, architecture, API and release reviews

**Files:**
- Modify only files implicated by concrete review findings.
- Update: `docs/security/production-security-checklist.md`
- Update: `docs/runbooks/hermes-capability-registry.md`
- Update: `project_index.md`

**Interfaces:**
- Produces: zero-open P0/P1 review, complete local gates and phase acceptance evidence.

- [ ] **Step 1: Run focused static and dependency checks**

```bash
rg -n "Sci-Hub|scihub|LibGen|SciBban|TOR_PROXY|use_tor" apps/scansci-legal infra/compose apps/agent-worker
npx pnpm@9.15.0 audit:knip
npx pnpm@9.15.0 audit:dep
npx pnpm@9.15.0 audit:deps
```

Every match must be a negative assertion, fixed false value or documentation;
no executable enable path is accepted.

- [ ] **Step 2: Run architecture/API/security reviews**

Verify app/package dependency direction, the single browser-facing endpoint,
API idempotency/RBAC/rate/CSRF/audit, SSRF/redirect/DNS bounds, Secret isolation,
Cookie/profile ownership, log redaction, resource limits, rollback and public
surface. Fix P0/P1 findings with a failing regression test first.

- [ ] **Step 3: Run full local gates**

```bash
npx pnpm@9.15.0 build
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 test
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Expected: all pass; no unhandled rejection or warning that changes the exit code.

- [ ] **Step 4: Request final code review and close findings**

Run the project review workflow on the complete diff. Repeat tests for every
fix. Do not merge with unresolved P0/P1 or missing production acceptance steps.

- [ ] **Step 5: Commit review/docs changes**

```bash
git add docs project_index.md
git commit -m "docs: gate ScanSci production capability"
```

### Task 10: Merge, deploy, authenticate and prove the real product journey

**Files:**
- Update after evidence: `docs/progress.md`
- Update after evidence: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Update after evidence: `docs/runbooks/deployment.md`
- Update after evidence: `docs/runbooks/hermes-capability-registry.md`
- Update after evidence: `.taskmaster/tasks/tasks.json`
- Update after evidence: `project_index.md`

**Interfaces:**
- Produces: merged main, immutable production release, persistent Zhejiang University session, four-entry real journey, exact cleanup and Task 10 done.

- [ ] **Step 1: Push PR and require exact GitHub CI**

Use `gh` CLI. Record run/job IDs and merge commit. Delete the remote feature
branch only after ancestry verification. Do not deploy a PR head that is not the
merged main commit.

- [ ] **Step 2: Provision Secret files without printing values**

Run the checked-in stdin-based provisioner through explicit Git Bash and the
canonical SSH path. Generate a random service token. Leave username/password
empty unless the persistent-session acceptance proves they are necessary; if
necessary, collect them through a secure local stdin/UI path, never chat or a
command argument. Verify key names, owner and mode only.

- [ ] **Step 3: Build and preflight on ECS without switching production**

Materialize the merged SHA, run the full server build, build ScanSci/Worker/
Parser/embedding images, run Parser acceptance, run ScanSci source-lock/policy/
OA canary, and verify current active/public release is unchanged.

- [ ] **Step 4: Canonically deploy and verify rollback**

Set `ACTIVE_SHA` from the locked preflight and `MERGED_SHA` from merged main,
then run `deploy.sh --confirm --require-parser-acceptance --rollback-ref
"$ACTIVE_SHA" "$MERGED_SHA"` through `C:/Program Files/Git/bin/bash.exe`. Require core/search
migration status, ScanSci/Parser/BGE/runtime identity, all containers, Nginx,
public release, journal clear and active/rollback retention.

- [ ] **Step 5: Complete the one-time Zhejiang University CARSI login**

Start only the auth profile, start the checked-in loopback SSH tunnel, set the
validated local port as `SCANSCI_LOCAL_PORT`, and open
`http://127.0.0.1:$SCANSCI_LOCAL_PORT` for the operator. The operator types credentials
inside the isolated browser. Stop the tunnel/helper after session status becomes
`ready`; verify profile volume survives helper and service recreation.

- [ ] **Step 6: Run real OA and institutional acquisitions**

Use arXiv `2009.06045v1` for OA and DOI `10.1038/nature12373` for the institutional
route. Verify route/header/source, PDF magic/size/hash, ClamAV, temporary object,
rights and no grey/Tor audit event. If the institutional DOI is OA for the actual
session, select a non-OA DOI from the same approved Nature access surface and
record it before running; do not claim institutional success from an OA route.

- [ ] **Step 7: Prove all four product entries**

Run real Chromium against production for Dashboard/Personal Space, Hermes drawer,
RO Hermes, and RO Files/Evidence. Each must create/reuse the unified task and
yield a working one-use download; no provider/mode/account UI or console error.

- [ ] **Step 8: Prove lifecycle, restart persistence and failure recovery**

Verify replay 404, exact 72-hour expiry/real Worker GC, bytes absent and
provenance retained. Recreate `scansci-legal` and prove session remains `ready`.
Force a bounded auth-required fake through the isolated acceptance path and
verify administrator notification plus metadata fallback without touching the
real session.

- [ ] **Step 9: Perform exact hygiene and disk audit**

Remove only acceptance users/ROs/tasks/objects, transient browser/helper
containers, tunnel process, failed candidate roots/images and bounded evaluation
directories. Retain the production session volume and active/rollback images.
Inventory `/opt`, Docker images/volumes/cache and root bytes before/after; no
broad prune.

- [ ] **Step 10: Close Task 10 and merge docs-only handoff**

Set Task 10 done and metadata 10/12 only after every production gate passes.
Update CURRENT spec/plan/progress/handoff/runbooks/index, run Markdown/docs-sync/
diff gates, commit, PR, exact CI and merge. Final report must distinguish
repository main/docs HEAD from application release and state Task 11 as next.

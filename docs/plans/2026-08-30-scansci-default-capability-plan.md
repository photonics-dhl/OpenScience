# ScanSci Default Literature Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a persistent Zhejiang University CARSI-backed `scansci-legal` service as Hermes's default PDF acquisition capability and connect Dashboard/Personal Space, Hermes, RO Hermes, and RO Files/Evidence to one safe asynchronous product contract.

**Architecture:** A source-locked, browserless, non-root Python service exposes only `/healthz`, `/v1/session/status`, and `/v1/legal-download` to Agent Worker. Institutional retrieval crosses two opposite-direction bounded tmpfs job volumes into a separate CPU browser worker that has no service/session/data Secrets and returns browser-originated proof with the PDF; a stopped-by-default loopback auth helper is the only component that may publish the operator-owned CARSI Cookie JSON into the persistent session volume. The API owns the unified `/literature/acquisitions` contract, while the existing temporary-document, one-use link, rights, object-storage, and Worker GC pipeline remains the only byte-delivery path.

**Tech Stack:** Python 3.12 standard-library HTTP service, pinned `scansci-pdf` 1.11.0 source archive, pinned Patchright 1.62.2, Chromium/Xvfb browser worker, stopped-by-default Chromium/Xvfb/noVNC auth helper, TypeScript/Fastify/Prisma Domain services, Next.js/React/next-intl, Docker Compose, SeaweedFS, ClamAV, Vitest/unittest/Playwright, immutable ECS release transaction.

## Global Constraints

- Fixed upstream commit: `7017814758f826ea21470a609890a7d3ca374b8e`; archive SHA-256: `db537914b9c149f2ef6ba148f47e316fddcfe350e4afe8f9fa88a2a1af9208b9`.
- Legal, browser and auth images start from `python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17`; browser/auth images record exact installed Chromium/Xvfb and auth-only noVNC package versions in their release manifests.
- The upstream Docker Compose and MCP/Web surfaces are forbidden; they include Tor or excessive capabilities.
- Runtime policy is exactly `legal_only`, `scihub_enabled=false`, `use_tor=false`; Sci-Hub, LibGen, SciBban, Tor, arbitrary URL, callback, and user-selected provider paths are hard failures.
- Production code and containers are release-scoped on the CPU ECS. Local Docker is forbidden; server deployment is the final acceptance environment.
- CARSI account/password/Cookies/profile/service token never enter Git, database rows, logs, public task payload/result, Hermes prompt, job manifest, or shell command text. Only one request-local Cookie JSON file may cross the private read-only browser input volume.
- The Zhejiang University username/password is entered only in the isolated noVNC page and is never stored by OpenScience. Stable Secret root is `/opt/openscience-secrets/scansci` (`0700 root:root`, files `0600`); only validated Cookie JSON and bounded session metadata persist in one dedicated named volume.
- `scansci-legal` and `scansci-browser` use different fixed UIDs. Input tmpfs is legal-RW/browser-RO; output tmpfs is browser-RW/legal-RO. Each is 128 MiB, has no host path, and is removed only by exact release identity after both containers stop.
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

Production correction after the first real operator attempt: pinned ScanSci
hard-codes each federated-login wait to 180 seconds and exposes no CLI timeout.
Run setup once, retry federated-login at most ten times, publish `ready` on the
first success and `auth_required` only after bounded exhaustion or a launcher
failure. Tests must prove transient retry, one setup call, bounded exhaustion,
no secret-bearing arguments and unchanged explicit-admin gating.

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

### Task 3A: Define the bounded browser-job protocol

**Files:**
- Create: `apps/scansci-legal/src/scansci_legal/browser_protocol.py`
- Create: `apps/scansci-legal/test/test_browser_protocol.py`
- Modify: `apps/scansci-legal/src/scansci_legal/limits.py`

**Interfaces:**
- Consumes: one validated DOI and one request-local Cookie JSON snapshot.
- Produces: `BrowserProof`, `BrowserResult`,
  `validate_browser_result(job_id: str, proof_path: Path, pdf_path: Path,
  *, output_root: Path, identifier: str) -> BrowserResult`, and
  `BrowserJobClient.submit(identifier: str, cookie_json: bytes) -> BrowserResult`.

- [x] **Step 1: Write the failing protocol tests**

Cover the exact schema and filesystem invariants:

```python
proof = BrowserProof(
    http_status=200,
    mime="application/pdf",
    final_url="https://www.sciencedirect.com/science/article/pii/example/pdfft",
    source="CARSI-Browser",
    byte_count=len(PDF),
    sha256=hashlib.sha256(PDF).hexdigest(),
)
result = validate_browser_result(
    job_id, proof_path, pdf_path, output_root=output_root, identifier=identifier,
)
assert result == BrowserResult(content=PDF, proof=proof)
```

Tests also reject duplicate JSON keys, an unknown/missing key, non-lowercase
32-hex job ID, identifier mismatch, symlink/hardlink/non-regular file, owner or
mode drift, proof larger than 8 KiB, PDF larger than 100 MiB, non-2xx status,
normalized MIME other than exactly `application/pdf`, non-HTTPS or non-allowlisted
final host, source other than `CARSI-Browser`, byte-count/hash/magic mismatch,
timeout, stale output, and an output path outside the configured root. Assert
that input contains only `job.json` plus `cookies.json`, Cookie JSON is mode
`0640` and owned by UID 10001/GID 11000, and `job.json` contains no Cookie
value. Assert the legal client never unlinks or writes the output root: it writes
an input-side acknowledgement, waits boundedly for the browser owner to remove
the output, then removes only its own exact input directory. A missing browser
cleanup is surfaced and left for the browser owner's bounded stale-job recovery.

- [x] **Step 2: Verify RED**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- test_browser_protocol
```

Expected: FAIL because `scansci_legal.browser_protocol` does not exist.

- [x] **Step 3: Implement the protocol and validator**

Use these exact public types and constants:

```python
MAX_BROWSER_MANIFEST_BYTES = 4 * 1024
MAX_BROWSER_PROOF_BYTES = 8 * 1024
BROWSER_JOB_TIMEOUT_SECONDS = 210  # includes a 30-second terminal/ACK reserve
ACK_CLEANUP_TIMEOUT_SECONDS = 5
ALLOWED_INSTITUTIONAL_HOST_SUFFIXES = (
    "elsevier.com", "sciencedirect.com", "elsevierusercontent.com",
)

@dataclass(frozen=True)
class BrowserProof:
    http_status: int
    mime: str
    final_url: str
    source: str
    byte_count: int
    sha256: str

@dataclass(frozen=True)
class BrowserResult:
    content: bytes
    proof: BrowserProof

class BrowserJobClient:
    def __init__(self, input_root: Path = Path("/browser-inputs"),
                 output_root: Path = Path("/browser-outputs"),
                 *, timeout_seconds: float = BROWSER_JOB_TIMEOUT_SECONDS,
                 cleanup_timeout_seconds: float = ACK_CLEANUP_TIMEOUT_SECONDS): ...
    def submit(self, identifier: str, cookie_json: bytes) -> BrowserResult: ...

def validate_browser_result(job_id: str, proof_path: Path, pdf_path: Path,
                            *, output_root: Path,
                            identifier: str) -> BrowserResult: ...
```

Create the input job directory with `uuid4().hex`, mode `0750` and shared GID
11000; write Cookie as `0640` and manifest as `0640`, then `fsync` and publish
each through same-directory `os.replace`; poll only the matching output
directory; use `lstat`/`O_NOFOLLOW`, one-link regular-file checks and bounded
reads; decode an exact `schema/job_id/identifier/proof` envelope with the
existing no-duplicate-key hook; independently bind the result to the request and
verify every proof field and PDF byte. Open the output root and exact job
directory with `O_DIRECTORY|O_NOFOLLOW`, then read both leaves from the same
pinned dirfd. Write `ack.json` into the input job after
consuming or rejecting output; wait boundedly for matching output removal; then
remove only the input directory beneath its resolved root. Never call unlink,
rmdir or replace against the read-only output root.

- [x] **Step 4: Verify GREEN and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- test_browser_protocol
git add apps/scansci-legal/src/scansci_legal/browser_protocol.py \
  apps/scansci-legal/src/scansci_legal/limits.py \
  apps/scansci-legal/test/test_browser_protocol.py
git commit -m "feat(scansci): define isolated browser job protocol"
```

Expected: protocol tests pass without starting Docker or a browser.

### Task 3B: Add the no-fallback Patchright adapter and browser worker

**Files:**
- Create: `apps/scansci-legal/src/scansci_legal/strict_browser.py`
- Create: `apps/scansci-legal/src/scansci_legal/browser_worker.py`
- Create: `apps/scansci-legal/test/test_strict_browser.py`
- Create: `apps/scansci-legal/test/test_browser_worker.py`

**Interfaces:**
- Consumes: Task 3A input job and the pinned ScanSci CARSI modules.
- Produces: `strict_visible_browser`, `install_strict_scansci_browser`,
  `capture_institutional_pdf`, one serial long-running worker and a passive
  `python -m scansci_legal.browser_worker --healthcheck` command.

- [x] **Step 1: Write failing adapter and worker tests**

Use fakes for Patchright/page/response and assert these calls:

```python
with strict_visible_browser(profile_dir, launcher=failing_launcher):
    raise AssertionError("unreachable")
assert failing_launcher.calls == 1
assert fallback_launcher.calls == 0
```

Assert source-signature or pinned-call-shape drift fails before launch; the
launcher receives executable `/usr/local/bin/scansci-chromium`, proxy
`http://openscience-egress:7891`, `DISPLAY=:99`, `headless=False`, and a fresh
profile. Assert no `channel`, downloaded executable, direct/proxy fallback, or
second launch exists. Response tests accept only browser-captured 2xx exact PDF
MIME, write `document.pdf` and `proof.json` atomically, and reject 403, 200 HTML,
wrong MIME, unsafe redirect, oversized/mismatched bytes and navigation-only
success. Worker tests prove one observed active job at a time, per-job profile removal,
process-group termination on timeout, crash-to-failure proof, acknowledgement
cleanup, and no orphaned Chromium/Xvfb child. Health tests accept only a regular
worker-owned `/tmp/scansci-browser-heartbeat` no older than 20 seconds and never
launch a browser or touch either job volume.

- [x] **Step 2: Verify RED**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- \
  test_strict_browser test_browser_worker
```

Expected: FAIL because both modules are absent.

- [x] **Step 3: Implement the fixed launcher and proof capture**

Expose these signatures:

```python
@contextmanager
def strict_visible_browser(profile_dir: Path, *, launcher=launch_strict_patchright):
    yield browser

def install_strict_scansci_browser(sources_module: object,
                                   carsi_module: object) -> None: ...

def capture_institutional_pdf(identifier: str, input_dir: Path,
                              output_dir: Path) -> BrowserProof: ...

def run_browser_worker(input_root: Path = Path("/browser-inputs"),
                       output_root: Path = Path("/browser-outputs")) -> None: ...

def browser_worker_is_healthy(heartbeat: Path =
                              Path("/tmp/scansci-browser-heartbeat"),
                              *, now: float | None = None) -> bool: ...
```

`launch_strict_patchright` imports `patchright.sync_api.sync_playwright`
directly and calls `chromium.launch_persistent_context` once with the fixed
executable/proxy/display/profile. Before replacing the pinned `_visible_browser`
used by `try_carsi`, `install_strict_scansci_browser` compares
`inspect.signature` and a normalized SHA-256 of the pinned source/call shape to
checked-in constants; drift raises `BrowserPolicyError`. Never invoke the pinned
fallback-capable `browser_backend.launch*` function.

Register a Chromium CDP response-stage interceptor before navigation and read
eligible bodies sequentially in 1 MiB chunks. Copy response bytes only when
status is 200–299 and `Content-Type` normalized before `;` is
`application/pdf`; validate final URL before writing. Cap each response at
100 MiB, each job at eight candidates/150 MiB total, and retain only proof
metadata after a response is fulfilled. Require the unique candidate length and
SHA-256 to match pinned ScanSci's exact successful output. Create browser-owned,
shared-GID 11000 mode `0640` PDF/proof from that response's status/MIME/final
URL, `CARSI-Browser`, byte count and SHA-256. The single controller observes the
legal-owned atomic manifest without renaming or writing the read-only input,
records one active job in memory, launches a fresh job subprocess with a new
process group, preserves the full 180-second CARSI execution window inside the
client's 210-second total window, and removes only its exact
output after a matching input-side acknowledgement. On startup it removes only
browser-owned incomplete/stale outputs older than the fixed 10-minute bound.
The controller atomically refreshes its owned mode-`0600` heartbeat every five
seconds; `--healthcheck` performs only owner/type/mode/timestamp validation and
returns 0/1 without reading jobs or starting Patchright.

- [x] **Step 4: Verify GREEN and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- \
  test_strict_browser test_browser_worker
git add apps/scansci-legal/src/scansci_legal/strict_browser.py \
  apps/scansci-legal/src/scansci_legal/browser_worker.py \
  apps/scansci-legal/test/test_strict_browser.py \
  apps/scansci-legal/test/test_browser_worker.py
git commit -m "feat(scansci): isolate institutional browser execution"
```

### Task 3C: Route institutional acquisition and gate session readiness on proof

**Files:**
- Modify: `apps/scansci-legal/src/scansci_legal/upstream.py`
- Modify: `apps/scansci-legal/src/scansci_legal/main.py`
- Modify: `apps/scansci-legal/src/scansci_legal/http_service.py`
- Modify: `apps/scansci-legal/src/scansci_legal/session.py`
- Modify: `apps/scansci-legal/src/scansci_legal/auth_login.py`
- Modify: `apps/scansci-legal/test/test_upstream.py`
- Modify: `apps/scansci-legal/test/test_http_service.py`
- Modify: `apps/scansci-legal/test/test_session.py`
- Create: `apps/scansci-legal/test/test_auth_login.py`

**Interfaces:**
- Consumes: `BrowserJobClient.submit` and strict browser proof.
- Produces: real institutional `AcquiredPdf` and proof-backed session lifecycle.

- [ ] **Step 1: Write failing integration/session tests**

Tests must prove OA still uses the existing browserless upstream worker; an
institutional request copies exactly one safe Cookie JSON and uses only
`BrowserJobClient`; `AcquiredPdf(route="institutional", source="CARSI-Browser")`
is constructed only after proof validation. Assert publisher-host return, five
valid-shaped Cookies, absent SSO redirect, 403 and HTML all remain
`auth_required`; only the fixed DOI `10.1016/j.physleta.2023.129241` with valid
browser proof publishes `ready`. Recreating `SessionManager` retains `ready`
while proof freshness is within 24 hours; a genuine institutional auth failure
returns to `auth_required`. Responses expose status/generation/reason only and
never proof URL, Cookie, account or password.

- [ ] **Step 2: Verify RED**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- \
  test_upstream test_http_service test_session test_auth_login
```

Expected: old Cookie-count/publisher-return behavior fails the new assertions.

- [ ] **Step 3: Implement the route and passive session state**

Add these session operations:

```python
VERIFIED_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60

def mark_verified_ready(self, verified_at: float) -> SessionSnapshot: ...
def mark_auth_required(self) -> SessionSnapshot: ...
def verified_ready(self, now: float) -> bool: ...
```

Replace `_validate_pinned_carsi_session` network probing with safe Cookie-file
shape plus bounded persisted proof freshness. For institutional requests,
snapshot one Cookie JSON, submit it through Task 3A, and map verified proof into
`AcquiredPdf`; OA behavior remains unchanged. On browser-auth failure mark the
session `auth_required`; on verified success refresh the timestamp. The auth
helper runs setup once, opens at most ten strict 180-second attempts, stages its
Cookie in a private temporary directory, exercises the fixed canary through the
same strict adapter, and atomically publishes Cookie plus `ready` state only
after proof validation. Exhaustion and first-launch failure fail closed.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- \
  test_upstream test_http_service test_session test_auth_login
git add apps/scansci-legal/src/scansci_legal apps/scansci-legal/test
git commit -m "fix(scansci): require real institutional PDF proof"
```

### Task 3D: Build the separate CPU browser image

**Files:**
- Create: `apps/scansci-legal/browser-requirements.lock`
- Create: `apps/scansci-legal/Dockerfile.browser`
- Create: `apps/scansci-legal/browser-entrypoint.sh`
- Modify: `apps/scansci-legal/Dockerfile.auth`
- Modify: `apps/scansci-legal/chromium-container-wrapper.sh`
- Modify: `apps/scansci-legal/test/test_dockerfile.py`

**Interfaces:**
- Consumes: Task 3B worker and strict adapter.
- Produces: source-labelled `openscience-scansci-browser:<release-sha>` running
  as fixed `10002:11000`; auth remains `10001:10001` and stopped by default.

- [ ] **Step 1: Write failing static image-contract tests**

Assert the browser image has pinned Python/base packages; only Chromium,
fonts, tini and Xvfb (no noVNC/x11vnc/websockify); fixed UID/GID; browser role
label; read-only-compatible paths including `/browser-profile-jobs`; no
service/session Secret or volume. Assert
the auth image alone retains noVNC and imports the shared exact-hash Patchright
lock. Assert wrapper has proxy/QUIC/WebRTC controls and no `latest`, downloaded
browser, channel fallback or direct egress option.

- [ ] **Step 2: Verify RED**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- test_dockerfile
```

Expected: FAIL because `Dockerfile.browser` and the shared lock do not exist.

- [ ] **Step 3: Implement the image and entrypoint**

Move the existing exact hashes for `greenlet==3.5.5`, `pyee==13.0.0`,
`patchright==1.62.2`, and `typing-extensions==4.16.0` into
`browser-requirements.lock`; install it with `pip --require-hashes` in browser
and auth images. `browser-entrypoint.sh` starts private `Xvfb :99`, traps
TERM/INT/EXIT, waits for the display, then execs
`python -m scansci_legal.browser_worker`. It never starts noVNC or exposes a
port. Keep the wrapper fixed to `/usr/bin/chromium` and the internal Squid proxy.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx pnpm@9.15.0 --filter @openscience/scansci-legal test -- test_dockerfile
git add apps/scansci-legal
git commit -m "feat(scansci): add hardened CPU browser image"
```

Local Docker remains forbidden; the first image build occurs on ECS in Task 10.

### Task 4: Integrate ScanSci into production Compose and immutable release recovery

**Files:**
- Modify: `.env.example`
- Modify: `infra/compose/docker-compose.prod.yml`
- Modify: `infra/compose/docker-compose.dev.yml`
- Modify: `infra/compose/docker-compose.prod.test.mjs`
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
- Consumes: Tasks 1–3D legal/browser/auth images, session path and browser-job protocol.
- Produces: SHA-tagged legal/browser images, stopped auth profile, stable
  Secret/session resources, opposite-direction tmpfs jobs, deploy/rollback/
  retention support and runtime verifier.

- [ ] **Step 1: Write failing topology, Secret and rollback tests**

Assert: legal has no host port/data network/database/storage env; browser has no
host port/service token/session/data/app/auth network/Docker socket/host mount;
both are non-root, read-only, cap-drop and PID/CPU/RAM bounded. Require legal UID
10001, browser UID 10002, shared read-only GID 11000, input volume legal-RW/
browser-RO and output volume browser-RW/legal-RO. Require both volumes to be
named local-driver tmpfs with `size=128m` and no durable host path. Auth is
profile-only and loopback; session volume is named; credential files use fixed
paths. Require a third browser-only non-persistent profile tmpfs at
`/browser-profile-jobs`, `size=256m`, UID 10002/GID 11000/mode 0700. Deploy
builds and starts browser before legal and Agent Worker; catchable
failure restores the exact prior legal/browser images or stops them when the
previous release lacks them; retention keeps active+rollback legal/browser/auth
tags; no broad prune appears.

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

Keep `scansci-legal` on `retrieval_net` and add `scansci-browser` on that network
only. Create volumes with these exact ownership/direction contracts:

```yaml
volumes:
  scansci-browser-inputs:
    driver: local
    driver_opts: {type: tmpfs, device: tmpfs, o: "size=128m,uid=10001,gid=11000,mode=0750"}
  scansci-browser-outputs:
    driver: local
    driver_opts: {type: tmpfs, device: tmpfs, o: "size=128m,uid=10002,gid=11000,mode=0750"}
  scansci-browser-profiles:
    driver: local
    driver_opts: {type: tmpfs, device: tmpfs, o: "size=256m,uid=10002,gid=11000,mode=0700"}
```

Legal mounts inputs RW and outputs RO; browser mounts inputs RO and outputs RW.
Both add GID 11000. Browser runs `10002:11000`, read-only, `cap_drop: [ALL]`,
`security_opt: [no-new-privileges:true]`, `pids_limit: 256`, `mem_limit: 1g`,
`cpus: 1.0`, private `/tmp` plus `/dev/shm` tmpfs, and the browser-only profile
tmpfs mounted at `/browser-profile-jobs`. It receives only fixed
proxy/display/job-root environment. Its healthcheck is exactly
`python -m scansci_legal.browser_worker --healthcheck`; legal depends on that
health. Keep the
auth profile helper at `127.0.0.1:6080` with the named `scansci-session` volume
and fixed host-file Secrets mounted only by legal.

Build browser, legal and auth alongside Worker/Parser; verify source label,
image ID, health/policy and job-mount direction before Worker switch; restore or
stop both release services in rollback; bind active/rollback legal/browser/auth
images in retention.

`verify-scansci-runtime.mjs` must verify source/archive/dependency hashes, three
role labels and exact image IDs; UIDs, mounts, networks, ports, limits and fixed
strategy/flags; service-token/session presence only in legal; opposite job mount
directions; browser process list contains private Xvfb plus worker and no noVNC;
auth process list contains loopback noVNC only while explicitly running; session
state and absence of grey/Tor/direct-fallback environment without printing
values.

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
canonical SSH path. Generate a random service token. Do not create username or
password files: the Zhejiang University account is entered only inside the
isolated noVNC page. Verify service-token key name, owner and mode only.

- [ ] **Step 3: Build and preflight on ECS without switching production**

Materialize the merged SHA, run the full server build, build legal/browser/auth,
Worker/Parser/embedding images, run Parser acceptance, run ScanSci source-lock/
policy/OA canary, inspect browser image packages/process entrypoint, and verify
the current active/public release is unchanged.

- [ ] **Step 4: Canonically deploy and verify rollback**

Set `ACTIVE_SHA` from the locked preflight and `MERGED_SHA` from merged main,
then run `deploy.sh --confirm --require-parser-acceptance --rollback-ref
"$ACTIVE_SHA" "$MERGED_SHA"` through `C:/Program Files/Git/bin/bash.exe`. Require core/search
migration status, ScanSci/Parser/BGE/runtime identity, all containers, Nginx,
public release, journal clear and active/rollback retention.

- [ ] **Step 5: Complete the one-time Zhejiang University CARSI login**

2026-09-01 correction: the first attempt is not accepted. Pinned ScanSci treated
a ScienceDirect 403 publisher page and five Cookies as login success; real
article/PDF probes returned 403 and production state reverted to
`auth_required`. The approved strict gate requires DOI
`10.1016/j.physleta.2023.129241` to return a browser-captured 2xx
`application/pdf` whose bytes begin `%PDF-` and match the bounded proof before
the staged Cookie JSON may publish and session status may become `ready`.

Start only the auth profile, start the checked-in loopback SSH tunnel, set the
validated local port as `SCANSCI_LOCAL_PORT`, and open
`http://127.0.0.1:$SCANSCI_LOCAL_PORT/vnc.html?autoconnect=true&resize=remote` for the operator. The operator types credentials
inside the isolated browser. Stop the tunnel/helper after session status becomes
`ready`; verify the Cookie JSON/session metadata volume survives helper and
service recreation. Before showing the link, prove HTTP and RFB readiness. Leave
one 180-second upstream attempt unattended and require the bounded wrapper to
reopen the next attempt without rerunning setup; the operator has at most ten
attempts and canonical stop must still end the helper immediately. Inspect
bounded logs to prove they contain no account/password/Cookie/proof URL.

- [ ] **Step 6: Run real OA and institutional acquisitions**

Use arXiv `2009.06045v1` for OA and DOI
`10.1016/j.physleta.2023.129241` for the institutional route. Require the OA
source to stay browserless. Require institutional source `CARSI-Browser`, the
browser-originated 2xx status, exact normalized PDF MIME, allowlisted final URL,
byte count and SHA-256 to match independently validated `%PDF-` bytes. Then
verify response route/headers, ClamAV, temporary object, rights and zero grey/Tor
audit events. OA fallback cannot satisfy the institutional acceptance.

- [ ] **Step 7: Prove all four product entries**

Run real Chromium against production for Dashboard/Personal Space, Hermes drawer,
RO Hermes, and RO Files/Evidence. Each must create/reuse the unified task and
yield a working one-use download; no provider/mode/account UI or console error.

- [ ] **Step 8: Prove lifecycle, restart persistence and failure recovery**

Verify replay 404, exact 72-hour expiry/real Worker GC, bytes absent and
provenance retained. Recreate both `scansci-browser` and `scansci-legal` and
prove the persistent session remains `ready` while the two tmpfs job volumes
contain no stale job.
Force a bounded auth-required fake through the isolated acceptance path and
verify administrator notification plus metadata fallback without touching the
real session.

- [ ] **Step 9: Perform exact hygiene and disk audit**

Remove only acceptance users/ROs/tasks/objects, the auth helper, tunnel process,
exact empty browser-job tmpfs volumes after dependent containers stop, failed
candidate roots/images and bounded evaluation directories. Retain the production
session volume and active/rollback legal/browser/auth images. Inventory `/opt`,
Docker images/volumes/cache and root bytes before/after; no broad prune.

- [ ] **Step 10: Close Task 10 and merge docs-only handoff**

Set Task 10 done and metadata 10/12 only after every production gate passes.
Update CURRENT spec/plan/progress/handoff/runbooks/index, run Markdown/docs-sync/
diff gates, commit, PR, exact CI and merge. Final report must distinguish
repository main/docs HEAD from application release and state Task 11 as next.

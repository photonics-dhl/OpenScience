# ScanSci Default Literature Acquisition Capability Design

> Status: APPROVED / STRICT BROWSER IMPLEMENTATION PLAN READY
> Date: 2026-08-30
> Strict browser extension approved: 2026-09-01
> Owner: Hermes literature acquisition capability
> Upstream: `scansci-pdf` 1.11.0, commit `7017814758f826ea21470a609890a7d3ca374b8e`

The 2026-09-01 extension supersedes any claim that returning to a publisher
hostname, saving several Cookies, or receiving HTTP 403 establishes a usable
institutional session. `ready` now requires a bounded, non-OA subscription
canary to return real PDF bytes through the same CPU browser boundary used by
production acquisition.

## 1. Outcome

Hermes gains a server-side default capability that can retrieve a paper PDF by
DOI or arXiv identifier without asking the end user to choose a provider or
authentication mode. A single operator-owned Zhejiang University CARSI session
is persisted on the ECS and reused by Hermes. Open-access sources remain the
first route; the institutional session is the automatic fallback.

The capability must work from Dashboard/Personal Space, Hermes, the RO Hermes
surface, and RO Files/Evidence. Every entry point uses one backend acquisition
contract and the existing temporary-document/download lifecycle. The account,
password, publisher Cookie files, service token, object key, and provider raw
response never enter a public DTO, user browser, Hermes prompt, database row, or
production log.

## 2. Fixed decisions

1. This completes reopened Taskmaster `hermes-research-intelligence` Task 10.
   Task 11 must not start until the production acceptance in this document is
   complete.
2. Authentication is operator-owned and platform-wide. The user performs the
   first Zhejiang University CARSI login once; the resulting session becomes a
   default Hermes capability.
3. Publisher Cookie persistence is primary. Username/password storage is
   disabled; MFA/CAPTCHA and expired sessions require operator intervention.
4. `legal_only` is mandatory. `scihub_enabled=false`, `use_tor=false`, and no
   LibGen/SciBban/Sci-Hub route may execute. The upstream Docker Compose is not
   reused because it starts Tor and exposes the upstream MCP surface.
5. The service accepts only a bounded DOI or arXiv identifier. It never accepts
   an arbitrary download URL, callback URL, browser cookie, provider choice, or
   rights verdict from a user or AgentTask payload.
6. PDF bytes remain private, Workspace-scoped temporary objects with an exact
   72-hour TTL. Download uses the existing maximum-600-second HttpOnly one-use
   capability and membership/rights/hash checks.
7. Ordinary users never see an institution-login prompt. An expired session
   yields a bounded recoverable state and an administrator notification.
8. All runtime installation is release-scoped on the ECS. Nothing is installed
   globally on the host, in a user home directory, or in the source checkout.
9. After the unified acquisition endpoint ships, browser clients may not submit
   `source.retrieve` directly through generic `/agent/tasks`. The API rejects
   that public path so callers cannot restore provider/mode controls; the
   literature endpoint calls the Domain task service with a server-owned payload.

## 3. Runtime architecture

### 3.1 `scansci-legal` service

Add a focused Python service under `apps/scansci-legal/`. Its release image is
built from a source-locked ScanSci archive and exposes only:

- `GET /healthz`: process health without credential or session detail;
- `GET /v1/session/status`: service-token-protected state for Agent Worker and
  administrator diagnostics;
- `POST /v1/legal-download`: service-token-protected bounded PDF acquisition.

The upstream MCP/Web/CLI HTTP surface is not exposed. The service has no core or
search database credentials, Redis credentials, object-storage credentials,
Docker socket, application signing key, or host mount. It receives the ScanSci
service token plus CARSI session material only.

The container runs as a fixed non-root UID, read-only root filesystem, dropped
capabilities, `no-new-privileges`, bounded PID/CPU/RAM, and a bounded `/tmp`
tmpfs. It contains no Chromium, Patchright, Xvfb or browser driver. It receives
the service token and persistent publisher Cookie volume, so it must never
execute publisher-controlled browser code.

For an institutional request the legal service copies the bounded Cookie JSON
and fixed DOI job manifest into a dedicated input tmpfs mounted read-write here
and read-only by `scansci-browser`. It reads browser output through a different
output tmpfs mounted read-only here and read-write only by the browser worker.
The service cannot create or modify a browser proof/PDF output. It joins the
existing retrieval network for OA access and the fixed internal browser job
boundary, but exposes no browser endpoint or host port.

### 3.2 `scansci-browser` worker

Add one release-scoped internal worker image containing CPU Chromium,
Patchright, private Xvfb and the fail-closed Chromium proxy wrapper. It runs as
a different fixed non-root UID from `scansci-legal`, with a read-only root,
dropped capabilities, `no-new-privileges`, one CPU, 1 GiB RAM, 256 PIDs and
bounded `/tmp`/`/dev/shm`. It has no noVNC, x11vnc, Websockify, host port,
service token, persistent Cookie/session mount, database/Redis/object-storage
Secret, Docker socket, host mount, app/data/auth network or persistent browser
profile.

The worker mounts only browser-job inputs read-only and browser-job outputs
read-write. Both are size-bounded named tmpfs volumes; separate fixed UIDs and
read-only shared groups give legal-owned input files to the browser as read-only
and browser-owned output files to legal as read-only. Their opposite mount
directions prevent the outer legal service from forging an output and prevent
the browser worker from changing the supplied Cookie snapshot. One long-running
controller polls atomic job manifests, serializes all work, launches one fresh
browser profile per request and removes output only after an input-side
acknowledgement. Crash recovery marks an incomplete pair failed; the browser
deletes only its output half and the legal service deletes only its input half,
both by exact job ID and bounded age.

The project adapter must not call pinned ScanSci's fallback-capable
`browser_backend.launch*` path. It first verifies the exact pinned signatures and
launch call shape, then replaces the `_visible_browser` launch point used by
`try_carsi` with direct Patchright startup using the fixed executable wrapper,
proxy, display and ephemeral profile. No channel or bundled-browser fallback is
allowed. Wrapper failure, missing executable, source drift or first-launch
failure is final and leaves `auth_required`; a second browser path must not run.

### 3.3 Authentication helper

Add a release-scoped `scansci-auth` Compose profile. It is stopped by default
and starts only for initial login or explicit repair. Its browser UI listens
only inside the container at fixed `172.25.0.2:6080`; Compose publishes no host
port. The canonical local SSH forward targets that container address directly.
The container is the sole peer on a dedicated internal `172.25.0.0/29`
authentication network, uses only the fixed Squid HTTPS gateway, and shares only
the ScanSci session volume with
`scansci-legal`; it mounts no account or service Secret. x11vnc is IPv4-only.
The fixed `xgs-auth0` bridge allows only the exact established return flow from
`.2:6080` to `.1` plus auth traffic to Squid `.1:7891`, and rejects every other
host address and port; ordinary application containers share no network with
the passwordless noVNC endpoint.

The product-owned strict adapter starts Patchright directly with the fixed
container wrapper; it does not trust pinned ScanSci's config propagation or
bundled/channel fallback. The wrapper removes conflicting proxy switches,
disables Chromium's unavailable inner sandbox only inside the hardened outer
container, and blocks QUIC/non-proxied WebRTC. Startup succeeds only after
noVNC HTML, WebSocket/RFB, Chromium argv, PID headroom and the complete
container/network contract all pass.

The helper is removed after login. The session volume remains. Restarting or
recreating `scansci-legal` must not invalidate the publisher Cookie files. No public Nginx or
Cloudflare route is created for the login browser.

The pinned upstream CARSI flow owns a fixed 180-second interactive window and
does not expose a timeout option. Its built-in detector considers any return to
the publisher hostname successful, including a publisher HTTP 403 page; that
predicate is forbidden as a product acceptance signal. The operator wrapper
runs setup once, then opens at most ten bounded visible-browser attempts inside
the same isolated helper. Each attempt uses an auth-container tmpfs staging
profile and may carry its staged publisher Cookies into the next bounded attempt.

An attempt is successful only when the fixed non-OA subscription canary
`10.1016/j.physleta.2023.129241` resolves through Zhejiang University CARSI and
returns browser-originated proof containing a 2xx publisher response,
normalized `application/pdf` MIME, allowlisted final HTTPS URL and institutional
source label, byte count and SHA-256. The auth parent independently verifies
`%PDF-`, size and hash. Only then may the wrapper atomically
publish the staged publisher Cookie JSON as UID 10001 mode `0600`, publish
`ready` with the proof timestamp, and exit. A 403 page, publisher hostname,
Cookie count, browser title or redirect absence never passes. Exhaustion,
Cloudflare challenge failure, setup/launcher error or invalid PDF publishes
`auth_required` without promoting staged state. Canonical stop may terminate
the helper at any time. The retry loop does not log browser output, credentials,
Cookie values, SAML/OAuth URLs or publisher response bodies, and it is bounded
rather than a permanent background browser.

### 3.4 Secret and session storage

- Stable secret root: `/opt/openscience-secrets/scansci/`, owner `root:root`,
  directory mode `0700`, files mode `0600`.
- Allowed provisioner input: internal service token only. Username, password
  and session-bootstrap fields are rejected because this flow does not consume
  them.
- Runtime mount: the legal service and Worker receive distinct read-only token
  mounts; the authentication browser receives none. Values are never
  interpolated into a shell command, Compose output, health response, task
  error, or audit metadata.
- Publisher cookies: a dedicated named volume mounted only by
  `scansci-legal` and the stopped-by-default auth helper. Pinned ScanSci may
  create JSON/Netscape files in auth tmpfs, but only a strict-PDF-verified staged
  JSON file may replace the active publisher JSON. The design does not claim a
  persistent Chromium profile, localStorage, or generic browser-state snapshot.
- Database: stores no account, password, Cookie, SAML assertion, CARSI token, or
  browser-profile path.
- Browser jobs: the input/output tmpfs volumes are not session storage. The
  browser worker receives one copied Cookie JSON through its read-only input and
  has no mount path to the persistent Cookie or service token. Outputs contain
  one PDF and one bounded proof, never credentials or raw response bodies.

Password storage is disabled. The operator enters credentials only into the
remote CARSI page. If cookie-state reuse later proves insufficient, any
credential automation requires a separate reviewed design rather than silently
mounting account material into an unsandboxed browser.

### 3.5 Institutional browser data path

The existing `POST /v1/legal-download` contract and `try_carsi` source remain
the only institutional entry; no public API or database contract is added. For
an institutional request:

1. `scansci-legal` copies only bounded, regular, non-symlink publisher Cookie
   JSON into a random exact job directory owned by UID 10001/shared GID 11000;
   the request-local copy and manifest are group-readable mode `0640` on the
   read-only browser mount. It atomically publishes a strict `legal_only`
   manifest containing the validated DOI, never an arbitrary URL;
2. `scansci-browser` reads that immutable input and creates a fresh profile;
3. the project adapter gives direct Patchright only the fixed wrapper,
   `openscience-egress:7891` proxy, `DISPLAY`, job home and non-secret locale;
4. pinned DOI resolution and `try_carsi` run only after the adapter's exact
   source-compatibility guard passes; raw network egress remains impossible;
5. the browser response callback alone may construct browser-owned/shared-group
   mode `0640` output. `proof.json` is an exact
   `schema/job_id/identifier/proof` envelope that binds the result to the
   manifest; its nested browser proof contains exact `http_status`, normalized
   `mime`, final URL, source label, byte count and SHA-256 while atomically
   writing the captured PDF;
6. `scansci-legal`, which cannot write the output volume, independently checks
   the proof schema, 2xx status, exact PDF MIME, institutional source and public
   HTTPS allowlist, then streams and rechecks magic, bounded size and SHA-256;
7. the legal service acknowledges the exact job only after consuming or
   rejecting it; each owner deletes only its writable half; and
8. timeout or failure terminates the complete browser process group and removes
   the private profile/output without changing the persistent Cookie.

The `application/pdf` header created by `scansci-legal` is delivery metadata,
not institutional evidence. It cannot substitute for the browser-originated
publisher status/MIME proof. A 403, 200 HTML, missing/wrong MIME, hash mismatch,
forged/unknown source, only outer MIME or absent proof always fails closed.

### 3.6 Rejected alternatives

- Requests-only CARSI is rejected: both ECS direct egress and the optional home
  tunnel returned publisher HTTP 403, and pinned `try_carsi` is browser-backed.
- Reusing the noVNC auth helper for production downloads is rejected because it
  is operator-visible, stopped by default and has no internal acquisition API.
- Embedding Chromium in `scansci-legal` is rejected. The same UID/container
  would expose the service token and persistent Cookie mount to a `--no-sandbox`
  browser; environment cleanup is not an isolation boundary.
- A browser HTTP microservice with another bearer token is rejected. The
  opposite-direction job volumes provide a smaller internal contract without a
  network endpoint or another persistent credential.

## 4. Internal service contract

`POST /v1/legal-download` accepts the exact strict JSON body already emitted by
the Agent Worker adapter:

```json
{
  "identifier": "10.1234/example",
  "strategy": "legal_only",
  "scihub": false,
  "tor": false,
  "institutional": true,
  "subject_id": "64-lowercase-hex-characters"
}
```

Unknown fields, alternate strategies, `scihub=true`, `tor=true`, arbitrary
URLs, malformed identifiers, invalid subjects, duplicate JSON keys, and bodies
over 4 KiB are rejected before an upstream call. The bearer service token is
constant-time verified.

Success returns `application/pdf` with a bounded body no larger than 100 MiB
and these required headers:

- `x-scansci-route`: `open_access`, `publisher_api`, or `institutional`;
- `x-scansci-public-url`: canonical HTTPS source or publisher landing URL;
- `x-scansci-license`: required when a cacheable OA license is claimed;
- institutional only: `x-scansci-entitlement=verified`, the exact input subject
  in `x-scansci-entitlement-subject`, and a future bounded
  `x-scansci-entitlement-valid-until`.

The service verifies PDF magic, declared and streamed size, final URL, route
allowlist, and source label before returning bytes. Grey-source labels are a
hard block even if upstream reports success.

Failure responses contain only stable codes: `auth_required`, `not_entitled`,
`not_found`, `rate_limited`, `invalid_pdf`, `upstream_timeout`,
`upstream_unavailable`, or `policy_blocked`. Query text, account data, cookies,
publisher body, local paths, and raw exceptions are excluded.

## 5. Session lifecycle

The service maintains `ready`, `refreshing`, `auth_required`, and `disabled`
session states. `ready` means a strict institutional PDF proof succeeded within
the bounded 24-hour publisher-Cookie lifetime and the stored artifact still
passes ownership, mode, schema, count, size and freshness checks. Routine status
reads are passive and never hit a publisher or download a PDF. The broken pinned
homepage probe is not used: ScienceDirect may return 403 without an SSO redirect
even when the browser flow is the only viable path.

A successful institutional production download refreshes the proof timestamp.
An actual login redirect, browser challenge exhaustion, missing/unsafe Cookie
artifact or expired proof changes the state to `auth_required`. Recreating the
legal container reloads the verified proof from the named volume; the mere
presence of Cookie bytes never reconstructs `ready` after an actual failure.

When a download encounters a real authentication redirect:

1. one single-flight state transition runs;
2. a concurrently published newer verified generation may be reloaded;
3. otherwise the operator is notified that interactive CARSI repair is required;
4. MFA/CAPTCHA, 403/challenge exhaustion or invalid PDF keeps
   `auth_required`;
5. queued tasks fail with the bounded recoverable code and an administrator
   notification is created;
6. ordinary user requests do not receive a CARSI URL or credential prompt.

Repeated auth failures use backoff and never loop credentials against the IdP.
The operator can run the auth profile again without redeploying the application.

## 6. Unified product entry contract

Add `POST /literature/acquisitions` as the only browser-facing acquisition
entry. Its strict request is:

```json
{
  "query": "attosecond electron dynamics",
  "identifier": "10.1234/example",
  "target": {
    "kind": "personal"
  }
}
```

or a target of
`{"kind":"research_object","researchObjectId":"<uuid>"}`. The endpoint is
authenticated, CSRF/rate/AI-credit guarded, requires an idempotency key, and
returns `202` with the existing AgentTask/session/RO identities. It never accepts
providers, credentials, strategy, object keys, URLs, or an authorization flag.

For `personal`, the server creates or reuses one private system-labelled
“Personal Literature Library” RO in the user's existing personal Workspace with
a server-owned immutable idempotency identity. For `research_object`, existing
Workspace membership and RO access checks apply. The endpoint creates/reuses a
retrieval AgentSession and submits the existing `source.retrieve` task through
the Domain service with server-owned provider selection. Generic public
`/agent/tasks` submission of this task kind is rejected. An identifier triggers
ScanSci full-text acquisition; query-only requests return metadata results whose
download actions resubmit the selected identifier through the same endpoint.

All consumers poll `GET /agent/tasks/:id`; successful results reuse the current
`temporaryDocumentId` and download-link endpoints. No second storage or signed
link implementation is introduced.

## 7. Entry-point behavior

| Entry | User action | Target | Backend behavior |
|---|---|---|---|
| Dashboard / Personal Space | Search title/DOI/arXiv; select “Get full text” | personal library RO | Query-only or identifier acquisition through `/literature/acquisitions` |
| Hermes drawer | Natural-language “find/download this paper” or result action | active RO when present, otherwise personal | Hermes resolves or asks the user to select an identifier, then calls the same endpoint |
| RO Hermes page | Find evidence/full text | current RO | Membership-bound acquisition and Evidence/source association |
| RO Files / Evidence | “Get full text” beside a DOI/source | current RO | Identifier acquisition; successful temporary PDF appears with expiry/download state |

No surface displays “ScanSci mode”, “OA mode”, “institution mode”, provider
credentials, or the CARSI session. Identical task states and error language are
used everywhere.

## 8. Data and rights flow

1. API validates user, target, idempotency key, query/identifier, and quota.
2. Domain resolves the personal library RO or checks the requested RO.
3. Agent Worker runs metadata providers and ScanSci using a server-derived
   institutional subject fingerprint.
4. `scansci-legal` tries legal OA/publisher APIs first, then the persistent
   institutional session.
5. Worker rejects non-allowlisted routes, oversized/non-PDF bytes, invalid
   source URLs, expired/mismatched entitlement subjects, and missing OA rights.
6. ClamAV scans accepted bytes; object storage writes by bounded private key;
   database activation happens only after size/hash `HEAD` verification.
7. Source, rights, query HMAC, content hash, route, parser provenance, and
   locator remain after the real Worker GC deletes bytes at 72 hours.
8. Users obtain a one-use download only after current membership, rights,
   expiry, size, and hash are rechecked.

## 9. Security and resource gates

- No arbitrary URL input; DOI/arXiv only closes the primary SSRF surface.
- Redirects must remain HTTPS and resolve outside loopback, private, link-local,
  multicast, metadata, and documentation-only networks.
- The service token and session credentials are separate. Compromise of the
  Agent Worker service token does not reveal the CARSI session or password.
- `scansci-browser` is a separate UID/container with no service-token or
  persistent-session mount. Legal input is read-only there; browser proof/PDF
  output is read-only in `scansci-legal`.
- Logs contain identifier hash, bounded route/status/latency/size and request
  ID only. They exclude query text, PDF bytes/text, credentials, cookies, URLs
  containing credentials, and upstream response bodies.
- Per-user, per-Workspace, per-publisher, and global concurrency/rate caps apply.
  One request cannot start unbounded upstream races or browser processes.
- The project adapter directly starts the fixed Patchright executable wrapper.
  Pinned channel, bundled executable, second-launch and proxy fallback paths are
  disabled and regression-gated.
- The auth browser is stopped outside login/repair and is loopback-only while
  running. No credential UI is reachable through public Nginx/Cloudflare.
- Build and runtime contracts fail if Tor proxy variables, grey-source enable
  flags, host ports, data-network membership, writable rootfs, Docker socket,
  or production database/object-storage Secrets appear in either service; they
  also fail if the browser worker gains the token/session mounts or the job
  volume directions drift.

## 10. Testing and production acceptance

### Automated gates

- Contract tests for strict request/response fields, service-token validation,
  body limits, stable errors, subject binding, and unknown-field rejection.
- Source-policy tests proving every grey label and every non-`legal_only`
  strategy fails before bytes leave the service.
- SSRF/redirect/DNS rebinding tests and streamed response-size cancellation.
- Session state/single-flight/backoff tests with Secret redaction assertions.
- Red-to-green auth tests proving publisher-host return, five valid-shaped
  Cookies, HTTP 403 and absent SSO redirect all remain `auth_required`, while
  only the fixed institutional canary's PDF evidence publishes `ready`.
- Browser-runtime tests for separate UID/mount/network topology, immutable
  request-local Cookie input, output-only browser proof, one-at-a-time launch,
  timeout process-group cleanup, no orphaned Chromium/Xvfb children, and no
  noVNC/host port on either production service.
- Launch-failure tests force the fixed wrapper's first start to fail and prove
  no bundled/channel/second browser, direct connection or `ready` transition.
- Proof-contract tests require browser-captured 2xx status, exact normalized PDF
  MIME, allowlisted final URL/source, byte count and SHA-256. They reject 403,
  200 HTML, wrong MIME, magic/hash/size mismatch, forged source and outer-only
  `application/pdf`.
- Domain/API tests for personal target creation/reuse, RO authorization,
  idempotency, provider invisibility, query-only results, identifier download,
  and cross-Workspace denial.
- Web tests for all four entry points, consistent task state, keyboard/accessibility
  behavior, and absence of provider/auth mode controls.
- Existing temporary-document link, replay, checksum, rights and GC suites remain
  mandatory.

### ECS acceptance

1. Exact CI and canonical immutable deploy with active/rollback identities.
2. Build the source-locked `scansci-legal`, `scansci-browser` and auth-helper
   images on the CPU ECS; verify separate UID, non-root/read-only/resource/
   network/Secret topology and opposite-direction job mounts.
3. Complete one Zhejiang University CARSI login through the loopback SSH tunnel;
   verify the helper remains open on publisher 403 and only exits after the fixed
   subscription canary returns an institutional `%PDF-`; verify account/password/
   Cookie values never appear in logs or responses.
   Leave one attempt unattended to prove the wrapper reopens the upstream
   180-second window without rerunning setup or dropping the helper.
4. Recreate `scansci-legal`; session status must remain `ready` without another
   login.
5. Download one real OA PDF and one real Zhejiang University institutional PDF
   through the production service. The institutional result must be a browser
   source rather than OA fallback and must match route, entitlement subject,
   browser-originated status/MIME/final URL, magic, bounded size and SHA-256.
6. Prove Dashboard/Personal Space, Hermes drawer, RO Hermes, and RO Files/Evidence
   all reach the unified API and yield a usable product download.
7. Prove exact bytes/hash, one-use replay rejection, authorization boundaries,
   and the real 72-hour/Worker-GC provenance result.
8. Prove grey-source/Tor call count zero from service audit and runtime topology.
9. Remove only exact acceptance rows/objects/login helper/transient roots; retain
   the persistent session volume, active/rollback images, audit, rights and
   source provenance required for production.

## 11. Failure, rollback, and hygiene

If ScanSci is unhealthy or `auth_required`, metadata search, RO reading,
uploads, parser/OCR, and existing downloads remain available. Hermes returns a
source link and a recoverable acquisition state rather than failing the whole
research task.

Rollback disables `SCANSCI_ENABLED`, restores the previous Agent Worker/API/Web
release, stops/removes only the exact `scansci-legal`, `scansci-browser` and
auth-helper containers, and preserves the session volume unless the operator
explicitly revokes it. The two bounded browser-job tmpfs volumes contain no
durable state and may be removed only by exact release identity after containers
stop. Credential/session revocation is independent of application rollback.

Production retention keeps current and rollback application images plus current
legal/browser/auth images and one persistent session volume. Failed candidate
images, login containers, browser jobs/downloads, temp profiles, evaluation
roots, and BuildKit residue are inventoried and removed by exact identity only;
no broad Docker or filesystem prune is allowed.

## 12. Evidence sources

- ScanSci upstream pinned tree:
  <https://github.com/Rimagination/scansci-pdf/tree/7017814758f826ea21470a609890a7d3ca374b8e>
- Zhejiang University CARSI entry:
  <https://libdb.zju.edu.cn/s/lib/libtb/show/1886>
- Zhejiang University off-campus access guide:
  <https://libweb.zju.edu.cn/56334/list.htm>

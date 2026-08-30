# ScanSci Default Literature Acquisition Capability Design

> Status: APPROVED DESIGN / WRITTEN-SPEC REVIEW PENDING
> Date: 2026-08-30
> Owner: Hermes literature acquisition capability
> Upstream: `scansci-pdf` 1.11.0, commit `7017814758f826ea21470a609890a7d3ca374b8e`

## 1. Outcome

Hermes gains a server-side default capability that can retrieve a paper PDF by
DOI or arXiv identifier without asking the end user to choose a provider or
authentication mode. A single operator-owned Zhejiang University CARSI session
is persisted on the ECS and reused by Hermes. Open-access sources remain the
first route; the institutional session is the automatic fallback.

The capability must work from Dashboard/Personal Space, Hermes, the RO Hermes
surface, and RO Files/Evidence. Every entry point uses one backend acquisition
contract and the existing temporary-document/download lifecycle. The account,
password, browser profile, cookies, service token, object key, and provider raw
response never enter a public DTO, user browser, Hermes prompt, database row, or
production log.

## 2. Fixed decisions

1. This completes reopened Taskmaster `hermes-research-intelligence` Task 10.
   Task 11 must not start until the production acceptance in this document is
   complete.
2. Authentication is operator-owned and platform-wide. The user performs the
   first Zhejiang University CARSI login once; the resulting session becomes a
   default Hermes capability.
3. Session/profile persistence is primary. Username/password storage is
   optional and used only when an upstream-supported non-interactive refresh is
   necessary. MFA/CAPTCHA still requires operator intervention.
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
capabilities, `no-new-privileges`, bounded PID/CPU/RAM, and a bounded tmpfs for
one acquisition. It joins a dedicated retrieval network shared only with Agent
Worker and an egress network needed for DOI, OA, CARSI, and publisher traffic.
It has no host port.

### 3.2 Authentication helper

Add a release-scoped `scansci-auth` Compose profile. It is stopped by default
and starts only for initial login or explicit repair. Its browser UI binds to
`127.0.0.1` and is reached through the canonical SSH path plus a local port
forward. It shares only the ScanSci session volume with `scansci-legal`.

The helper is removed after login. The session volume remains. Restarting or
recreating `scansci-legal` must not invalidate the profile. No public Nginx or
Cloudflare route is created for the login browser.

### 3.3 Secret and session storage

- Stable secret root: `/opt/openscience-secrets/scansci/`, owner `root:root`,
  directory mode `0700`, files mode `0600`.
- Allowed files: service token, optional username, optional password, and a
  session-bootstrap key if required by the wrapper.
- Runtime mount: read-only Secret mounts; values are never interpolated into a
  shell command, Compose output, health response, task error, or audit metadata.
- Browser profile/cookies: a dedicated named volume mounted only by
  `scansci-legal` and the stopped-by-default auth helper.
- Database: stores no account, password, Cookie, SAML assertion, CARSI token, or
  browser-profile path.

Password storage is not enabled merely because it is permitted. The first
implementation attempts persistent profile reuse. Password Secret support is
enabled only if the real Zhejiang University session cannot meet the restart
and expiry acceptance without it.

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
session states. A low-frequency health probe validates the session without
downloading a PDF. It must not refresh on every request.

When a download encounters a real authentication redirect:

1. one single-flight refresh attempt runs;
2. a persisted session is reloaded;
3. optional Secret credentials may be used only by the isolated auth component
   when the configured flow supports it;
4. MFA/CAPTCHA or failed refresh changes state to `auth_required`;
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
- Logs contain identifier hash, bounded route/status/latency/size and request
  ID only. They exclude query text, PDF bytes/text, credentials, cookies, URLs
  containing credentials, and upstream response bodies.
- Per-user, per-Workspace, per-publisher, and global concurrency/rate caps apply.
  One request cannot start unbounded upstream races or browser processes.
- The auth browser is stopped outside login/repair and is loopback-only while
  running. No credential UI is reachable through public Nginx/Cloudflare.
- Build and runtime contracts fail if Tor proxy variables, grey-source enable
  flags, host ports, data-network membership, writable rootfs, Docker socket,
  or production database/object-storage Secrets appear in the service.

## 10. Testing and production acceptance

### Automated gates

- Contract tests for strict request/response fields, service-token validation,
  body limits, stable errors, subject binding, and unknown-field rejection.
- Source-policy tests proving every grey label and every non-`legal_only`
  strategy fails before bytes leave the service.
- SSRF/redirect/DNS rebinding tests and streamed response-size cancellation.
- Session state/single-flight/backoff tests with Secret redaction assertions.
- Domain/API tests for personal target creation/reuse, RO authorization,
  idempotency, provider invisibility, query-only results, identifier download,
  and cross-Workspace denial.
- Web tests for all four entry points, consistent task state, keyboard/accessibility
  behavior, and absence of provider/auth mode controls.
- Existing temporary-document link, replay, checksum, rights and GC suites remain
  mandatory.

### ECS acceptance

1. Exact CI and canonical immutable deploy with active/rollback identities.
2. Build the source-locked `scansci-legal` and auth-helper images on the CPU ECS;
   verify non-root/read-only/resource/network/Secret topology.
3. Complete one Zhejiang University CARSI login through the loopback SSH tunnel;
   verify account/password/Cookie values never appear in logs or responses.
4. Recreate `scansci-legal`; session status must remain `ready` without another
   login.
5. Download one real OA PDF and one real Zhejiang University institutional PDF.
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
release, stops/removes only the exact `scansci-legal` and auth-helper containers,
and preserves the session volume unless the operator explicitly revokes it.
Credential/session revocation is independent of application rollback.

Production retention keeps current and rollback application images plus the
current ScanSci service/auth images and one persistent session volume. Failed
candidate images, login containers, browser downloads, temp profiles, evaluation
roots, and BuildKit residue are inventoried and removed by exact identity only;
no broad Docker or filesystem prune is allowed.

## 12. Evidence sources

- ScanSci upstream pinned tree:
  <https://github.com/Rimagination/scansci-pdf/tree/7017814758f826ea21470a609890a7d3ca374b8e>
- Zhejiang University CARSI entry:
  <https://libdb.zju.edu.cn/s/lib/libtb/show/1886>
- Zhejiang University off-campus access guide:
  <https://libweb.zju.edu.cn/56334/list.htm>

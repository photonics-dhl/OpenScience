# Task 9 report — ScanSci security, architecture, API, and release gates

## Status

`DONE_WITH_CONCERNS` for the local candidate. Open local P0/P1 findings: **0**.
Production remains blocked on Task 10 ECS/CARSI acceptance; no Docker, ECS, SSH,
Secret, `.env`, GitHub, merge, or deployment action occurred in Task 9.

## Version tuple

- Branch: `codex/scansci-default-capability`.
- Task 9 base: `7c5b0f562b8c68797ad7f1999a1fd1ce32103b57`.
- Security fixes: `4f6361ef179771e9a10dd8b21a53b14c4d9a1df9` and
  `cfc0ddc24b92040d46f5fa875b1931163aa2c5fa`.
- Documentation gate: `0e98190bc7cd2cd69dfb9cd7bcd4dcf38a0de0ad`.
- Repository main: `463c8e3a2a80138cda2d669c370c0481ed4c0877`.
- Production application/release: `689331845574612130f223d08c92e61721c16586`.
- Production rollback: `c435c4c8b2800bb20998fd9a9a93f2db96328661`.
- Production core/search migrations: `32/32` / `2/2`; migration 33 is local only.

## Static and dependency review

The exact forbidden-path command returned 33 matches. Every match was manually
classified as one of: fixed `false` production configuration, fail-closed
rejection logic, source-lock metadata fixed false, or an adversarial/negative
test. No executable Sci-Hub, LibGen, SciBban, Tor proxy, or `use_tor=true` path
was found.

- `audit:knip`: initial RED found two unused exports; both were made private;
  fresh rerun exit 0 with configuration hints only.
- `audit:dep`: exit 0, 831 modules and 1,936 dependencies, zero violations.
- `audit:deps`: exit 0, no version issues; root private package has the existing
  informational missing-version message.

## Focused review and fixes

### P1 — legal service Secret path

Root cause: the Task 2 development fallback remained executable after Compose
moved production to a file Secret. `load_service_token` accepted an inline
environment value and used path-based `read_text`, without descriptor identity
or runtime owner/mode/link checks.

RED proved inline-only input was accepted and POSIX-unsafe metadata was not
rejected. Fix `4f6361e` now rejects the inline variable, requires the file,
opens with `O_NOFOLLOW`, validates regular/single-link/size and POSIX
euid/egid/`0400`, reads once, then rechecks path inode identity. The focused
HTTP file finished `20 pass / 1 Windows POSIX skip`; the complete package
finished `73 pass / 5 Windows POSIX skips`.

### P1 — pre-request SSRF, redirects, and DNS rebinding

Root cause: final `source_url` validation occurred only after the pinned
upstream had already made requests. The wrapper had no guard on each actual DNS
resolution or redirect send.

RED proved the guard was absent. Fix `4f6361e` installs a subprocess-local
Requests `Session.send` guard on every hop (HTTPS, no URL credentials, no local
hostnames) and a `socket.getaddrinfo` guard that rejects non-HTTPS ports,
empty/invalid results, and the whole answer if any IP is non-global. Tests cover
public, loopback, RFC1918, metadata/link-local, documentation, IPv6 local, mixed
answers, HTTP-on-443, credentials, and localhost. Final self-review proved
Python classifies multicast as global; RED reproduced IPv4 `224.0.0.1` and IPv6
`ff02::1`, then `cfc0ddc` added the explicit multicast rejection. Focused
upstream tests are `11/11` green. The post-download URL/source/route checks
remain defense in depth.

### P1 — stream error redaction

Root cause: initial `fetch` errors were normalized, but an exception from
`response.body.getReader().read()` escaped into the Worker task error path,
which could retain raw internal/cookie/path text.

RED reproduced the raw rejected promise. Fix `4f6361e` cancels the reader and
returns stable `unavailable/upstream_error/retryable=true`. Focused adapter
tests are `16/16`; Agent Worker is `503/503`.

## Architecture, API, data, and release review

- Direction: apps depend on packages; no app-to-app implementation import or
  Provider SDK escape was found. `scansci-legal` is a release-scoped app and
  provider-neutral DTO/rights/task rules remain in Domain.
- Browser surface: `POST /literature/acquisitions` is the only public write
  path. Generic/public/internal task persistence rejects `source.retrieve` and
  the server-only retry marker. Web surfaces call the same acquisition API and
  expose no provider/auth/mode control.
- API controls: authenticated session, global CSRF, 4 KiB body, strict target,
  10/min route rate, AI Credit, caller idempotency, active membership and
  target scoping are present. Personal RO/session/task/credit/audits commit in
  one bounded Serializable transaction; Redis dispatch is post-commit.
- Retry/recovery: one retry reuses the original credit; CAS/authority/audit are
  Serializable with P2034-only retry. Raw SQL returns only an ID after exact
  user/workspace/target/marker/payload eligibility, then hydrates and rechecks
  the shared predicate. No top-N/payload leak was found.
- Provider state: migration 33 is expand-only with rollback SQL. The
  PostgreSQL-authoritative auth-required generation, audit, and idempotent admin
  notification are atomic; only raw success clears state; observation failure
  is non-fatal to a useful retrieval.
- Bytes/rights: 100 MiB declared and streamed limits, PDF magic, stable source
  and route pairs, entitlement subject/expiry, ClamAV, private object key,
  HEAD size/hash activation, Workspace rights, 600-second one-use capability,
  and 72-hour GC/provenance reuse the existing implementation.
- Secret/profile: root-only provisioning, separate UID 10001/1000 named
  volumes, read-only mounts, bounded profile cookie snapshot with parent/file
  identity checks, stopped loopback auth, no database/application Secret, and
  redacted status responses were reviewed.
- Runtime/release: legal service is non-root/read-only, 1 CPU/1 GiB/64 PID,
  64 MiB no-exec tmpfs, no host/data/app port/network, fixed two-slot
  acquisition and one upstream worker per request. Deploy verifies ScanSci
  before Worker, binds legal/auth image IDs in capability schema 3, restores
  exact prior ScanSci or removes an absent-prior candidate, and protects active
  plus rollback tags without broad prune.
- Public DTO: account, password, Cookie/profile, token, raw provider response,
  object key, query HMAC and private provenance do not cross the browser result.

## Deferred Minor triage

- Task 1 lock helper checks hash presence globally, but both install stages use
  `pip --require-hashes`, which fails any un-hashed requirement. The resolver
  host header is provenance-only; Linux 3.12 locked installation remains the
  authoritative evidence.
- Task 2 intermittent Windows bearer/raw-socket reset did not recur across the
  repeated focused and full HTTP suites in this task. Keep CI observation.
- Task 4 exited/created auth discovery still has one source assertion rather
  than a complete fake-Docker CLI. The all-container runtime implementation and
  Task 10 real ECS acceptance remain authoritative.
- Task 8 intent grammar/DOI punctuation remains bounded and can misroute an
  ambiguous phrase, but it cannot expand provider, target, Secret, or authority.
- The current single Worker, 2-slot/64-PID service and API rate/credit controls
  give a hard bound. Before horizontal Worker scale, add shared per-user,
  per-Workspace and per-publisher concurrency quotas.

## Local evidence

- Build: exit 0; Web 19 routes; compiled parser composition `9/9`.
- Typecheck: exit 0 across all workspaces.
- Integration compilation: API and Domain PostgreSQL tsconfigs exit 0. Their
  real PostgreSQL execution is forbidden locally and remains Task 10.
- Full test: exit 0, `2,105 pass / 20 platform skips / 0 fail`.
  - release contract `94 pass / 7 platform skips`;
  - ScanSci `73 pass / 5 Windows POSIX skips`;
  - Web `464` Vitest + `5` Node;
  - Domain `535`, Agent Worker `503`, API `101`.
- UI/Hermes production-browser gates were not rerun because Task 9 changed no
  UI. Task 8 retained fresh product `72/72` and Hermes `19/19 + 8/8`; the root
  suite reran all Web unit/contract tests.
- Lint: exit 0; workspace structure and embedded docs-sync gate green.
- Docs lint: 238 files, 0 issues. Standalone docs-sync: `8/8` plus
  `DOCS_SYNC_OK`. Hermes capability registry: `2/2`, 22 rows/9 candidates.
- Final forbidden-path classification and `git diff --check` were rerun after
  documentation synchronization.

## Production blockers

Task 10 must still prove exact CI and merged-main immutable deploy; targetless
durable ScanSci task count zero; migration 33 forward/rollback/redeploy and
two-client PostgreSQL contracts; Linux Secret/DNS/HTTPS runtime; exact image,
mount/network/limit and rollback/retention identity; one real CARSI login and
session recreation; real OA and non-OA institutional PDFs; all four 375 px
product entries; ClamAV/hash/rights; one-use replay; real 72-hour Worker GC with
provenance retained; grey/Tor call count zero; and exact cleanup. Until then
production remains `6893318…`, ScanSci remains disabled, and Task 11 remains
blocked.

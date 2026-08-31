# Task 9 report — ScanSci security, architecture, API, and release gates

## Status

`DONE` for Task 9 local review. Open local P0/P1 findings: **0**. Production
remains intentionally blocked on Task 10 ECS/CARSI acceptance; no Docker, ECS, SSH,
Secret, `.env`, GitHub, merge, or deployment action occurred in Task 9.

## Version tuple

- Branch: `codex/scansci-default-capability`.
- Task 9 base: `7c5b0f562b8c68797ad7f1999a1fd1ce32103b57`.
- Security fixes: `4f6361ef179771e9a10dd8b21a53b14c4d9a1df9` and
  `cfc0ddc24b92040d46f5fa875b1931163aa2c5fa`.
- Review fix 1: `2560bd84988dd0df7972630a81ac5cb7d80bb62f`.
- Review fix 2: `36f985c59c44c85c84ed242ca890ad6a5b7ce01e`.
- Review fix 3: `63a0b562b50bd2fd72400a18f74c5a0d89b18a8d`.
- Review fix 4: `755b7b5db0afb202134d4893958856846426bfbd`.
- Initial documentation gate: `0e98190bc7cd2cd69dfb9cd7bcd4dcf38a0de0ad`;
  review-fix-3 evidence is recorded by the final documentation commit.
- Repository main: `463c8e3a2a80138cda2d669c370c0481ed4c0877`.
- Production application/release: `689331845574612130f223d08c92e61721c16586`.
- Production rollback: `c435c4c8b2800bb20998fd9a9a93f2db96328661`.
- Production core/search migrations: `32/32` / `2/2`; migration 33 is local only.

## Static and dependency review

The exact forbidden-path command returned 58 matches after the new fixed-false
compatibility/adversarial coverage. Every match was manually
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
HTTP file finished `20 pass / 1 Windows POSIX skip`; the final complete package
finished `80 pass / 6 Windows/POSIX skips`.

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
`ff02::1`, then `cfc0ddc` added the explicit multicast rejection. The final
upstream file is `13/13` green. The post-download URL/source/route checks
remain defense in depth.

### P1 — stream error redaction

Root cause: initial `fetch` errors were normalized, but an exception from
`response.body.getReader().read()` escaped into the Worker task error path,
which could retain raw internal/cookie/path text.

RED reproduced the raw rejected promise. Fix `4f6361e` cancels the reader and
returns stable `unavailable/upstream_error/retryable=true`. Focused adapter
tests are `16/16`; Agent Worker is `503/503`.

## Fix round 1/5 — NAT64, serial legal sources, and tmpfs budget

### Important — IPv4-embedded IPv6 policy bypass

RED produced five failures because well-known NAT64 addresses embedding
`169.254.169.254` and Alibaba `100.100.100.200` remained outer-global. The
shared address predicate now extracts IPv4 from `64:ff9b::/96`, IPv4-mapped,
6to4 and Teredo forms and applies the same non-global/multicast policy. The
local-use `64:ff9b:1::/48` is rejected entirely. Literal URL, direct DNS and
mixed-answer tests cover both metadata addresses; public NAT64 to `8.8.8.8`
remains accepted.

### Important — pinned upstream ignored `parallel_sources`

Exact reviewer evidence for archive `db537914…9208b9` showed `download` calls
the seven-argument `_run_tiers_parallel` for free and institutional tiers while
the config flag is never consulted. The wrapper now verifies that exact
signature and the expected parallel AST contract (`ThreadPoolExecutor`,
`_try_source`, `safe_filename`, Lock/Event/submit/wait/shutdown and tier loops)
before replacing it. Drift raises a stable worker failure; it cannot fall back
to the upstream race.

The replacement accepts at most 64 sources, verifies legal-only/fixed-false
flags and rejects grey labels, then executes tier/source order serially and
returns the first success. It removes each source output before and after an
attempt and performs bounded final cleanup. A behavioral adversarial test—not
a source assertion—proved call order `free-first → free-second`, max active
source count one, zero `ThreadPoolExecutor` construction, no institutional call
after success, exact final bytes and zero `paper_*.pdf` temps. Source-shape and
grey-config mutations fail before any source executes.

### Resource reconciliation

Prod/dev Compose and the runtime verifier now require a 256 MiB no-exec tmpfs.
Two admitted acquisitions × one serial 100 MiB source temp yield a 200 MiB
worst case; bounded config/protocol/session snapshots fit in the remaining
56 MiB. tmpfs pages remain inside the existing 1 GiB service memory limit.
Focused results: ScanSci `75 pass / 5 Windows POSIX skips`, Worker `503/503`,
infra ScanSci/release scripts `71 pass / 5 platform skips`.

## Fix round 2/5 — pinned negative cache and kernel file-size limit

### Important — serial runner bypassed negative-cache semantics

RED showed no failed result entered the fake cache and missing cache helpers did
not block installation. The compatibility gate now requires callable
`_neg_blocked(label, doi)` and `_neg_record(label, doi, result)`. Each source is
checked before its path is constructed; blocked entries perform no path or
source call. Every truthy non-success result, including a truthy cancelled
shape, is passed by identity to the pinned recorder; falsy `None`, success and
blocked entries are not recorded by the runner.

The cross-invocation behavioral test runs a free cancelled+failed tier followed
by an institutional tier. It proves the failed key is cached, the second call
skips it while leaving a sentinel path untouched, the next institutional source
succeeds, order and first-success remain intact, and only the two exact attempted
non-success results reached `_neg_record`. Missing either helper fails before a
source call.

### Important — 100 MiB was only a post-completion check

RED showed no source-limit installer and an EFBIG exception escaped before the
next serial source. A new shared `limits.py` owns exact `MAX_PDF_BYTES =
104857600` for HTTP, parent adapter and subprocess. Before importing/calling
upstream, every production POSIX subprocess validates the current hard-limit
feasibility, installs a SIGXFSZ handler, sets soft+hard `RLIMIT_FSIZE` to the
exact shared value and re-reads it. Failure is stable and redacted. External
exec children inherit the hard limit.

EFBIG removes the partial expected source path and permits the next serial
source where the process survives. Successful results must reference that exact
regular non-symlink source temp and finalize via same-directory rename; an
alternate path fails closed, so there is no second 100 MiB copy. The POSIX
kernel test uses a controlled 4096-byte limit: exactly 4096 bytes persist, the
next byte fails with EFBIG, and an external child also cannot exceed 4096. It is
an intentional Windows skip and runs on Linux CI.

The ECS runtime verifier now runs a no-Secret probe, requires soft:hard metadata
`104857600:104857600`, and emits `SCANSCI_RUNTIME_FILE_LIMIT_OK`. Its mutation
fixture was corrected to include accepted image IDs, so every mutation now
tests its intended invariant rather than failing early for missing identity.
Focused results: ScanSci `80 pass / 6 Windows/POSIX skips`, Worker `503/503`,
infra `71 pass / 5 platform skips`.

### Important — runtime probe bypassed the production file-limit entry

RED proved the runtime verifier imported and called the limit installer through
a separate `python -c` path, so a future acquisition-path regression could leave
the probe green. Review fix 3 introduces one worker request executor that installs
and re-reads the exact soft:hard limit before inspecting the mode or importing
upstream. Both acquisition and the no-network/no-Secret probe traverse it.

The probe only reports the already-installed stable metadata object
`{"file_limit":"104857600:104857600"}`. The verifier now sends the bounded
probe request to the real worker entry; it does not import upstream or call the
installer directly. Behavioral tests prove the shared install/read ordering,
exactly one install before acquisition imports, no upstream access from the
probe, and fail-closed behavior for a missing/skipped install or malformed
metadata. Focused results: ScanSci `81 pass / 7 Windows/POSIX skips`, infra
`72 pass / 5 platform skips`.

### Important — fresh tmpfs hid the verifier probe directory

RED showed the verifier sent `/tmp/scansci-legal`, which is not created by the
fresh 256 MiB `/tmp` tmpfs mount. Review fix 4 sends the exact existing `/tmp`
root while leaving acquisition output directories unchanged. An executable
common-entry test models a fresh mount with `/tmp` present and the old subdir
absent: the probe performs only install/read, loads no upstream or Secret,
creates/reads/writes no file, and leaves the mount empty. An acquisition using
the same root still fails before upstream because its controlled `config.json`
is absent. Focused results: ScanSci `82 pass / 7 Windows/POSIX skips`, infra
`72 pass / 5 platform skips`.

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
  256 MiB no-exec tmpfs, no host/data/app port/network, fixed two-slot
  acquisition, one serial source per request, pinned negative-cache behavior
  and a kernel hard 100 MiB per-file limit. Deploy verifies ScanSci
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
- Task 2 intermittent Windows bearer/raw-socket reset recurred once while the
  first root suite ran concurrently with build/typecheck. The exact test and a
  serial full-root rerun were green; no production code in that path changed.
  Keep CI observation.
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
- Full test: exit 0, `2,114 pass / 22 platform skips / 0 fail`.
  - release contract `94 pass / 7 platform skips`;
  - ScanSci `82 pass / 7 Windows/POSIX skips`;
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
NAT64/serial-source/negative-cache parity, Linux soft+hard RLIMIT/child
inheritance, EFBIG cleanup/exact rename, 256 MiB mount/network and rollback/
retention identity; one real CARSI login and
session recreation; real OA and non-OA institutional PDFs; all four 375 px
product entries; ClamAV/hash/rights; one-use replay; real 72-hour Worker GC with
provenance retained; grey/Tor call count zero; and exact cleanup. Until then
production remains `6893318…`, ScanSci remains disabled, and Task 11 remains
blocked.

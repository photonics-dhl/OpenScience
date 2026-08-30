# Hermes External Retrieval and Temporary Document Lifecycle Plan

> Status: PARTIAL / TASK 10 REOPENED. Metadata, rights and temporary lifecycle are production-accepted; default ScanSci acquisition follows `docs/specs/2026-08-30-scansci-default-capability-design.md`.
> Final: main and production application source `689331845574612130f223d08c92e61721c16586`; rollback `c435c4c8b2800bb20998fd9a9a93f2db96328661`.

## Outcome

Hermes can discover scholarly metadata and web sources, acquire only legally
eligible documents, retain auditable provenance after cached bytes expire, and
offer an authenticated ten-minute download link when the rights decision allows
it. Provider failure must not break existing RO reading, parsing, editing, or
hybrid search.

## Fixed product and safety decisions

1. `packages/domain` owns provider-neutral retrieval, rights, retention, and
   signed-link contracts. Provider response shapes never cross this boundary.
2. `source.retrieve` is a server-authorized AgentTask bound to a user, Workspace,
   and required RO. The client submits a bounded query or identifier; it cannot
   submit credentials, object keys, arbitrary callback URLs, or a rights verdict.
3. Semantic Scholar uses its REST API through native `fetch`, requests only
   explicit fields, and observes the authenticated introductory one-request-per-
   second limit. A missing key may use the documented public route at a stricter
   local rate; `429`, timeout, and outage become explicit provider states.
4. Tavily is discovery-only and non-authoritative. Requests use `basic`,
   `include_answer=false`, `include_raw_content=false`, bounded results, timeout,
   and a kill switch. Missing/exhausted credentials degrade without failing the
   scholarly provider or manual workflow.
5. ScanSci upstream `1.11.0` commit
   `7017814758f826ea21470a609890a7d3ca374b8e` includes Sci-Hub/Tor routes and a
   CLI that enables them by default. It must not be installed or exposed as-is.
   The platform adapter accepts only an isolated `legal_only` service that
   enforces `scihub=false`, `tor=false`, bounded DOI/arXiv input, explicit source
   provenance, malware scanning, and a server-derived institutional entitlement.
   Until that service and school Secret pass production review, the adapter is
   present but disabled and returns an explicit unavailable state.
6. Temporary bytes live only under
   `hermes-cache/<workspace-id>/<temporary-document-id>/<content-hash>` in private
   object storage. Releases, container root filesystems, user HOME, and database
   binary columns are forbidden.
7. Default cache TTL is exactly 72 hours. A leased, idempotent GC records
   scanned/deleted/skipped/bytes/failures and preserves metadata even after object
   deletion. No recursive filesystem cleanup or broad object-prefix deletion is
   allowed.
8. A signed download is an application HMAC capability, maximum 600 seconds,
   still requiring the authenticated intended user. The endpoint rechecks
   membership, rights, cache expiry/state, object size, and SHA-256 before
   streaming; object keys and storage credentials never enter the response.
9. Rights decisions distinguish cache access from redistribution:
   `open_access`, `institutional_access`, `public_domain`, `self_authored`,
   `unknown`, or `prohibited`; and `downloadable`, `authorized_user_only`,
   `source_link_only`, or `blocked`. Unknown or conflicting evidence fails to
   link-only/blocked, never to downloadable.
10. Permanent rows retain a server-keyed query HMAC fingerprint, provider, provider record ID, canonical
    source URL, content hash, rights decision and evidence, parser/model version,
    and cited locator. Secrets, institutional cookies, raw provider payloads,
    object keys, and private entitlement details are not public DTO fields.

## Data boundary and migration 32

Add normalized core-database records:

- `ExternalSource`: tenant-scoped canonical metadata and provider provenance.
- `SourceRightsDecision`: immutable decision, evidence basis, cache/download
  policy, content hash, checker version, and decision timestamp.
- `TemporaryDocument`: private object key, requester, source, size/hash/MIME,
  expiry/deletion state, cleanup lease, attempts, and last bounded error.
- `TemporaryDocumentAccess`: append-only signed-link issuance/download audit with
  token hash rather than the token itself.

Every table is Workspace-scoped and indexed for provider identity, content hash,
expiry/cleanup state, and access audit. Migration 32 has a mechanical rollback;
production uses the canonical migration CLI and keeps search migration 2
independent.

## HTTP and task contracts

- `POST /agent/sessions` with `kind=retrieval`, followed by `POST /agent/tasks`
  with `kind=source.retrieve`: authenticated, member-scoped, idempotent request;
  returns immediately and never waits on providers.
- `GET /agent/tasks/:taskId`: caller-owned provider-neutral result and explicit
  partial/degraded states; private object keys and raw Provider payloads are absent.
- `POST /temporary-documents/:id/download-link`: returns a clean authenticated
  relative URL with `expiresAt`; the signed capability is stored only in a
  HttpOnly, SameSite one-use cookie scoped to that exact URL.
- `GET /temporary-documents/:id/download/:accessId`: validates the cookie-bound
  capability and streams the bounded verified object with safe disposition
  headers. Range and replay are rejected.

Provider result status is a discriminated union:

- `succeeded`: normalized sources and optional cached document IDs;
- `partial`: at least one provider succeeded and failures are listed;
- `unavailable`: no provider was configured or reachable, with stable reason
  codes;
- `blocked`: rights, malware, size, or policy prevented acquisition;
- `failed`: bounded retryability and provider-neutral error.

## TDD execution order

1. Write Domain tests for identifier/query validation, provider normalization,
   rights decisions, HMAC expiry/audience/tamper rejection, cache key validation,
   and GC leases/idempotency.
2. Add migration 32, Prisma models, forward/rollback migration tests, and scoped
   service methods. Verify database/object-storage separation mechanically.
3. Write provider adapter contract tests with deterministic fake HTTP, then
   implement Semantic Scholar and Tavily native-fetch adapters plus the disabled-
   by-default ScanSci legal adapter.
4. Add `source.retrieve` payload parser, task/session authorization, durable
   outbox recovery, worker handler, partial-provider result, bounded retry, audit,
   and usage accounting.
5. Add API integration tests for RBAC, idempotency, DTO redaction, link issuance,
   token replay/tamper/expiry, rights denial, checksum mismatch, and streaming.
6. Add GC metrics and worker scheduling with a single-flight database lease;
   prove crash-after-delete recovery and exact object cleanup.
7. Update Compose/env examples with variable names and kill switches only. No
   real credential is committed or printed.

## Gates and production acceptance

- Full build/typecheck/lint/test and existing product/Hermes browser gates.
- Security review of SSRF, redirects, DNS/IP validation, response-size limits,
  provider error redaction, object-key secrecy, HMAC rotation, and institutional
  access isolation.
- Exact CI before deployment; server full build; migration 32 status;
  Parser/BGE/database isolation/target container/public health remain green.
- Production canary: one Semantic Scholar metadata lookup, one Tavily basic lookup
  only if a rotated key is injected, and one legal ScanSci/OA or explicit disabled
  result. No old chat-exposed credential may be used.
- Lifecycle journey: create one bounded cache object, issue a 600-second link,
  stream and hash-verify it, force expiry through the test clock/controlled row,
  run one GC cycle, prove bytes removed and permanent provenance retained, then
  precisely remove the canary rows and objects.
- Record provider latency/status without query text or credentials. Finish with
  release/rollback identity, disk delta, exact retained assets, and zero test
  residue.

## Completion evidence (2026-08-30)

- Task implementation merged in PR #8; the SeaweedFS/minio-js checksum metadata
  compatibility fix merged in PR #9. Exact fix CI `33284956868` / job
  `99186426490` passed in 11m09s. Final local build/typecheck/lint/test passed;
  Storage 22/22, Agent Worker 468/468 and API 89/89 were green.
- Canonical ECS deploy applied core migration 32 and retained search 2/2. Parser
  16-case acceptance, BGE-M3 CPU inference, database isolation, all target
  containers, Nginx and public release identity passed for `6893318…`.
- A real Semantic Scholar Hermes task returned three normalized sources and
  persisted rights decisions. Subsequent calls correctly degraded on provider
  429. Tavily was injected without exposing its value, but all four authorized
  keys returned plan/key quota exhaustion; ScanSci remained legal-only and
  disabled.
- A controlled self-authored PDF proved checksum-verified one-time download,
  404 replay rejection and the real 60-second Worker GC. The object was deleted
  after the exact 72-hour boundary while source, rights, provenance and locator
  remained queryable. After recording evidence, the exact canary rows were
  removed and the audit trail retained.
- Final disk remained 36G/148G (25%, 107G available). Automatic retention kept
  only active `6893318…` and rollback `c435c4c…`; no broad prune ran.

## Current primary references

- Semantic Scholar API overview and rate-limit guidance:
  <https://www.semanticscholar.org/product/api>
- Semantic Scholar Academic Graph OpenAPI:
  <https://api.semanticscholar.org/api-docs>
- Tavily Search endpoint:
  <https://docs.tavily.com/documentation/api-reference/endpoint/search>
- ScanSci upstream pinned source:
  <https://github.com/Rimagination/scansci-pdf/tree/7017814758f826ea21470a609890a7d3ca374b8e>

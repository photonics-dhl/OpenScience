# Hermes Claim/Evidence API and Publication Safety Plan

> **Taskmaster:** `hermes-research-intelligence` Task 8. The product contract is
> `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` §5,
> §9 and §14. This work extends the existing RO/version/review/publication
> services; it does not create a parallel Research Object stack.
>
> **Status:** COMPLETE / PRODUCTION ACCEPTED on 2026-08-29 in release
> `4c73469fe24abe685054f1d917d452adc5371d35`; rollback `cf68bfa7baba9610dcd010fed0fcf5fd0deeab2f`.

## Product outcome

An authenticated RO author can create and revise a version-scoped Claim graph,
attach Evidence to an exact artifact position, review the resolved source text,
and explicitly verify the Evidence. The server—not the browser—loads the
parser-produced SourceMap, checks the immutable artifact hash and resolves the
locator. Publication review and the final publish transaction both rerun the
same safety checks so a passed review cannot be reused after evidence changes.

This task is backend product infrastructure. Task 9 will render the resulting
Claim/Evidence graph on the public RO page, while Task 10 will add external
retrieval and a richer rights engine on top of this stable persistence boundary.

## API contract

All routes require a session. Reads require RO workspace membership; writes are
limited to owner, maintainer, author and contributor roles. Cross-workspace or
cross-version resources return a non-disclosing not-found response. Published
and terminal versions are immutable.

- `GET /research-objects/:roId/versions/:versionId/claims`
- `POST /research-objects/:roId/versions/:versionId/claims`
- `PATCH /research-objects/:roId/versions/:versionId/claims/:claimId`
- `DELETE /research-objects/:roId/versions/:versionId/claims/:claimId`
- `GET /research-objects/:roId/versions/:versionId/evidence`
- `POST /research-objects/:roId/versions/:versionId/evidence`
- `PATCH /research-objects/:roId/versions/:versionId/evidence/:evidenceId`
- `POST /research-objects/:roId/versions/:versionId/evidence/:evidenceId/verify`
- `DELETE /research-objects/:roId/versions/:versionId/evidence/:evidenceId`

Create requests carry a client-generated UUID. Replaying that UUID with the
same canonical payload returns the existing resource; reusing it for another
payload is a conflict. Mutations carry `expectedUpdatedAt`; a conditional
`updateMany`/`deleteMany` supplies optimistic locking without a schema change.
Every successful mutation records actor, workspace, RO, version, resource and
the before/after safety-relevant fields in the existing audit sink.

## Task 1: Preserve a trusted parser SourceMap reference

**Files:**

- Modify: `apps/agent-worker/src/index.ts`
- Add/modify: focused worker tests
- Add: domain SourceMap-reference parser/loader beside research-intelligence

The parser already creates canonical `DocumentSourceMap` values, but the
current `sdf.extract` result retains only the six-field proposal. Serialize the
canonical map, store it under a content-addressed internal object-storage key,
and persist a small strict `sourceMapRef` in `AgentTask.result`. The reference
contains schema version, parser outcome, artifact id/hash, object key, byte
length and serialized-map SHA-256. Loaders enforce size bounds, object hash,
artifact/hash scope and strict JSON parsing. Large SourceMaps do not move into
PostgreSQL.

## Task 2: Implement Claim/Evidence domain operations test-first

**Files:**

- Add: `packages/domain/src/research-intelligence/claim-evidence-service.ts`
- Add: `packages/domain/src/research-intelligence/claim-evidence-errors.ts`
- Add: `packages/domain/test/research-intelligence/claim-evidence-service.test.ts`
- Modify: `packages/domain/src/index.ts`

Claims enforce kind/parent scope, bounded statements/lists and human-owned
provenance. Full 3–7 core graph validation remains a publication rule so a user
can build an incomplete draft incrementally.

Evidence must reference an artifact present in the exact VersionManifest with
the same SHA-256. Document locators resolve against the trusted SourceMap;
quoted passages require a deterministic character range and exact source-text
match. Code locators fail closed in Task 8: `Version.commitId` is a database FK,
not an authoritative source revision, so neither API nor Domain may accept a
`codeRange` until a future schema records and verifies that revision. Human
verification reruns resolution and stamps `verifiedByUserId`;
edits clear prior verification. Machine output is proposal-only and cannot
overwrite a human-verified record.

## Task 3: Expose strict routes and errors

**Files:**

- Add: `apps/api/src/routes/claim-evidence.ts`
- Add: `apps/api/test/claim-evidence-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/error-map.ts`

Use closed Zod schemas, bounded strings/arrays, UUID route parameters and
request audit context. The browser cannot submit a SourceMap, verification
identity, workspace id, content hash outside the locator, or automatic actor
authority. Map validation to 400, missing resources to 404, immutable/version
and optimistic-lock conflicts to 409, and insufficient roles to 403.

## Task 4: Use one publication blocker evaluator twice

**Files:**

- Add: `packages/domain/src/research-intelligence/publication-evidence.ts`
- Modify: `packages/domain/src/review/publish-review.ts`
- Modify: `packages/domain/src/publish/publish.ts`
- Add/modify: focused review and publish tests

The shared evaluator covers locator mismatch, missing artifact/hash/original,
presentation-asset hash reuse as Evidence, a contradicting Evidence hidden
behind a `supported` Claim, unverified or unresolved parser output, and external
source content whose provenance does not carry an explicit `reuse` rights
decision. An absent Evidence record is disclosed through Claim assessment and
is not itself a hard blocker. Review stores the blocker codes; publish reruns
object/locator verification before the short serializable transaction and
rejects stale approvals through the narrative snapshot digest inside it.

Task 10 may expand the rights decision vocabulary, retention and signed-link
behavior, but cannot weaken the Task 8 rule that stored/distributed external
content needs affirmative reuse authority.

Content-addressed SourceMaps may be shared by ingestion results and Evidence.
Task 10 must inventory all references before any GC rather than deleting them
as apparent single-record orphans.

## Task 5: Production-oriented acceptance

Run focused domain/API/worker tests, then the existing build/typecheck/lint/test
gates once. After exact CI, deploy immutably to ECS and run one disposable real
RO journey: upload and parse a representative document, create three Claims,
attach and resolve Evidence from the persisted SourceMap, verify it, prove one
tampered locator is blocked, review/publish the valid version, and inspect the
audit rows. Remove only the journey's exact test records and stored objects.
Do not substitute local Docker or repeated synthetic loops for this production
journey; Vision remains outside Task 8 and is tested later through the real
admin-only product path.

## Completion evidence

- Exact GitHub CI `33257516418` / job `99113706374` passed all build,
  typecheck, lint, unit, product visual and Hermes gates.
- ECS parser acceptance passed for the exact release. The disposable production
  journey parsed five source blocks, created three Claims and three Evidence
  records, proved unverified publication blocking and locator-tamper rejection,
  then passed review, published and returned a 200 public page. Exact cleanup
  left zero disposable users.
- Production SeaweedFS omits custom SHA metadata on HEAD. The final fix streams
  and hashes the immutable original when metadata is absent, enforces exact byte
  length and caches repeated checks per object; metadata-present behavior is
  unchanged.
- Public visibility was pre-seeded only for this disposable fixture. Task 9 must
  connect the existing explicit visibility-approval boundary to the public
  publishing experience; generic PATCH is not acceptance evidence for that flow.

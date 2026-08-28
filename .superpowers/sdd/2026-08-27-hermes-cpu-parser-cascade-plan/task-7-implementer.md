# Task 7 Implementer Report

## Status and scope

Task 7 code is complete on `codex/hermes-wanko-live2d`, based on
`b2702a1dd809e840e696d63ad7f8599bd1f0f3d1`. The implementation changes only
the asynchronous Agent Worker extraction composition and its tests. It adds no
HTTP endpoint, synchronous upload wait, database/schema change, provider SDK,
dependency, migration, Docker action, network/provider call, deployment, or
stored research-data write.

Production remained at application/release
`e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback remained
`8163f8b4218e529ee4be41bb9fc732ff6497931a`. No `.env` file was read or
printed. The pre-existing uncommitted edit to this plan's `progress.md` was
preserved and excluded from Task 7 staging.

## Changed files

- `apps/agent-worker/src/extractor.ts`
- `apps/agent-worker/src/index.ts`
- `apps/agent-worker/src/parser-self-test.ts`
- `apps/agent-worker/src/parsers/text-extractor.ts`
- `apps/agent-worker/test/extractor.test.ts`
- `apps/agent-worker/test/ingestion-parser.test.ts`
- `apps/agent-worker/test/research-intelligence-corpus.test.ts`
- `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/task-7-implementer.md`

`text-extractor.ts` is the strictly necessary adjacent composition change: it
allows the already-isolated V2 `extract_text` stage to materialize image OCR as
the same canonical `DocumentSourceMap` contract used by PDF/DOCX/text inputs.

## TDD evidence

The first focused RED run had two expected failures:

- `sourceMapToManuscriptText is not a function`;
- the binary `sdf.extract` handler never called the injected parser cascade.

After the minimal canonical-text and handler composition change, that focused
slice passed 36/36.

The second RED run had three expected failures because
`createWorkerParserCascade` did not exist for PDF, DOCX, or scanned-image V2
stage composition. After adding the fixed composition, the slice passed 13/13.

The third RED run proved the production Vision invariant: with
`NODE_ENV=production`, explicit enablement and an allow policy, the configured
provider was called and returned `succeeded`; the test expected zero provider
bytes and `failed`. The production provider registration is now hard-disabled,
and the corpus slice passes.

The startup self-test was also introduced test-first: the focused suite failed
because `runParserCascadeSelfTest` did not exist, then passed after the runtime
check covered V2 PDF, DOCX, blank scanned-image review, and candidate-fallback
disablement.

### Review fix round 1 (2026-08-28)

Authorization RED was captured with the exact command:

`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- extractor.test.ts`

Result: exit 1; `extractor.test.ts` had 4 expected failures and the invocation
trace showed `externalProcessingEligible: true` for reviewer, viewer, archived
Workspace, and explicit policy-denial cases. The payload in every regression
also supplied `externalProcessingEligible: true`, proving it was not a trusted
input. After the minimal execution-time role/Workspace/policy composition, the
same command exited 0 with 40/40 passing across the selected and adjacent
text-extractor tests.

Parser self-test RED was captured with the exact command:

`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- ingestion-parser.test.ts`

Result: exit 1; 3 expected failures showed the positive scan lacked the
required OCR text/locator, missing scan OCR resolved instead of rejecting, and
an enabled candidate flag resolved instead of rejecting. After exposing the
fixed composition flags and requiring OCR text plus a resolvable canonical
block locator, the same command exited 0 with 16/16 passing.

Focused review GREEN was captured with:

`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- extractor.test.ts ingestion-parser.test.ts research-intelligence-corpus.test.ts`

Result: exit 0; 64/64 passed across 4 selected/adjacent files.

Independent review then found that the first generated PNG stored most dark
glyph pixels with zero alpha. A final fixture-integrity RED used the same exact
ingestion-parser command above and exited 1 with 1/16 failing: the positive
self-test rejected because the scan bytes did not satisfy the locked opaque
fixture contract. The replacement is a deterministic 305x55 grayscale PNG
(color type 0, no alpha), manually rasterized as opaque black 5x7 glyphs
spelling `OCR 42 FS`; the test locks its dimensions, color type and SHA-256
`d96594ae3c33e18c43e0162d8def9055dc32c88ba1788e6154b1dbce0bbb0b9d`
at the actual V2 stage seam. The same command then exited 0 with 16/16 passing.
The reviewer rechecked the fix and reported no remaining Critical/Important
finding.

## Delivered composition

- Artifact-backed `sdf.extract` no longer uses the V1
  `ParsedIngestion{text}` adapter path. After existing Workspace ownership,
  membership, size, storage and malware checks, it constructs one immutable
  `ParserInput` and calls one injected `ParserCascadeRunner`.
- The production root builds that runner from one
  `createParserStageJobClient(..., TRANSITION_PARSER_METADATA)`, the reviewed
  `createTextExtractor`, and Task 6 `runParserCascade`.
- Markdown/TeX/CSV/XLSX remain deterministic in the canonical parser; native
  PDF/DOCX and scanned images traverse the bounded V2 sidecar transport.
- The existing SDF extraction prompt still receives manuscript text, but that
  text is now derived only from ordered text-bearing blocks in the canonical
  source map. Raw binary bytes cannot bypass the source map into the model.
- Direct `payload.manuscriptText` tasks remain the explicit legacy text-format
  compatibility path. Queue polling and task status transitions remain
  asynchronous; upload routes were not changed.
- Parser failure/review states remain non-polluting task results. Parser safety
  blocks fail the AgentTask; no parsed map or OCR candidate is stored by this
  task.

## Authorization and AI boundary review

- Trusted OCR context is constructed from the persisted AgentTask session,
  Research Object Workspace and actor ID after ownership and membership
  revalidation.
- External-processing eligibility is deny-by-default unless all server-derived
  facts agree: exact running `sdf.extract` task, active Workspace, matching actor
  membership, and one of `owner|maintainer|author|contributor`; the injected
  policy must also allow that trusted context. Reviewer/viewer downgrade,
  archived Workspace, missing policy, and explicit policy denial all remain
  ineligible. No task payload boolean can grant eligibility.
- AI access remains through `@openscience/ai-gateway`; parser modules contain no
  provider configuration or key.
- The fixed production cascade disables candidate LLM OCR flags, and
  `buildGateway` refuses to register Vision providers under
  `NODE_ENV=production` even if environment enablement and an allow policy are
  supplied. Tests use fakes only and send no network/provider request.
- Existing malware, bounded-stream, content-hash, V2 protocol and source-map
  validation remain in the path. No API authorization check was moved or
  weakened.

## Fresh validation (review fix round 1)

- Task 7 focused suites: 64/64 passed across extractor, ingestion/parser
  self-test, corpus and adjacent text-extractor tests.
- Full `@openscience/agent-worker`: 290/290 passed across 23 files.
- `@openscience/domain`: 433/433 passed; typecheck and build passed.
- `@openscience/ai-gateway`: 48/48 passed; typecheck and build passed.
- Agent Worker typecheck and build passed.
- Targeted ESLint over all changed TypeScript files passed.
- `git diff --check` passed.

The first full-worker run completed all 290 assertions but exited 1 on a late
`SafeParserBoundaryError: invalid_response` rejection from the unchanged
`parser-job-isolation.test.ts`. The exact isolation rerun
`npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-job-isolation.test.ts`
passed 20/20, and the immediately repeated exact full-worker command passed
290/290 with no unhandled error. No out-of-scope production or test change was
made for that non-reproducible concurrent-run event.

## Concerns and deferred acceptance

- Local Docker, real provider/network calls and deployment were prohibited, so
  packaged sidecar startup and ECS runtime acceptance remain controller-owned.
- The startup scan fixture is now a deterministic text-bearing PNG. Startup
  requires its expected OCR text and a source-map locator that resolves back to
  the OCR block through the real worker composition seam. A missing/broken OCR
  stage and any enabled production candidate flag both fail closed. Production
  LLM/Vision candidate fallback remains disabled by design.
- Layout/GROBID/local page-raster stages remain behind Task 6 feature flags and
  are not enabled by this production composition. This task integrates the
  reviewed single cascade and V2 native/OCR transition without claiming
  candidate retention or deployment acceptance.

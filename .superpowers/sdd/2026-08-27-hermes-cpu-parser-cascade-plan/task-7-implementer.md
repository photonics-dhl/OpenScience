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
  facts agree: exact running `sdf.extract` task, actor membership, Workspace and
  role. No task payload boolean can grant eligibility.
- AI access remains through `@openscience/ai-gateway`; parser modules contain no
  provider configuration or key.
- The fixed production cascade disables candidate LLM OCR flags, and
  `buildGateway` refuses to register Vision providers under
  `NODE_ENV=production` even if environment enablement and an allow policy are
  supplied. Tests use fakes only and send no network/provider request.
- Existing malware, bounded-stream, content-hash, V2 protocol and source-map
  validation remain in the path. No API authorization check was moved or
  weakened.

## Fresh validation

- Task 7 focused suites: 58/58 passed across extractor, ingestion/parser
  self-test, corpus and adjacent text-extractor tests.
- Full `@openscience/agent-worker`: 284/284 passed across 23 files.
- `@openscience/domain`: 433/433 passed; typecheck and build passed.
- `@openscience/ai-gateway`: 48/48 passed; typecheck and build passed.
- Agent Worker typecheck and build passed.
- Targeted ESLint over all changed TypeScript files passed.
- `git diff --check` passed.

## Concerns and deferred acceptance

- Local Docker, real provider/network calls and deployment were prohibited, so
  packaged sidecar startup and ECS runtime acceptance remain controller-owned.
- The startup scan fixture deliberately exercises the blank/low-information
  transition to `needs_review`; positive scanned-image OCR is covered through
  the injected V2 stage tests. Production LLM/Vision candidate fallback remains
  disabled by design.
- Layout/GROBID/local page-raster stages remain behind Task 6 feature flags and
  are not enabled by this production composition. This task integrates the
  reviewed single cascade and V2 native/OCR transition without claiming
  candidate retention or deployment acceptance.

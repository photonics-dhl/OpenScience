# Task 2 Implementer Report

## Status

Task 2 is **complete**. The sidecar now has an exact, bounded V2 request/response protocol, preserves same-release V1 compatibility without version downgrade, and runs a concrete provider-neutral transition processor from the production parser-service entry point.

Implementation base: `5bcef6fec4fae8deecba15c1241903b39fe59d8a` on `codex/hermes-wanko-live2d`. Production remained at application/release `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback remained `8163f8b4218e529ee4be41bb9fc732ff6497931a`. No production operation was performed.

## Changed files

- `apps/agent-worker/src/parsers/job-protocol.ts`
- `apps/agent-worker/src/parser-job-isolation.ts`
- `apps/agent-worker/src/parser-service.ts`
- `apps/agent-worker/test/parser-job-protocol.test.ts`
- `apps/agent-worker/test/parser-job-isolation.test.ts`
- `apps/agent-worker/Dockerfile.parser`
- `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/task-2-implementer.md`
- `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/progress.md`

The Dockerfile was added to Task 2 ownership after review proved that the new compiled protocol module was otherwise absent from the production parser image. No parser-image dependency change was needed because the protocol was made runtime-independent of `@openscience/domain`.

## TDD and protocol result

The initial focused run was RED because `job-protocol.ts` did not exist. Subsequent focused RED cases proved each reviewed failure before its fix:

- canonical parsed requests/results could not safely serialize or reparse;
- a file growing after `stat` could be read beyond its configured ceiling;
- an unknown `schemaVersion` could fall through to the V1 adapter;
- client-side directory, write and cancellation-marker errors exposed filesystem detail;
- malformed V1 `null` output exposed a native error;
- arbitrary warning strings could cross the trust boundary;
- parser-service had no concrete V2 stage processor;
- the production parser image omitted the compiled V2 protocol module.

GREEN behavior now provides:

- exact V2 request, options, response and stage-result validation with proxy, accessor, sparse-array, symbol, prototype, `toJSON`, private-field and unknown-field rejection;
- fixed page, block, text, warning, geometry, confidence, request and 24 MiB serialized-response budgets;
- canonical null-prototype snapshots that remain serializable and reparsable;
- success and error response envelopes remain closed under deserialize, serialize and deserialize; a module-private provenance marker admits only validator-created null-prototype envelopes, while forged null-prototype inputs remain rejected;
- closed error and warning enums only, with no provider stderr, document fragments or absolute paths crossing the boundary or entering parser-service logs;
- handle-based `limit + 1` reads after regular-file and no-follow checks for inputs, requests and responses, followed by SHA-256 verification for V2 input;
- atomic request-to-processing and response-temp-to-response publication, timeout/cancellation race handling and orphan reaping;
- exact V1 dispatch only when the version field is absent, and fail-closed rejection of every unknown version;
- a provider-neutral transition processor that serves `extract_text` through the isolated PDF/DOCX/image adapters, emits bounded `partial_result` stage pages, and rejects unsupported V2 operations/options;
- a loadable production module graph: `Dockerfile.parser` copies the compiled protocol module, while external runtime imports remain limited to Node built-ins plus the already-installed `pdf-parse` and `mammoth` packages.

The transition processor is deliberately narrower than the later structured parser: it does not claim physical layout and marks output partial. Task 3 owns deterministic `DocumentSourceMap` construction and locator integration; unsupported operations fail closed until that implementation replaces the transition seam.

## Independent review and fresh validation

The first security/architecture review found four Important boundary issues and the missing runtime composition. After TDD corrections, a second pass found the production-image module omission. The final re-review found no Critical, Important or Minor issue and returned **ready**; it also verified that the compiled module graph loads with the parser-image dependencies.

Fresh local gates:

- Focused protocol/isolation tests: 51/51 passed.
- Full `@openscience/agent-worker` tests: 190/190 passed across 16 files.
- `npx pnpm@9.15.0 --filter @openscience/agent-worker build`: passed.
- `npx pnpm@9.15.0 --filter @openscience/agent-worker typecheck`: passed.
- Targeted ESLint over the Task 2 TypeScript files: passed.
- `npx pnpm@9.15.0 --filter @openscience/agent-worker selftest:document-contract`: printed exactly `DOCUMENT_PARSER_CONTRACT_OK`.
- `git diff --check`: passed.

Docker was not run locally, and no `.env` file was read or printed. Actual parser-image build/start and `.ready` evidence remain an ECS final-acceptance step under the plan constraints, not an incomplete Task 2 code gate.

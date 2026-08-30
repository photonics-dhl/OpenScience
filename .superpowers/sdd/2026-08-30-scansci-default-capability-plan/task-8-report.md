# Task 8 Report — Literature acquisition entry points

## Status

- Result: DONE locally / production acceptance pending Task 10.
- Feature commit: `8238a9f863bf937ba9ecc8df34b7049ef56893cf`.
- Branch: `codex/scansci-default-capability`.
- Production release/rollback remain `689331845574612130f223d08c92e61721c16586` / `c435c4c8b2800bb20998fd9a9a93f2db96328661`.

## Implemented contract

- Hermes classifies DOI/arXiv and explicit bounded Chinese/English find/download-paper intent locally; ambiguous source-control/bug-source goals and unrelated research goals remain `workspace.guide`.
- Title-only explicit intent submits query-only metadata; identifier intent submits the shared identifier grammar.
- Dashboard targets Personal; RO Hermes, RO Files/Evidence and an RO-route Drawer target the active RO.
- Every surface composes the Task 7 `LiteratureAcquisition` state machine, API, idempotency namespace, recovery/poll/retry and temporary-document download path.
- Native 44px disclosures, unique input IDs, paper/dark semantic tokens, bilingual copy and a within-form control avoid cards, duplicate labels, nested forms, competing Drawer live regions and focus theft.
- No provider, account, CARSI, mode or institution control is rendered.

## RED evidence

1. `vitest run test/hermes-literature-intent.test.tsx`: failed on missing `@/lib/hermes/literature-intent`.
2. `vitest run test/literature-acquisition.test.tsx`: failed because target/tone/initial query, disclosure, RO copy and unique input ID were absent.
3. `vitest run test/surface-shells.test.tsx`: failed because Evidence Intake, RO Hermes and RO Files lacked a literature entry; the nested-form regression later failed with two `<form>` elements instead of one.
4. `vitest run test/hermes-state.test.tsx`: failed because the Drawer lacked deterministic literature routing.
5. First `test:release`: `59/72` passed; Dashboard fixtures missed Task 7's recovery query and Evidence Intake hydrated invalid nested forms. Narrow rerun after the fixes was `3/3`.
6. First `test:hermes-companion-release`: performance gate timed out because three legacy Dashboard fixtures omitted the same Task 7 recovery GET.
7. Independent review additions failed as intended: `get source control working` and `find source of the bug` misrouted to acquisition, and `selectLiteratureRecoveryTask` was absent.

## Final GREEN evidence

- Focused intent/acquisition/state contracts after review: `38/38`.
- Full Web: `61/61` files, `462/462` Vitest plus `5/5` Node contracts.
- Web typecheck: exit `0`.
- Web production build: exit `0`, `19/19` static pages generated.
- Product release browser gate: `72/72` in `3.3m`, including three intake viewports, three Files viewports, RO review, 320px compact navigation and Hermes journeys.
- Hermes Workspace Companion gate: exit `0`; first-ready `943ms`, idle/pointer p95 `16.7ms`, zero cadence drops, `2,603,570` transferred bytes, compatible runtime `19/19`, product Hermes `8/8`.
- Targeted ESLint and `git diff --check`: exit `0`.
- Root lint/workspace/docs-sync, explicit docs-sync `8/8`, Markdown lint `238` files and final diff check: exit `0`.

## Review and remaining boundary

- Independent review's recovery and ambiguous-source findings were fixed and reverified. Its Dashboard-to-RO suggestion was rejected because the locked Task 8 direction explicitly requires Dashboard to target Personal.
- No Docker, ECS, production, Secret, `.env` or installation action was performed.
- Real 375px OA/CARSI, one-use download and production deployment remain Task 10 acceptance work; this report does not mark Task 10 done.
